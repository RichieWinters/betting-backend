import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: '1234567890' })
  @IsString()
  token: string;

  @ApiProperty({
    description: 'New password',
    example: 'passwordstrongvery',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
