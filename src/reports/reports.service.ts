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
    const startDate = new Date(params.startDate);
    const endDate = new Date(params.endDate);
    endDate.setHours(23, 59, 59, 999);

    const bets = await this.prisma.bet.findMany({
      where: {
        userId: params.userId,
        createdAt: {
          gte: startDate,
          lte: endDate,
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
        this.formatDateTime(bet.createdAt),
        bet.match.status,
        bet.match.winner || '',
        result,
        bet.match.sportType,
      ];
    });

    const headers = [
      'Bet ID',
      'User ID',
      'User Name',
      'Match ID',
      'Team A',
      'Team B',
      'Bet Team',
      'Amount',
      'Bet Date',
      'Match Status',
      'Winner',
      'Result',
      'Sport Type',
    ];

    return CsvGenerator.generate(headers, rows);
  }

  async generateAggregatedStatsReport(
    params: AggregatedStatsReportDto,
  ): Promise<string> {
    const startDate = new Date(params.startDate);
    const endDate = new Date(params.endDate);
    endDate.setHours(23, 59, 59, 999);

    const bets = await this.prisma.bet.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        match: true,
        user: true,
      },
    });

    const sportMap = new Map<string, AggregatedStatsRow>();
    const uniqueUsers = new Set<number>();

    for (const bet of bets) {
      const sportType = bet.match.sportType;
      uniqueUsers.add(bet.userId);

      if (!sportMap.has(sportType)) {
        sportMap.set(sportType, {
          monthStart: params.startDate,
          monthEnd: params.endDate,
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
        stats.totalWinnings += bet.payout || bet.amount * 1.9;
      } else if (result === 'LOSS') {
        stats.totalLosses += bet.amount;
      }
    }

    for (const stats of sportMap.values()) {
      stats.playerCount = uniqueUsers.size;
    }

    const allRows: (string | number)[][] = [];

    const sortedSports = Array.from(sportMap.values()).sort((a, b) =>
      a.sportType.localeCompare(b.sportType),
    );

    let totalBets = 0;
    let totalWinnings = 0;
    let totalLosses = 0;
    let betCount = 0;

    for (const stats of sortedSports) {
      allRows.push([
        this.formatMonthDate(stats.monthStart),
        this.formatMonthDate(stats.monthEnd),
        stats.sportType,
        stats.totalBets.toFixed(2),
        stats.totalWinnings.toFixed(2),
        stats.totalLosses.toFixed(2),
        stats.betCount,
        stats.playerCount,
      ]);

      totalBets += stats.totalBets;
      totalWinnings += stats.totalWinnings;
      totalLosses += stats.totalLosses;
      betCount += stats.betCount;
    }

    if (sortedSports.length > 0) {
      const firstStats = sortedSports[0];
      allRows.push([
        this.formatMonthDate(firstStats.monthStart),
        this.formatMonthDate(firstStats.monthEnd),
        'ALL',
        totalBets.toFixed(2),
        totalWinnings.toFixed(2),
        totalLosses.toFixed(2),
        betCount,
        uniqueUsers.size,
      ]);
    }

    const headers = [
      'Period Start',
      'Period End',
      'Sport Type',
      'Total Bets',
      'Total Winnings',
      'Total Losses',
      'Bet Count',
      'Player Count',
    ];

    return CsvGenerator.generate(headers, allRows);
  }

  private formatMonthDate(dateString: string): string {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = String(date.getDate()).padStart(2, '0');
    return `${month} ${day}, ${year}`;
  }

  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds}`;
  }

  private calculateResult(bet: Bet & { match: Match }): string {
    if (bet.result) {
      return bet.result;
    }

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
