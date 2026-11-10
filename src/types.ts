export type Activity = { type: string; agent?: string; data?: unknown };
export type Observer = (event: Activity) => void;
export interface Agent<O = unknown> {
  name: string;
  decide(observation: O, signal?: AbortSignal): Promise<unknown>;
}
