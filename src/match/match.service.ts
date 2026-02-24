import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMatchDto } from './dto/create.match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';

@Injectable()
export class MatchService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.match.findMany();
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
    return this.prisma.match.update({
      where: { id },
      data: updateMatchDto,
    });
  }
}
