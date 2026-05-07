import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MatchService } from './match.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MatchService', () => {
  let service: MatchService;

  // Transaction-scoped mock client — passed as `tx` to $transaction callbacks
  const txMock = {
    match: {
      update: jest.fn(),
    },
    bet: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  };

  const mockPrisma = {
    match: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    bet: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MatchService>(MatchService);
    jest.resetAllMocks();
    // Restore $transaction to execute the callback with txMock after each reset
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
    );
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('calls findMany with { where: { status: { not: "DELETED" } } }', async () => {
      mockPrisma.match.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(mockPrisma.match.findMany).toHaveBeenCalledWith({
        where: { status: { not: 'DELETED' } },
      });
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('calls prisma.match.create; converts date string to Date object', async () => {
      const dto = {
        date: '2026-03-15T20:00:00Z',
        sportType: 'DOTA2' as const,
        teamA: 'NaVi',
        teamB: 'Virtus.pro',
      };
      mockPrisma.match.create.mockResolvedValue({ id: 1, ...dto });

      await service.create(dto);

      expect(mockPrisma.match.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ date: new Date(dto.date) }),
      });
    });
  });

  // ─── update — routing logic ────────────────────────────────────────────────

  describe('update', () => {
    it('throws BadRequestException when match is not found', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(null);

      await expect(service.update(999, {})).rejects.toThrow(
        new BadRequestException('Match not found'),
      );
    });

    it('enters $transaction when status is COMPLETED with a winner', async () => {
      mockPrisma.match.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        winner: null,
      });
      txMock.match.update.mockResolvedValue({
        id: 1,
        status: 'COMPLETED',
        winner: 'NaVi',
      });
      txMock.bet.findMany.mockResolvedValue([]);

      await service.update(1, { status: 'COMPLETED' as never, winner: 'NaVi' });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('calls match.update directly (no transaction) when COMPLETED without winner', async () => {
      mockPrisma.match.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        winner: null,
      });
      mockPrisma.match.update.mockResolvedValue({
        id: 1,
        status: 'COMPLETED',
        winner: null,
      });

      await service.update(1, { status: 'COMPLETED' as never });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.match.update).toHaveBeenCalled();
    });

    it('enters $transaction when status is CANCELLED', async () => {
      mockPrisma.match.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        winner: null,
      });
      txMock.match.update.mockResolvedValue({ id: 1, status: 'CANCELLED' });
      txMock.bet.findMany.mockResolvedValue([]);

      await service.update(1, { status: 'CANCELLED' as never });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('calls match.update directly for a simple status change (IN_PROGRESS)', async () => {
      mockPrisma.match.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        winner: null,
      });
      mockPrisma.match.update.mockResolvedValue({
        id: 1,
        status: 'IN_PROGRESS',
      });

      await service.update(1, { status: 'IN_PROGRESS' as never });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.match.update).toHaveBeenCalled();
    });
  });

  // ─── completeMatchWithPayouts (via update COMPLETED + winner) ───────────────

  describe('completeMatchWithPayouts', () => {
    const winBet = {
      id: 1,
      team: 'NaVi',
      amount: 200,
      multiplier: 1.9,
      result: 'PENDING',
      userId: 10,
    };
    const lossBet = {
      id: 2,
      team: 'Virtus.pro',
      amount: 100,
      multiplier: 1.9,
      result: 'PENDING',
      userId: 11,
    };
    const settledBet = {
      id: 3,
      team: 'NaVi',
      amount: 50,
      multiplier: 1.9,
      result: 'WIN',
      userId: 12,
    };

    beforeEach(() => {
      mockPrisma.match.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        winner: null,
      });
      txMock.match.update.mockResolvedValue({
        id: 1,
        status: 'COMPLETED',
        winner: 'NaVi',
      });
    });

    it('WIN bet: updated with WIN result and payout = amount × multiplier; user balance incremented', async () => {
      txMock.bet.findMany.mockResolvedValue([winBet]);

      await service.update(1, { status: 'COMPLETED' as never, winner: 'NaVi' });

      expect(txMock.bet.update).toHaveBeenCalledWith({
        where: { id: winBet.id },
        data: { result: 'WIN', payout: winBet.amount * winBet.multiplier },
      });
      expect(txMock.user.update).toHaveBeenCalledWith({
        where: { id: winBet.userId },
        data: { balance: { increment: winBet.amount * winBet.multiplier } },
      });
    });

    it('LOSS bet: updated with LOSS result and payout 0; user.update is not called', async () => {
      txMock.bet.findMany.mockResolvedValue([lossBet]);

      await service.update(1, { status: 'COMPLETED' as never, winner: 'NaVi' });

      expect(txMock.bet.update).toHaveBeenCalledWith({
        where: { id: lossBet.id },
        data: { result: 'LOSS', payout: 0 },
      });
      expect(txMock.user.update).not.toHaveBeenCalled();
    });

    it('already-settled bet is skipped entirely', async () => {
      txMock.bet.findMany.mockResolvedValue([settledBet]);

      await service.update(1, { status: 'COMPLETED' as never, winner: 'NaVi' });

      expect(txMock.bet.update).not.toHaveBeenCalled();
      expect(txMock.user.update).not.toHaveBeenCalled();
    });

    it('multiple bets: WIN and LOSS both settled correctly in one call', async () => {
      txMock.bet.findMany.mockResolvedValue([winBet, lossBet]);

      await service.update(1, { status: 'COMPLETED' as never, winner: 'NaVi' });

      expect(txMock.bet.update).toHaveBeenCalledTimes(2);
      expect(txMock.user.update).toHaveBeenCalledTimes(1);
      expect(txMock.user.update).toHaveBeenCalledWith({
        where: { id: winBet.userId },
        data: { balance: { increment: winBet.amount * winBet.multiplier } },
      });
    });
  });

  // ─── cancelMatchWithRefunds (via update CANCELLED) ─────────────────────────

  describe('cancelMatchWithRefunds', () => {
    const pendingBet = {
      id: 1,
      team: 'NaVi',
      amount: 200,
      result: 'PENDING',
      userId: 10,
    };
    const settledBet = {
      id: 2,
      team: 'Virtus.pro',
      amount: 100,
      result: 'WIN',
      userId: 11,
    };

    beforeEach(() => {
      mockPrisma.match.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        winner: null,
      });
      txMock.match.update.mockResolvedValue({ id: 1, status: 'CANCELLED' });
    });

    it('PENDING bet refunded: result set to CANCELLED, payout equals amount, balance incremented', async () => {
      txMock.bet.findMany.mockResolvedValue([pendingBet]);

      await service.update(1, { status: 'CANCELLED' as never });

      expect(txMock.bet.update).toHaveBeenCalledWith({
        where: { id: pendingBet.id },
        data: { result: 'CANCELLED', payout: pendingBet.amount },
      });
      expect(txMock.user.update).toHaveBeenCalledWith({
        where: { id: pendingBet.userId },
        data: { balance: { increment: pendingBet.amount } },
      });
    });

    it('already-settled bet is skipped', async () => {
      txMock.bet.findMany.mockResolvedValue([settledBet]);

      await service.update(1, { status: 'CANCELLED' as never });

      expect(txMock.bet.update).not.toHaveBeenCalled();
      expect(txMock.user.update).not.toHaveBeenCalled();
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('throws BadRequestException when match is not found', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(null);

      await expect(service.delete(999)).rejects.toThrow(
        new BadRequestException('Match not found'),
      );
    });

    it('throws BadRequestException for a COMPLETED match', async () => {
      mockPrisma.match.findUnique.mockResolvedValue({
        id: 1,
        status: 'COMPLETED',
      });

      await expect(service.delete(1)).rejects.toThrow(
        new BadRequestException('Cannot delete completed matches'),
      );
    });

    it('soft-deletes the match, refunds PENDING bets, and skips already-settled bets', async () => {
      mockPrisma.match.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
      });
      txMock.match.update.mockResolvedValue({ id: 1, status: 'DELETED' });

      const pendingBet = { id: 1, amount: 300, result: 'PENDING', userId: 5 };
      const settledBet = { id: 2, amount: 100, result: 'WIN', userId: 6 };
      txMock.bet.findMany.mockResolvedValue([pendingBet, settledBet]);

      await service.delete(1);

      expect(txMock.match.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'DELETED' },
      });
      // Only the pending bet should be touched
      expect(txMock.bet.update).toHaveBeenCalledTimes(1);
      expect(txMock.bet.update).toHaveBeenCalledWith({
        where: { id: pendingBet.id },
        data: { result: 'CANCELLED', payout: pendingBet.amount },
      });
      expect(txMock.user.update).toHaveBeenCalledTimes(1);
      expect(txMock.user.update).toHaveBeenCalledWith({
        where: { id: pendingBet.userId },
        data: { balance: { increment: pendingBet.amount } },
      });
    });
  });
});
