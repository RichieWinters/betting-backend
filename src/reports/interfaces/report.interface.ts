export interface AggregatedStatsRow {
  monthStart: string;
  monthEnd: string;
  sportType: string;
  totalBets: number;
  totalWinnings: number;
  totalLosses: number;
  betCount: number;
  playerCount: number;
}

export interface JobResult {
  csv: string;
  filename: string;
  generatedAt: string;
}

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed';
