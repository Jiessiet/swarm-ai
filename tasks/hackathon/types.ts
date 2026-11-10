import type { AgentNetwork } from '../../src/network.js';
export type Source = { id: string; title: string; url: string; text: string; kind: 'search-result' | 'page'; retrievedAt: string };
export type ResearchAction = { action: 'search' | 'read' | 'share'; query: string; url: string; message: string; sourceIds: string[] };
export type Contribution = { agent: string; round: number; phase: string; role?: string; roleRevision?: number; message: string; sourceIds: string[] };
export type TurnTimeout = { agent: string; round: number; phase: string; timeoutSeconds: number; message: string };
export type TurnError = { agent: string; round: number; phase: string; attempt: number; retrying: boolean; message: string };
export type Brief = {
  title: string; researchQuestion: string; hypothesis: string; safetyMechanism: string;
  relatedWork: { sourceId: string; relevance: string }[];
  alternatives: { idea: string; rejectionReason: string }[];
  experiment: { treatment: string; baseline: string; sampleSize: string; metrics: string[]; analysis: string; successCriterion: string };
  schedule: { hours: number; owner: string; task: string; deliverable: string }[];
  expectedFindings: string[]; limitations: string[]; fallback: string; pitch: string;
};
export type HackathonObservation = {
  phase: 'research' | 'proposal' | 'critique' | 'synthesis'; round: number; totalRounds: number;
  objective: string; network: AgentNetwork; incomingPeers: string[]; outgoingPeers: string[];
  role: string; roleInstructions: string; roleRevision: number; team: string[]; timeBudgetHours: number; webActionsRemaining: number;
  timeouts: TurnTimeout[];
  errors: TurnError[];
  history: Contribution[]; sources: Source[]; toolFeedback?: unknown;
};
