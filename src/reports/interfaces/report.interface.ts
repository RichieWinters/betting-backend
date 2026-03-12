export interface UserBetRow {
  betId: number;
  userId: number;
  userName: string;
  matchId: number;
  teamA: string;
  teamB: string;
  betTeam: string;
  amount: number;
  betDate: string;
  matchStatus: string;
  winner: string | null;
  result: string;
  sportType: string;
}

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
