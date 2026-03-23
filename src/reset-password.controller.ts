import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class ResetPasswordController {
  @Get('reset-password')
  serveResetPasswordPage(@Res() res: Response) {
    const filePath = join(__dirname, '..', 'public', 'reset-password.html');
    return res.sendFile(filePath);
  }
}
