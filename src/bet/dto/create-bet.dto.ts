import { IsNumber, IsString, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBetDto {
  @ApiProperty({ description: 'User ID placing the bet', example: 1 })
  @IsNumber()
  @IsPositive()
  userId: number;

  @ApiProperty({ description: 'Match ID to bet on', example: 1 })
  @IsNumber()
  @IsPositive()
  matchId: number;

  @ApiProperty({ description: 'Bet amount in gold coins', example: 100 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Team to bet on (must match teamA or teamB)', example: 'NaVi' })
  @IsString()
  team: string;
}
