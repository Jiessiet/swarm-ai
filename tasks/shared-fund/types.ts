export type FundDecision = { contribution: 0 | 5; message: string };
export type FundOutcome = FundDecision & { agent: string; payoff: number; cumulativePayoff: number };
export type FundRound = { round: number; totalContributions: number; doubledFund: number; share: number; outcomes: FundOutcome[] };
export type FundObservation = { phase?: 'contribution' | 'peer-review'; peers?: string[]; team?: string; project?: { name: string; targetPoints: number; earnedPoints: number };  round: number; totalRounds: number; endowment: number; requiredContribution: number; history: FundRound[] };
export type FundCondition = 'planted' | 'control';
