export type Decision = { take: number; reason: string; message?: string };
export type Observation = { round: number; totalRounds: number; tokensRemaining: number; maximumTake: number; history: Turn[]; sharedMessages?: SharedMessage[] };
export type Turn = { round: number; agent: string; take: number; reason: string; poolRemaining: number };
export type SharedMessage = { round: number; agent: string; text: string };
