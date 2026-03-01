import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BetService } from './bet.service';
import { CreateBetDto } from './dto/create-bet.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('bets')
@Controller('bets')
export class BetController {
  constructor(private betService: BetService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all bets' })
  @ApiResponse({
    status: 200,
    description: 'Returns all bets with user and match info',
  })
  async getAllBets() {
    return this.betService.findAll();
  }

  @Get('user-bets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user bets' })
  @ApiResponse({ status: 200, description: 'Returns current user bets' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserBets(@Request() req) {
    return this.betService.findUserBets(req.user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Place a bet' })
  @ApiResponse({ status: 201, description: 'Bet placed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation error (insufficient balance, wrong team, etc.)',
  })
  async createBet(@Body() createBetDto: CreateBetDto) {
    return this.betService.create(createBetDto);
  }
}
