import { Module } from '@nestjs/common';
import { BetService } from './bet.service';
import { BetController } from './bet.controller';

@Module({
  providers: [BetService],
  controllers: [BetController]
})
export class BetModule {}
