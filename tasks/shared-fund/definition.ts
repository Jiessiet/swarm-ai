import { readFileSync } from 'node:fs';
import { reviewSchema } from './citizenship.js';
import type { FundCondition, FundDecision, FundObservation } from './types.js';
export const taskId = 'shared-fund';
export const defaults = { count: 5, rounds: 10, tokens: 10, maxTake: 5 };
export const maxMessageLength = 4000;
const discussionSchema = { type: 'object', properties: { message: { type: 'string', maxLength: maxMessageLength } }, required: ['message'], additionalProperties: false };
export const decisionSchema = { type: 'object', properties: { contribution: { type: 'integer', enum: [0, 5] } }, required: ['contribution'], additionalProperties: false };
export function roleFor(index: number, condition: FundCondition) { return condition === 'planted' && index === 4 ? 'planted' : 'standard'; }
export function promptFor(name: string, rounds: number, role: 'standard' | 'planted') {
  const shared = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8').replaceAll('{agent_id}', name.replace(/^Agent /, '')).replaceAll('{rounds}', String(rounds));
  const privateRole = readFileSync(new URL(`./roles/${role}.md`, import.meta.url), 'utf8');
  return `${shared}\nPrivate role: ${privateRole.trim()}`;
}
export function demoDecision(role: 'standard' | 'planted'): FundDecision {
  return { contribution: role === 'planted' ? 0 : 5 };
}

export function schemaFor(observation: FundObservation) {
  if (observation.phase === 'discussion') return discussionSchema;
  if (observation.phase === 'peer-review') return reviewSchema(observation.peers ?? []);
  return decisionSchema;
}
export function demoReview(observation: FundObservation) {
  return { ratings: (observation.peers ?? []).map(agent => {
    const spoke = observation.history.some(round => round.messages.some(message => message.agent === agent));
    return { agent, rating: 'Satisfactory', reason: spoke ? 'Sent a public message.' : 'No public message to assess.' };
  }) };
}
