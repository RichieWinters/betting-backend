import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserBetsReportDto } from './dto/user-bets-report.dto';
import { AggregatedStatsReportDto } from './dto/aggregated-stats-report.dto';
import { CsvGenerator } from './utils/csv-generator';
import { AggregatedStatsRow } from './interfaces/report.interface';
import { Bet, Match, Status } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async generateUserBetsReport(params: UserBetsReportDto): Promise<string> {
    const bets = await this.prisma.bet.findMany({
      where: {
        userId: params.userId,
        createdAt: {
          gte: new Date(params.startDate),
          lte: new Date(params.endDate),
        },
      },
      include: {
        user: true,
        match: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const rows: (string | number)[][] = bets.map((bet) => {
      const result = this.calculateResult(bet);
      return [
        bet.id,
        bet.userId,
        bet.user.name,
        bet.matchId,
        bet.match.teamA,
        bet.match.teamB,
        bet.team,
        bet.amount,
        bet.createdAt.toISOString(),
        bet.match.status,
        bet.match.winner || '',
        result,
        bet.match.sportType,
      ];
    });

    const headers = [
      'betId',
      'userId',
      'userName',
      'matchId',
      'teamA',
      'teamB',
      'betTeam',
      'amount',
      'betDate',
      'matchStatus',
      'winner',
      'result',
      'sportType',
    ];

    return CsvGenerator.generate(headers, rows);
  }

  async generateAggregatedStatsReport(
    params: AggregatedStatsReportDto,
  ): Promise<string> {
    const bets = await this.prisma.bet.findMany({
      where: {
        createdAt: {
          gte: new Date(params.startDate),
          lte: new Date(params.endDate),
        },
      },
      include: {
        match: true,
        user: true,
      },
    });

    const monthSportMap = new Map<string, Map<string, AggregatedStatsRow>>();

    for (const bet of bets) {
      const betDate = new Date(bet.createdAt);
      const monthStart = new Date(betDate.getFullYear(), betDate.getMonth(), 1);
      const monthEnd = new Date(
        betDate.getFullYear(),
        betDate.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      const monthKey = monthStart.toISOString().split('T')[0];
      const sportType = bet.match.sportType;

      if (!monthSportMap.has(monthKey)) {
        monthSportMap.set(monthKey, new Map());
      }

      const sportMap = monthSportMap.get(monthKey)!;

      if (!sportMap.has(sportType)) {
        sportMap.set(sportType, {
          monthStart: monthStart.toISOString(),
          monthEnd: monthEnd.toISOString(),
          sportType,
          totalBets: 0,
          totalWinnings: 0,
          totalLosses: 0,
          betCount: 0,
          playerCount: 0,
        });
      }

      const stats = sportMap.get(sportType)!;
      stats.betCount++;
      stats.totalBets += bet.amount;

      const result = this.calculateResult(bet);
      if (result === 'WIN') {
        stats.totalWinnings += bet.amount * 2;
      } else if (result === 'LOSS') {
        stats.totalLosses += bet.amount;
      }
    }

    for (const [monthKey, sportMap] of monthSportMap.entries()) {
      const uniqueUsers = new Set<number>();

      for (const bet of bets) {
        const betDate = new Date(bet.createdAt);
        const betMonthKey = new Date(
          betDate.getFullYear(),
          betDate.getMonth(),
          1,
        )
          .toISOString()
          .split('T')[0];

        if (betMonthKey === monthKey) {
          uniqueUsers.add(bet.userId);
        }
      }

      for (const stats of sportMap.values()) {
        stats.playerCount = uniqueUsers.size;
      }
    }

    const allRows: (string | number)[][] = [];

    const sortedMonths = Array.from(monthSportMap.keys()).sort();

    for (const monthKey of sortedMonths) {
      const sportMap = monthSportMap.get(monthKey)!;
      const sortedSports = Array.from(sportMap.values()).sort((a, b) =>
        a.sportType.localeCompare(b.sportType),
      );

      let monthTotalBets = 0;
      let monthTotalWinnings = 0;
      let monthTotalLosses = 0;
      let monthBetCount = 0;
      let monthPlayerCount = 0;

      for (const stats of sortedSports) {
        allRows.push([
          stats.monthStart,
          stats.monthEnd,
          stats.sportType,
          stats.totalBets.toFixed(2),
          stats.totalWinnings.toFixed(2),
          stats.totalLosses.toFixed(2),
          stats.betCount,
          stats.playerCount,
        ]);

        monthTotalBets += stats.totalBets;
        monthTotalWinnings += stats.totalWinnings;
        monthTotalLosses += stats.totalLosses;
        monthBetCount += stats.betCount;
        monthPlayerCount = stats.playerCount;
      }

      const firstStats = sortedSports[0];
      allRows.push([
        firstStats.monthStart,
        firstStats.monthEnd,
        'ALL',
        monthTotalBets.toFixed(2),
        monthTotalWinnings.toFixed(2),
        monthTotalLosses.toFixed(2),
        monthBetCount,
        monthPlayerCount,
      ]);
    }

    const headers = [
      'monthStart',
      'monthEnd',
      'sportType',
      'totalBets',
      'totalWinnings',
      'totalLosses',
      'betCount',
      'playerCount',
    ];

    return CsvGenerator.generate(headers, allRows);
  }

  private calculateResult(bet: Bet & { match: Match }): string {
    if (bet.match.status === Status.CANCELLED) {
      return 'CANCELLED';
    }
    if (bet.match.status !== Status.COMPLETED) {
      return 'PENDING';
    }
    if (!bet.match.winner) {
      return 'DRAW';
    }
    return bet.team === bet.match.winner ? 'WIN' : 'LOSS';
  }
}
