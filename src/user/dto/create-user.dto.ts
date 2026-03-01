import {
  IsString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'User name', example: 'Michael' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Initial balance in gold coins',
    example: 1000,
    default: 1000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  balance?: number;

  @ApiProperty({
    description: 'User email',
    example: 'michael@meandmichael.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'User password', example: 'password123' })
  @IsString()
  password: string;
}
