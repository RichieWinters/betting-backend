import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BetService } from './bet.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BetService', () => {
  let service: BetService;

  const mockUser = {
    id: 1,
    name: 'Michael',
    balance: 1000,
  };

  const mockMatch = {
    id: 1,
    teamA: 'NaVi',
    teamB: 'Virtus.pro',
    status: 'PENDING',
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    match: {
      findUnique: jest.fn(),
    },
    bet: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BetService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<BetService>(BetService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create - Validation Logic', () => {
    it('should reject bet when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          userId: 999,
          matchId: 1,
          amount: 100,
          team: 'NaVi',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create({
          userId: 999,
          matchId: 1,
          amount: 100,
          team: 'NaVi',
        }),
      ).rejects.toThrow('User not found');
    });

    it('should reject bet when match does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.match.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          userId: 1,
          matchId: 999,
          amount: 100,
          team: 'NaVi',
        }),
      ).rejects.toThrow('Match not found');
    });

    it('should reject bet when match is not PENDING', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.match.findUnique.mockResolvedValue({
        ...mockMatch,
        status: 'IN_PROGRESS',
      });

      await expect(
        service.create({
          userId: 1,
          matchId: 1,
          amount: 100,
          team: 'NaVi',
        }),
      ).rejects.toThrow('Can only bet on pending matches');
    });

    it('should reject bet when team does not match', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.match.findUnique.mockResolvedValue(mockMatch);

      await expect(
        service.create({
          userId: 1,
          matchId: 1,
          amount: 100,
          team: 'WrongTeam',
        }),
      ).rejects.toThrow('Team must be either "NaVi" or "Virtus.pro"');
    });

    it('should reject bet when user has insufficient balance', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        balance: 50,
      });
      mockPrisma.match.findUnique.mockResolvedValue(mockMatch);

      await expect(
        service.create({
          userId: 1,
          matchId: 1,
          amount: 100,
          team: 'NaVi',
        }),
      ).rejects.toThrow('Insufficient balance');
    });

    it('should allow bet when balance equals bet amount', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        balance: 100,
      });
      mockPrisma.match.findUnique.mockResolvedValue(mockMatch);
      mockPrisma.$transaction.mockImplementation(
        (callback: (prisma: typeof mockPrisma) => unknown) => {
          return callback(mockPrisma);
        },
      );
      mockPrisma.bet.create.mockResolvedValue({
        id: 1,
        userId: 1,
        matchId: 1,
        amount: 100,
        team: 'NaVi',
      });

      await service.create({
        userId: 1,
        matchId: 1,
        amount: 100,
        team: 'NaVi',
      });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('create - Balance Deduction', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.match.findUnique.mockResolvedValue(mockMatch);
      mockPrisma.$transaction.mockImplementation(
        (callback: (prisma: typeof mockPrisma) => unknown) => {
          return callback(mockPrisma);
        },
      );
      mockPrisma.bet.create.mockResolvedValue({
        id: 1,
        userId: 1,
        matchId: 1,
        amount: 200,
        team: 'NaVi',
      });
    });

    it('should deduct correct amount from user balance', async () => {
      await service.create({
        userId: 1,
        matchId: 1,
        amount: 200,
        team: 'NaVi',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { balance: 800 }, // 1000 - 200
      });
    });

    it('should create bet with correct data', async () => {
      const betDto = {
        userId: 1,
        matchId: 1,
        amount: 150,
        team: 'Virtus.pro',
      };

      await service.create(betDto);

      expect(mockPrisma.bet.create).toHaveBeenCalledWith({
        data: betDto,
        include: {
          user: { select: { id: true, name: true, balance: true } },
          match: true,
        },
      });
    });
  });
});
