import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Status } from '@prisma/client';

export class UpdateMatchDto {
  @ApiPropertyOptional({ description: 'Match status', enum: Status, example: 'IN_PROGRESS' })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @ApiPropertyOptional({ description: 'Winning team name (when match is COMPLETED)', example: 'NaVi' })
  @IsOptional()
  @IsString()
  winner?: string;
}
