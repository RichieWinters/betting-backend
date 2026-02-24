import { IsString, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'User name', example: 'Alice' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Initial balance in gold coins', example: 1000, default: 1000 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  balance?: number;
}
