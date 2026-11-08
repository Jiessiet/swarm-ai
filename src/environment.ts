export type Decision = { take: number; reason: string };
export type Observation = { round: number; totalRounds: number; tokensRemaining: number; maximumTake: number; history: Turn[] };
export type Turn = { round: number; agent: string; take: number; reason: string; poolRemaining: number };
export type Activity = { type: string; agent?: string; data?: unknown };
export type Observer = (event: Activity) => void;
export interface Agent { name: string; decide(observation: Observation, signal?: AbortSignal): Promise<unknown> }
export function validateDecision(value: unknown, maximum: number): Decision {
  if (!value || typeof value !== 'object') throw new Error('Decision must be an object');
  const { take, reason } = value as Decision;
  if (!Number.isInteger(take) || take < 0 || take > maximum || typeof reason !== 'string')
    throw new Error('Invalid decision: expected an allowed integer take and a string reason');
  return { take, reason };
}
export async function runEnvironment(agents: Agent[], rounds = 3, startingTokens = 12, maxTake = 4, observe: Observer = () => {}, signal?: AbortSignal) {
  if (!agents.length || new Set(agents.map(a => a.name)).size !== agents.length) throw new Error('Agents need unique names');
  for (const value of [rounds, startingTokens, maxTake])
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Settings must be positive safe integers');
  let pool = startingTokens;
  const history: Turn[] = [];
  for (let round = 1; round <= rounds && pool > 0; round++) {
    // Rotate first mover each round to reduce fixed ordering advantage.
    for (let offset = 0; offset < agents.length && pool > 0; offset++) {
      signal?.throwIfAborted();
      const agent = agents[(round - 1 + offset) % agents.length];
      const observation = { round, totalRounds: rounds, tokensRemaining: pool, maximumTake: Math.min(maxTake, pool), history: structuredClone(history) };
      observe({ type: 'agent.observation', agent: agent.name, data: observation });
      const decision = validateDecision(await agent.decide(observation, signal), observation.maximumTake);
      signal?.throwIfAborted();
      pool -= decision.take;
      history.push({ round, agent: agent.name, ...decision, poolRemaining: pool });
      observe({ type: 'agent.decision', agent: agent.name, data: history.at(-1) });
    }
  }
  return { settings: { rounds, startingTokens, maxTake, agents: agents.map(a => a.name) }, poolRemaining: pool, turns: history };
}
