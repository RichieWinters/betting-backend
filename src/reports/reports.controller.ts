import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserBetsReportDto } from './dto/user-bets-report.dto';
import { AggregatedStatsReportDto } from './dto/aggregated-stats-report.dto';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class ReportsController {
  constructor(@InjectQueue('reports') private reportsQueue: Queue) {}

  @Post('user-bets')
  @ApiOperation({ summary: 'Request user bets report (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Job created, returns jobId',
    schema: {
      example: { jobId: '123' },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  async requestUserBetsReport(@Body() dto: UserBetsReportDto) {
    const job = await this.reportsQueue.add('user-bets', dto);
    return { jobId: job.id };
  }

  @Post('aggregated-stats')
  @ApiOperation({
    summary: 'Request aggregated statistics report (Admin only)',
  })
  @ApiResponse({
    status: 201,
    description: 'Job created, returns jobId',
    schema: {
      example: { jobId: '456' },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  async requestAggregatedStatsReport(@Body() dto: AggregatedStatsReportDto) {
    const job = await this.reportsQueue.add('aggregated-stats', dto);
    return { jobId: job.id };
  }

  @Get(':jobId/status')
  @ApiOperation({ summary: 'Get report job status' })
  @ApiResponse({
    status: 200,
    description: 'Job status',
    schema: {
      example: {
        jobId: '123',
        status: 'completed',
        progress: 100,
        result: { filename: 'report.csv' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobStatus(@Param('jobId') jobId: string) {
    const job = await this.reportsQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const state = await job.getState();
    const progress = job.progress || 0;

    return {
      jobId: job.id,
      status: state,
      progress,
      result: job.returnvalue,
    };
  }

  @Get(':jobId/download')
  @ApiOperation({ summary: 'Download generated CSV report' })
  @ApiResponse({
    status: 200,
    description: 'CSV file',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 400, description: 'Report not ready yet' })
  async downloadReport(@Param('jobId') jobId: string, @Res() res: Response) {
    const job = await this.reportsQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const state = await job.getState();
    if (state !== 'completed') {
      throw new BadRequestException(`Report not ready. Status: ${state}`);
    }

    const { csv, filename } = job.returnvalue;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
