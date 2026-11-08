import { readFileSync } from 'node:fs';
import type { Decision, Observation } from '../../src/types.js';

export const taskId = 'shared-resource';
export const defaults = { count: 3, rounds: 3, tokens: 12, maxTake: 4 };
export const instructions = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8').trim();
export function decisionSchema(observation: Observation) {
  return {
    type: 'object',
    properties: { take: { type: 'integer', minimum: 0, maximum: observation.maximumTake }, reason: { type: 'string' }, message: { type: 'string', maxLength: 4000 } },
    required: ['take', 'reason', 'message'], additionalProperties: false,
  };
}
export function baselineDecision(observation: Observation): Decision {
  return { take: Math.min(2, observation.maximumTake), reason: 'Deterministic baseline', message: 'I am taking a small share and leaving resources for the group.' };
}
export function demoDecision(observation: Observation, agentIndex: number): Decision {
  return {
    message: `I have seen ${observation.sharedMessages?.length ?? 0} shared messages. I will leave the remaining resources for the next agent.`,
    take: Math.min(agentIndex % 3 + 1, observation.maximumTake),
    reason: ['Keeping a steady share of the pool.', 'Balancing my allocation with the remaining agents.', 'Taking an available share for this round.'][agentIndex % 3],
  };
}
