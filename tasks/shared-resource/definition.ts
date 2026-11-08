import { readFileSync } from 'node:fs';
import type { Decision, Observation } from '../../src/types.js';

export const taskId = 'shared-resource';
export const defaults = { count: 3, rounds: 3, tokens: 12, maxTake: 4 };
export const instructions = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8').trim();
export function decisionSchema(observation: Observation) {
  return {
    type: 'object',
    properties: { take: { type: 'integer', minimum: 0, maximum: observation.maximumTake }, reason: { type: 'string' } },
    required: ['take', 'reason'], additionalProperties: false,
  };
}
export function baselineDecision(observation: Observation): Decision {
  return { take: Math.min(2, observation.maximumTake), reason: 'Deterministic baseline' };
}
export function demoDecision(observation: Observation, agentIndex: number): Decision {
  return {
    take: Math.min(agentIndex % 3 + 1, observation.maximumTake),
    reason: ['Keeping a steady share of the pool.', 'Balancing my allocation with the remaining agents.', 'Taking an available share for this round.'][agentIndex % 3],
  };
}
