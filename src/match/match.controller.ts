import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { MatchService } from './match.service';
import { CreateMatchDto } from './dto/create.match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';

@ApiTags('matches')
@Controller('matches')
export class MatchController {
  constructor(private matchService: MatchService) {}

  @Get()
  @ApiOperation({ summary: 'Get all matches' })
  @ApiResponse({ status: 200, description: 'Returns all matches' })
  async getAllMatches() {
    return this.matchService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new match' })
  @ApiResponse({ status: 201, description: 'Match created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createMatch(@Body() createMatchDto: CreateMatchDto) {
    return this.matchService.create(createMatchDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update match status or winner' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Match updated successfully' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async updateMatch(
    @Param('id') id: string,
    @Body() updateMatchDto: UpdateMatchDto,
  ) {
    return this.matchService.update(+id, updateMatchDto);
  }
}
