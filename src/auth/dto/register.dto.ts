import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: 'User name', example: 'Michael' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'User email',
    example: 'michael@meandmichael.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'User password', example: 'passwordstrongvery' })
  @IsString()
  @MinLength(6)
  password: string;
}
