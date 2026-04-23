import { IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplenishDto {
  @ApiProperty({ description: 'Amount to add to balance', example: 500 })
  @IsNumber()
  @IsPositive()
  amount: number;
}
