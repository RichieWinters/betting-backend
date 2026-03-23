import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';
import { MatchModule } from './match/match.module';
import { BetModule } from './bet/bet.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { ReportsModule } from './reports/reports.module';
import { ResetPasswordController } from './reset-password.controller';

@Module({
  imports: [
    PrismaModule,
    UserModule,
    MatchModule,
    BetModule,
    AuthModule,
    EmailModule,
    ReportsModule,
  ],
  controllers: [AppController, ResetPasswordController],
  providers: [AppService],
})
export class AppModule {}
