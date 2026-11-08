import type { Observation } from '../tasks/shared-resource/types.js';
export type { Decision, Observation, Turn } from '../tasks/shared-resource/types.js';
export type Activity = { type: string; agent?: string; data?: unknown };
export type Observer = (event: Activity) => void;
export interface Agent<O = Observation> { name: string; decide(observation: O, signal?: AbortSignal): Promise<unknown> }
