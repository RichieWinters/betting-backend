import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UserService', () => {
  let service: UserService;

  const mockUsers = [
    {
      id: 1,
      name: 'Michael',
      balance: 1000,
      email: 'michael@meandmichael.com',
      password: 'password123',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      name: 'Bob',
      balance: 500,
      email: 'bob@bob.com',
      password: 'password12345',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockPrisma = {
    user: {
      findMany: jest.fn().mockResolvedValue(mockUsers),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue(mockUsers[0]),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    jest.clearAllMocks();
    // Restore default resolved values after clearAllMocks resets call history
    mockPrisma.user.findMany.mockResolvedValue(mockUsers);
    mockPrisma.user.create.mockResolvedValue(mockUsers[0]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should use provided balance', async () => {
      const createUserDto = {
        name: 'Alice',
        balance: 500,
        email: 'alice@alice.com',
        password: 'password123',
      };
      await service.create(createUserDto);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Alice',
            balance: 500,
            email: 'alice@alice.com',
            password: 'password123',
          },
        }),
      );
    });

    it('should use default balance (1000) when not provided', async () => {
      const createUserDto = {
        name: 'Bob',
        email: 'bob@bob.com',
        password: 'password12345',
      };
      await service.create(createUserDto);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Bob',
            balance: 1000,
            email: 'bob@bob.com',
            password: 'password12345',
          },
        }),
      );
    });

    it('should use default balance (1000) when balance is undefined', async () => {
      const createUserDto = {
        name: 'Charlie',
        balance: undefined,
        email: 'charlie@charlie.com',
        password: 'password123456',
      };
      await service.create(createUserDto);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Charlie',
            balance: 1000,
            email: 'charlie@charlie.com',
            password: 'password123456',
          },
        }),
      );
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('calls findMany with a select that omits password and resetToken fields', async () => {
      await service.findAll();

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.not.objectContaining({
            password: expect.anything(),
            resetToken: expect.anything(),
          }),
        }),
      );
    });
  });

  // ─── banUser / unbanUser ───────────────────────────────────────────────────

  describe('banUser', () => {
    it('calls prisma.user.update with isBanned: true', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 1, isBanned: true });

      await service.banUser(1);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isBanned: true },
      });
    });
  });

  describe('unbanUser', () => {
    it('calls prisma.user.update with isBanned: false', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 1, isBanned: false });

      await service.unbanUser(1);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isBanned: false },
      });
    });
  });

  // ─── replenish ─────────────────────────────────────────────────────────────

  describe('replenish', () => {
    it('increments balance and uses a select block that omits password', async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 1,
        balance: 1500,
        email: 'alice@alice.com',
      });

      await service.replenish(1, 500);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { balance: { increment: 500 } },
          select: expect.not.objectContaining({ password: expect.anything() }),
        }),
      );
    });
  });

  // ─── getMyProfile ──────────────────────────────────────────────────────────

  describe('getMyProfile', () => {
    it('calls findUnique with the user id and a select block', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, name: 'Alice' });

      await service.getMyProfile(1);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: expect.any(Object),
      });
    });
  });
});
