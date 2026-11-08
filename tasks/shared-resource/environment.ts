import type { Agent, Decision, Observer, Turn } from '../../src/types.js';
import { defaults } from './definition.js';

export function validateDecision(value: unknown, maximum: number): Decision {
  if (!value || typeof value !== 'object') throw new Error('Decision must be an object');
  const { take, reason, message } = value as Decision;
  if (!Number.isInteger(take) || take < 0 || take > maximum || typeof reason !== 'string')
    throw new Error('Invalid decision: expected an allowed integer take and a string reason');
  if (message !== undefined && (typeof message !== 'string' || message.length > 4000)) throw new Error('Public message must be a string of at most 4000 characters');
  return { take, reason, ...(message ? { message } : {}) };
}
export async function runEnvironment(agents: Agent[], rounds = defaults.rounds, startingTokens = defaults.tokens, maxTake = defaults.maxTake, observe: Observer = () => {}, signal?: AbortSignal) {
  if (!agents.length || new Set(agents.map(a => a.name)).size !== agents.length) throw new Error('Agents need unique names');
  for (const value of [rounds, startingTokens, maxTake])
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Settings must be positive safe integers');
  let pool = startingTokens;
  const history: Turn[] = [];
  const sharedMessages: { round: number; agent: string; text: string }[] = [];
  for (let round = 1; round <= rounds && pool > 0; round++) {
    // Rotate first mover each round to reduce fixed ordering advantage.
    for (let offset = 0; offset < agents.length && pool > 0; offset++) {
      signal?.throwIfAborted();
      const agent = agents[(round - 1 + offset) % agents.length];
      const observation = { round, totalRounds: rounds, tokensRemaining: pool, maximumTake: Math.min(maxTake, pool), history: structuredClone(history), sharedMessages: structuredClone(sharedMessages) };
      observe({ type: 'agent.observation', agent: agent.name, data: observation });
      const decision = validateDecision(await agent.decide(observation, signal), observation.maximumTake);
      signal?.throwIfAborted();
      if (decision.message) {
        const message = { round, agent: agent.name, text: decision.message };
        sharedMessages.push(message);
        observe({ type: 'agent.message', agent: agent.name, data: message });
      }
      pool -= decision.take;
      history.push({ round, agent: agent.name, ...decision, poolRemaining: pool });
      observe({ type: 'agent.decision', agent: agent.name, data: history.at(-1) });
    }
  }
  return { settings: { rounds, startingTokens, maxTake, agents: agents.map(a => a.name) }, poolRemaining: pool, turns: history, sharedMessages };
}
