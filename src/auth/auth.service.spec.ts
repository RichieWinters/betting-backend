import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../email/email.service';

// Mock the entire bcrypt module so its functions are reconfigurable jest.fn()s
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
  };

  const mockEmailService = {
    sendPasswordResetEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.resetAllMocks();
    mockJwtService.sign.mockReturnValue('mock-token');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('hashes the password (not plaintext) and returns token + user without password field', async () => {
      jest.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as never);

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 1,
        name: 'Alice',
        email: 'alice@test.com',
        password: 'hashed-pw',
        role: 'USER',
      });

      const result = await service.register({
        name: 'Alice',
        email: 'alice@test.com',
        password: 'plaintext123',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('plaintext123', 10);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ password: 'hashed-pw' }),
        }),
      );
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      expect(result.user).not.toHaveProperty('password');
    });

    it('throws BadRequestException when email is already in use', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'alice@test.com',
      });

      await expect(
        service.register({
          name: 'Alice',
          email: 'alice@test.com',
          password: 'pw123456',
        }),
      ).rejects.toThrow(new BadRequestException('Email already in use'));
    });
  });

  describe('login', () => {
    it('returns user and token; jwtService.sign called with sub, email, role', async () => {
      const mockUser = {
        id: 1,
        name: 'Alice',
        email: 'alice@test.com',
        password: 'hashed-pw',
        role: 'USER',
        isBanned: false,
      };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.login({
        email: 'alice@test.com',
        password: 'pw123456',
      });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });

    it('throws UnauthorizedException when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@test.com', password: 'pw123456' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('throws UnauthorizedException when user is banned', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 1,
        isBanned: true,
        password: 'hashed-pw',
      });

      await expect(
        service.login({ email: 'alice@test.com', password: 'pw123456' }),
      ).rejects.toThrow(new UnauthorizedException('Account is banned'));
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 1,
        isBanned: false,
        password: 'hashed-pw',
      });
      jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        service.login({ email: 'alice@test.com', password: 'wrongpw' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });
  });

  describe('forgotPassword', () => {
    it('returns safe message and never calls emailService when email is unknown', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'nobody@test.com',
      });

      expect(result).toEqual({
        message: 'If email exists, reset link will be sent',
      });
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('saves resetToken + resetTokenExpiry and calls emailService when email is known', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'alice@test.com',
      });
      mockPrismaService.user.update.mockResolvedValue({});

      await service.forgotPassword({ email: 'alice@test.com' });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resetToken: expect.any(String),
            resetTokenExpiry: expect.any(Date),
          }),
        }),
      );
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetPassword', () => {
    it('throws BadRequestException for an invalid or expired token', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'bad-token', newPassword: 'newpw123' }),
      ).rejects.toThrow(
        new BadRequestException('Invalid or expired reset token'),
      );
    });

    it('saves hashed new password and clears resetToken and resetTokenExpiry', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 1 });
      mockPrismaService.user.update.mockResolvedValue({});
      jest.mocked(bcrypt.hash).mockResolvedValue('hashed-new-pw' as never);

      await service.resetPassword({
        token: 'valid-token',
        newPassword: 'newpw123',
      });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            password: 'hashed-new-pw',
            resetToken: null,
            resetTokenExpiry: null,
          }),
        }),
      );
    });
  });

  describe('validateUser', () => {
    it('returns user object; select block does not include password field', async () => {
      const mockUser = {
        id: 1,
        name: 'Alice',
        email: 'alice@test.com',
        role: 'USER',
        isBanned: false,
        balance: 1000,
      };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.validateUser(1);

      expect(result).toEqual(mockUser);
      const callArg = mockPrismaService.user.findUnique.mock
        .calls[0][0] as { select?: Record<string, unknown> };
      expect(callArg.select).not.toHaveProperty('password');
    });

    it('returns null when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser(999);

      expect(result).toBeNull();
    });
  });
});
