import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBetDto } from './dto/create-bet.dto';

@Injectable()
export class BetService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.bet.findMany({
      include: {
        user: { select: { id: true, name: true } },
        match: { select: { id: true, teamA: true, teamB: true, status: true } },
      },
    });
  }

  async findUserBets(userId: number) {
    return this.prisma.bet.findMany({
      where: { userId },
      include: {
        match: {
          select: {
            id: true,
            teamA: true,
            teamB: true,
            status: true,
            winner: true,
            date: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(createBetDto: CreateBetDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: createBetDto.userId },
    });

    const match = await this.prisma.match.findUnique({
      where: { id: createBetDto.matchId },
    });

    // Validation
    if (!user) throw new BadRequestException('User not found');
    if (!match) throw new BadRequestException('Match not found');

    if (match.status !== 'PENDING') {
      throw new BadRequestException('Can only bet on pending matches');
    }

    if (
      createBetDto.team !== match.teamA &&
      createBetDto.team !== match.teamB
    ) {
      throw new BadRequestException(
        `Team must be either "${match.teamA}" or "${match.teamB}"`,
      );
    }

    if (user.balance < createBetDto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // Transaction
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { balance: user.balance - createBetDto.amount },
      });

      return tx.bet.create({
        data: createBetDto,
        include: {
          user: { select: { id: true, name: true, balance: true } },
          match: true,
        },
      });
    });
  }
}
