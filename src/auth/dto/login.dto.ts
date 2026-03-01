import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'User email',
    example: 'michael@meandmichael.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'User password', example: 'passwordstrongvery' })
  @IsString()
  password: string;
}
