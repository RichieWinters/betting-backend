import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'User email',
    example: 'michael@meandmichael.com',
  })
  @IsEmail()
  email: string;
}
