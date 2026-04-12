import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ReportsService } from './reports.service';
import { ReportsGateway } from './reports.gateway';
import { JobResult } from './interfaces/report.interface';
import { UserBetsReportDto } from './dto/user-bets-report.dto';
import { AggregatedStatsReportDto } from './dto/aggregated-stats-report.dto';

@Processor('reports')
export class ReportsProcessor extends WorkerHost {
  constructor(
    private reportsService: ReportsService,
    private gateway: ReportsGateway,
  ) {
    super();
  }

  async process(job: Job): Promise<JobResult> {
    this.gateway.emitStatusUpdate(job.id!, 'active', { progress: 0 });

    let csv: string;

    if (job.name === 'user-bets') {
      csv = await this.reportsService.generateUserBetsReport(
        job.data as UserBetsReportDto,
      );
    } else if (job.name === 'aggregated-stats') {
      csv = await this.reportsService.generateAggregatedStatsReport(
        job.data as AggregatedStatsReportDto,
      );
    } else {
      throw new Error(`Unknown job type: ${job.name}`);
    }

    await job.updateProgress(100);

    const result: JobResult = {
      csv,
      filename: `${job.name}-${job.id}.csv`,
      generatedAt: new Date().toISOString(),
    };

    return result;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: JobResult) {
    this.gateway.emitStatusUpdate(job.id!, 'completed', {
      filename: result.filename,
      downloadUrl: `/reports/${job.id}/download`,
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.gateway.emitStatusUpdate(job.id!, 'failed', {
      error: error.message,
    });
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job, progress: number) {
    this.gateway.emitStatusUpdate(job.id!, 'progress', { progress });
  }
}
