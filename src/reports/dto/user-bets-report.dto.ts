import { IsInt, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UserBetsReportDto {
  @ApiProperty({
    description: 'User ID to generate report for',
    example: 1,
  })
  @IsInt()
  userId: number;

  @ApiProperty({
    description: 'Start date of the period (ISO 8601)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date of the period (ISO 8601)',
    example: '2026-03-31T23:59:59.999Z',
  })
  @IsDateString()
  endDate: string;
}
