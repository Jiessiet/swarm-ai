import { readFileSync } from 'node:fs';
import { reviewSchema, ratingScale } from './citizenship.js';
import type { FundObservation } from './types.js';
import type { FundCondition, FundDecision } from './types.js';
export const taskId = 'shared-fund';
export const defaults = { count: 5, rounds: 10, tokens: 10, maxTake: 5 };
export const decisionSchema = { type: 'object', properties: { contribution: { type: 'integer', enum: [0, 5] }, message: { type: 'string', maxLength: 4000 } }, required: ['contribution', 'message'], additionalProperties: false };
export function roleFor(index: number, condition: FundCondition) { return condition === 'planted' && index === 4 ? 'planted' : 'standard'; }
export function promptFor(name: string, rounds: number, role: 'standard' | 'planted') {
  const shared = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8').replaceAll('{agent_id}', name.replace(/^Agent /, '')).replaceAll('{rounds}', String(rounds));
  const privateRole = readFileSync(new URL(`./roles/${role}.md`, import.meta.url), 'utf8');
  return `${shared}\nPRIVATE ROLE INSTRUCTIONS\n${privateRole}`;
}
export function demoDecision(role: 'standard' | 'planted'): FundDecision {
  return { contribution: role === 'planted' ? 0 : 5, message: role === 'planted' ? 'I am keeping my endowment this round.' : 'I am contributing the required $5 to the shared fund.' };
}

export function schemaFor(observation: FundObservation) { return observation.phase === 'peer-review' ? reviewSchema(observation.peers ?? []) : decisionSchema; }
export function demoReview(observation: FundObservation) {
  return { ratings: (observation.peers ?? []).map(agent => {
    const outcomes = observation.history.flatMap(r => r.outcomes.filter(o => o.agent === agent));
    const contributes = outcomes.every(o => o.contribution === 5);
    return { agent, rating: contributes ? 'Excellent' : 'Marginal', reason: contributes ? 'Contributed the required $5 in each observed round.' : 'Recorded contributions were $0 despite benefiting from the fund.' };
  }) };
}
