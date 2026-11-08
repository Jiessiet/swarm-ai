export type FundDecision = { contribution: 0 | 5 };
export type FundMessage = { agent: string; text: string };
export type FundOutcome = FundDecision & { agent: string; message: string; payoff: number; cumulativePayoff: number };
export type FundRound = { round: number; totalContributions: number; doubledFund: number; share: number; outcomes: FundOutcome[] };
export type FundObservation = {
  phase: 'discussion' | 'contribution' | 'peer-review';
  round: number;
  totalRounds: number;
  endowment: number;
  requiredContribution: number;
  team: string;
  project: { name: string; targetPoints: number };
  peers?: string[];
  messages?: FundMessage[];
  history: { round: number; payoff: number; messages: FundMessage[] }[];
};
export type FundCondition = 'planted' | 'control';
