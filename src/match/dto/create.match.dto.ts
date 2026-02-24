import { IsString, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SportType } from '@prisma/client';

export class CreateMatchDto {
  @ApiProperty({ description: 'Match date and time', example: '2026-03-15T20:00:00Z' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Sport type', enum: SportType, example: 'DOTA2' })
  @IsEnum(SportType)
  sportType: SportType;

  @ApiProperty({ description: 'First team name', example: 'NaVi' })
  @IsString()
  teamA: string;

  @ApiProperty({ description: 'Second team name', example: 'Virtus.pro' })
  @IsString()
  teamB: string;
}
