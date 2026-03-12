import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserBetsReportDto } from './dto/user-bets-report.dto';
import { AggregatedStatsReportDto } from './dto/aggregated-stats-report.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async generateUserBetsReport(params: UserBetsReportDto): Promise<string> {
    // TODO:
    return '';
  }

  async generateAggregatedStatsReport(
    params: AggregatedStatsReportDto,
  ): Promise<string> {
    // TODO:
    return '';
  }

  private calculateResult(bet: any): string {
    if (bet.match.status !== 'COMPLETED') {
      return 'PENDING';
    }
    if (!bet.match.winner) {
      return 'DRAW';
    }
    return bet.team === bet.match.winner ? 'WIN' : 'LOSS';
  }
}
