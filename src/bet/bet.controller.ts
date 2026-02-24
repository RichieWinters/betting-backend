import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BetService } from './bet.service';
import { CreateBetDto } from './dto/create-bet.dto';

@ApiTags('bets')
@Controller('bets')
export class BetController {
  constructor(private betService: BetService) {}

  @Get()
  @ApiOperation({ summary: 'Get all bets' })
  @ApiResponse({ status: 200, description: 'Returns all bets with user and match info' })
  async getAllBets() {
    return this.betService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Place a bet' })
  @ApiResponse({ status: 201, description: 'Bet placed successfully' })
  @ApiResponse({ status: 400, description: 'Validation error (insufficient balance, wrong team, etc.)' })
  async createBet(@Body() createBetDto: CreateBetDto) {
    return this.betService.create(createBetDto);
  }
}
