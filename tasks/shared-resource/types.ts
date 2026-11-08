export type Decision = { take: number; reason: string };
export type Observation = { round: number; totalRounds: number; tokensRemaining: number; maximumTake: number; history: Turn[] };
export type Turn = { round: number; agent: string; take: number; reason: string; poolRemaining: number };
