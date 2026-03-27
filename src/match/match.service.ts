import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMatchDto } from './dto/create.match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';

@Injectable()
export class MatchService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.match.findMany({
      where: {
        status: { not: 'DELETED' },
      },
    });
  }

  async create(createMatchDto: CreateMatchDto) {
    return this.prisma.match.create({
      data: {
        date: new Date(createMatchDto.date),
        sportType: createMatchDto.sportType,
        teamA: createMatchDto.teamA,
        teamB: createMatchDto.teamB,
      },
    });
  }

  async update(id: number, updateMatchDto: UpdateMatchDto) {
    let matchStatus = updateMatchDto.status;
    if (matchStatus === 'COMPLETED' && updateMatchDto.winner) {
      return this.completeMatchWithPayouts(id, updateMatchDto);
    }

    if (matchStatus === 'CANCELLED') {
      return this.cancelMatchWithRefunds(id);
    }

    return this.prisma.match.update({
      where: { id },
      data: updateMatchDto,
    });
  }

  private async completeMatchWithPayouts(
    matchId: number,
    updateMatchDto: UpdateMatchDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const match = await tx.match.update({
        where: { id: matchId },
        data: updateMatchDto,
      });

      const bets = await tx.bet.findMany({
        where: { matchId },
        include: { user: true },
      });

      for (const bet of bets) {
        if (bet.result !== 'PENDING') {
          continue;
        }

        const isWin = bet.team === updateMatchDto.winner;
        const result = isWin ? 'WIN' : 'LOSS';
        const payout = isWin ? bet.amount * bet.multiplier : 0;

        await tx.bet.update({
          where: { id: bet.id },
          data: { result, payout },
        });

        if (isWin && payout > 0) {
          await tx.user.update({
            where: { id: bet.userId },
            data: {
              balance: { increment: payout },
            },
          });
        }
      }

      return match;
    });
  }

  private async cancelMatchWithRefunds(matchId: number) {
    return this.prisma.$transaction(async (tx) => {
      const match = await tx.match.update({
        where: { id: matchId },
        data: { status: 'CANCELLED' },
      });

      const bets = await tx.bet.findMany({
        where: { matchId },
      });

      for (const bet of bets) {
        if (bet.result !== 'PENDING') {
          continue;
        }

        await tx.bet.update({
          where: { id: bet.id },
          data: { result: 'CANCELLED', payout: bet.amount },
        });

        await tx.user.update({
          where: { id: bet.userId },
          data: {
            balance: { increment: bet.amount },
          },
        });
      }

      return match;
    });
  }

  async delete(id: number) {
    const match = await this.prisma.match.findUnique({
      where: { id },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    if (match.status === 'COMPLETED') {
      throw new BadRequestException('Cannot delete completed matches');
    }

    return this.prisma.$transaction(async (tx) => {
      const deletedMatch = await tx.match.update({
        where: { id },
        data: { status: 'DELETED' },
      });

      const bets = await tx.bet.findMany({
        where: { matchId: id },
      });

      for (const bet of bets) {
        if (bet.result !== 'PENDING') {
          continue;
        }

        await tx.bet.update({
          where: { id: bet.id },
          data: { result: 'CANCELLED', payout: bet.amount },
        });

        await tx.user.update({
          where: { id: bet.userId },
          data: {
            balance: { increment: bet.amount },
          },
        });
      }

      return deletedMatch;
    });
  }
}
