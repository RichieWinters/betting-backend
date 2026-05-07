import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

// Shared date used across all test bets
const BET_DATE = new Date('2026-01-15T10:00:00Z');

/**
 * Parse a single CSV row into fields, correctly handling quoted values that
 * contain commas (e.g. date strings like "Jan 15, 2026 10:00:00").
 */
function parseCsvRow(row: string): string[] {
  const fields: string[] = [];
  let inQuotes = false;
  let current = '';
  for (const char of row) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/** Build a minimal bet record that satisfies the Prisma include shape used by ReportsService. */
function makeBet(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 10,
    matchId: 100,
    team: 'NaVi',
    amount: 200,
    payout: 0,
    result: null as string | null,
    multiplier: 1.9,
    createdAt: BET_DATE,
    user: { name: 'Alice' },
    match: {
      teamA: 'NaVi',
      teamB: 'Virtus.pro',
      status: 'COMPLETED',
      winner: 'NaVi',
      sportType: 'DOTA2',
    },
    ...overrides,
  };
}

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrisma = {
    bet: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    jest.clearAllMocks();
  });

  // ─── generateUserBetsReport ────────────────────────────────────────────────

  describe('generateUserBetsReport', () => {
    const params = { startDate: '2026-01-01', endDate: '2026-01-31', userId: 10 };

    it('header row equals the expected column names', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([]);

      const csv = await service.generateUserBetsReport(params);

      expect(csv.split('\n')[0]).toBe(
        'Bet ID,User ID,User Name,Match ID,Team A,Team B,Bet Team,Amount,Bet Date,Match Status,Winner,Result,Sport Type',
      );
    });

    it('produces one data row per bet (total lines = bets.length + 1)', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([makeBet(), makeBet({ id: 2 })]);

      const csv = await service.generateUserBetsReport(params);

      expect(csv.split('\n').length).toBe(3);
    });

    it('passes gte: startDate and lte: endDate at 23:59:59.999 to Prisma', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([]);

      await service.generateUserBetsReport(params);

      const callArg = mockPrisma.bet.findMany.mock.calls[0][0] as {
        where: { createdAt: { gte: Date; lte: Date } };
      };
      expect(callArg.where.createdAt.gte).toEqual(new Date('2026-01-01'));
      const lte = callArg.where.createdAt.lte;
      expect(lte.getHours()).toBe(23);
      expect(lte.getMinutes()).toBe(59);
      expect(lte.getSeconds()).toBe(59);
      expect(lte.getMilliseconds()).toBe(999);
    });

    it('returns only the header line for an empty result set', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([]);

      const csv = await service.generateUserBetsReport(params);

      expect(csv.split('\n').length).toBe(1);
    });
  });

  // ─── calculateResult (exercised via generateUserBetsReport) ────────────────

  describe('calculateResult', () => {
    const params = { startDate: '2026-01-01', endDate: '2026-01-31', userId: 10 };

    /**
     * Extract the Result column from the first data row.
     * Uses parseCsvRow to handle the date field that contains a comma.
     * Headers: Bet ID(0) User ID(1) User Name(2) Match ID(3) Team A(4)
     *          Team B(5) Bet Team(6) Amount(7) Bet Date(8) Match Status(9)
     *          Winner(10) Result(11) Sport Type(12)
     */
    const getResultColumn = (csv: string) =>
      parseCsvRow(csv.split('\n')[1])[11];

    it('returns WIN when bet.result is already "WIN"', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([makeBet({ result: 'WIN' })]);

      const csv = await service.generateUserBetsReport(params);

      expect(getResultColumn(csv)).toBe('WIN');
    });

    it('returns CANCELLED when match status is CANCELLED', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([
        makeBet({
          result: null,
          match: {
            teamA: 'NaVi',
            teamB: 'Virtus.pro',
            status: 'CANCELLED',
            winner: null,
            sportType: 'DOTA2',
          },
        }),
      ]);

      const csv = await service.generateUserBetsReport(params);

      expect(getResultColumn(csv)).toBe('CANCELLED');
    });

    it('returns PENDING when match status is IN_PROGRESS', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([
        makeBet({
          result: null,
          match: {
            teamA: 'NaVi',
            teamB: 'Virtus.pro',
            status: 'IN_PROGRESS',
            winner: null,
            sportType: 'DOTA2',
          },
        }),
      ]);

      const csv = await service.generateUserBetsReport(params);

      expect(getResultColumn(csv)).toBe('PENDING');
    });

    it('returns DRAW when match is COMPLETED with no winner', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([
        makeBet({
          result: null,
          match: {
            teamA: 'NaVi',
            teamB: 'Virtus.pro',
            status: 'COMPLETED',
            winner: null,
            sportType: 'DOTA2',
          },
        }),
      ]);

      const csv = await service.generateUserBetsReport(params);

      expect(getResultColumn(csv)).toBe('DRAW');
    });

    it('returns WIN when match is COMPLETED and bet.team === winner', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([
        makeBet({
          result: null,
          team: 'NaVi',
          match: {
            teamA: 'NaVi',
            teamB: 'Virtus.pro',
            status: 'COMPLETED',
            winner: 'NaVi',
            sportType: 'DOTA2',
          },
        }),
      ]);

      const csv = await service.generateUserBetsReport(params);

      expect(getResultColumn(csv)).toBe('WIN');
    });

    it('returns LOSS when match is COMPLETED and bet.team !== winner', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([
        makeBet({
          result: null,
          team: 'Virtus.pro',
          match: {
            teamA: 'NaVi',
            teamB: 'Virtus.pro',
            status: 'COMPLETED',
            winner: 'NaVi',
            sportType: 'DOTA2',
          },
        }),
      ]);

      const csv = await service.generateUserBetsReport(params);

      expect(getResultColumn(csv)).toBe('LOSS');
    });
  });

  // ─── generateAggregatedStatsReport ────────────────────────────────────────

  describe('generateAggregatedStatsReport', () => {
    const params = { startDate: '2026-01-01', endDate: '2026-01-31' };

    /** Build a bet for the aggregated stats report. */
    const makeStatsBet = (
      sportType: string,
      result: string,
      amount: number,
      payout = 0,
    ) => ({
      id: Math.random(),
      userId: 1,
      matchId: 1,
      team: 'NaVi',
      amount,
      payout,
      result,
      multiplier: 1.9,
      createdAt: BET_DATE,
      user: { name: 'Alice' },
      match: {
        teamA: 'NaVi',
        teamB: 'Virtus.pro',
        status: 'COMPLETED',
        winner: result === 'WIN' ? 'NaVi' : 'Virtus.pro',
        sportType,
      },
    });

    it('produces one row per sport type (before the ALL totals row)', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([
        makeStatsBet('DOTA2', 'WIN', 200, 380),
        makeStatsBet('CS2', 'LOSS', 100),
      ]);

      const csv = await service.generateAggregatedStatsReport(params);
      const lines = csv.split('\n');

      // header + CS2 row + DOTA2 row + ALL row = 4 lines
      expect(lines.length).toBe(4);
    });

    it('appends a totals row with "ALL" in the Sport Type column', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([
        makeStatsBet('DOTA2', 'WIN', 200, 380),
      ]);

      const csv = await service.generateAggregatedStatsReport(params);
      const lines = csv.split('\n');
      const lastFields = parseCsvRow(lines[lines.length - 1]);

      // Column 2 (Sport Type) should be ALL
      expect(lastFields[2]).toBe('ALL');
    });

    it('WIN bet payout appears in the Total Winnings column', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([
        makeStatsBet('DOTA2', 'WIN', 200, 380),
      ]);

      const csv = await service.generateAggregatedStatsReport(params);
      // header (index 0) + DOTA2 sport row (index 1)
      const sportRowFields = parseCsvRow(csv.split('\n')[1]);

      // Column 4 is Total Winnings
      expect(sportRowFields[4]).toBe('380.00');
    });

    it('LOSS bet amount appears in the Total Losses column', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([
        makeStatsBet('DOTA2', 'LOSS', 100),
      ]);

      const csv = await service.generateAggregatedStatsReport(params);
      const sportRowFields = parseCsvRow(csv.split('\n')[1]);

      // Column 5 is Total Losses
      expect(sportRowFields[5]).toBe('100.00');
    });

    it('returns only the header line for an empty result set', async () => {
      mockPrisma.bet.findMany.mockResolvedValue([]);

      const csv = await service.generateAggregatedStatsReport(params);

      expect(csv.split('\n').length).toBe(1);
    });
  });
});
