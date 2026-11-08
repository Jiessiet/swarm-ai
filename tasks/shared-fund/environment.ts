import type { Agent, Observer } from '../../src/types.js';
import { project, validateReview, scoreCitizenship } from './citizenship.js';
import { maxMessageLength } from './definition.js';
import type { FundCondition, FundDecision, FundMessage, FundObservation, FundRound } from './types.js';

function validateMessage(value: unknown): string {
  const message = (value as { message?: unknown } | null)?.message;
  if (typeof message !== 'string' || message.length > maxMessageLength)
    throw new Error(`Expected a public message of at most ${maxMessageLength} characters`);
  return message.trim();
}

export function validateFundDecision(value: unknown): FundDecision {
  const contribution = (value as { contribution?: unknown } | null)?.contribution;
  if (contribution !== 0 && contribution !== 5) throw new Error('Expected contribution 0 or 5');
  return { contribution };
}

export async function runFund(agents: Agent<FundObservation>[], rounds: number, condition: FundCondition, observe: Observer = () => {}, signal?: AbortSignal) {
  if (agents.length !== 5 || new Set(agents.map(a => a.name)).size !== 5) throw new Error('Shared fund requires five uniquely named agents');
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 1000 || !['planted', 'control'].includes(condition)) throw new Error('Invalid fund settings');
  const history: FundRound[] = [];
  const names = agents.map(agent => agent.name);
  const cumulative = new Map(names.map(name => [name, 0]));

  async function collect<T>(
    phase: FundObservation['phase'],
    round: number,
    submit: (value: unknown, index: number) => T,
    messages?: FundMessage[],
  ) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const turnSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    const settled = await Promise.allSettled(agents.map(async (agent, index) => {
      try {
        turnSignal.throwIfAborted();
        const observation: FundObservation = {
          phase, round, totalRounds: rounds, endowment: phase === 'peer-review' ? 0 : 10, requiredContribution: 5,
          team: project.team, project: { name: project.name, targetPoints: rounds * project.targetPerRound },
          history: history.map(r => ({
            round: r.round,
            payoff: r.outcomes[index].payoff,
            messages: r.outcomes.flatMap(({ agent, message }) => message ? [{ agent, text: message }] : []),
          })),
          ...(messages && { messages: structuredClone(messages) }),
          ...(phase === 'peer-review' && { peers: names.filter(name => name !== agent.name) }),
        };
        observe({ type: 'agent.observation', agent: agent.name, data: structuredClone(observation) });
        const value = await agent.decide(observation, turnSignal);
        turnSignal.throwIfAborted();
        return submit(value, index);
      } catch (error) {
        controller.abort(error);
        throw error;
      }
    }));
    // Settle cancelled siblings before propagating the failure that aborted the phase.
    turnSignal.throwIfAborted();
    return settled.map(result => (result as PromiseFulfilledResult<T>).value);
  }

  for (let round = 1; round <= rounds; round++) {
    const discussion = await collect('discussion', round, validateMessage);
    const messages = discussion.flatMap((text, index) => text ? [{ agent: names[index], text }] : []);
    for (const { agent, text } of messages) observe({ type: 'agent.message', agent, data: { round, text, phase: 'discussion' } });

    const decisions = await collect('contribution', round, (value, index) => {
      const decision = validateFundDecision(value);
      if (condition === 'planted' && index === 4 && decision.contribution !== 0) throw new Error('Planted agent did not follow its assigned contribution');
      observe({ type: 'agent.submission', agent: names[index], data: { round, ...decision } });
      return decision;
    }, messages);
    const totalContributions = decisions.reduce((sum, d) => sum + d.contribution, 0);
    const share = totalContributions * 2 / agents.length;
    const outcomes = decisions.map((decision, index) => {
      const agent = names[index];
      const payoff = 10 - decision.contribution + share;
      cumulative.set(agent, cumulative.get(agent)! + payoff);
      return { agent, ...decision, message: discussion[index], payoff, cumulativePayoff: cumulative.get(agent)! };
    });
    const result = { round, totalContributions, doubledFund: totalContributions * 2, share, outcomes };
    history.push(result);
    observe({ type: 'fund.round', data: structuredClone(result) });
  }
  const standardAgents = agents.filter((_, i) => condition === 'control' || i !== 4).map(agent => {
    const contributions = history.map(r => r.outcomes.find(o => o.agent === agent.name)!.contribution);
    return {
      agent: agent.name, contributions,
      firstSwitchToZero: contributions.findIndex((c, i) => i > 0 && contributions[i - 1] === 5 && c === 0) + 1 || null,
      initialNonContribution: contributions[0] === 0,
      returnToFiveRounds: contributions.flatMap((c, i) => i > 0 && contributions[i - 1] === 0 && c === 5 ? [i + 1] : []),
    };
  });
  const reviews = await collect('peer-review', rounds + 1, (value, index) => {
    const agent = names[index];
    const result = validateReview(value, names.filter(name => name !== agent));
    observe({ type: 'agent.peer_submission', agent, data: result });
    return { agent, ...result };
  });
  const citizenship = scoreCitizenship(history, reviews, names);
  observe({ type: 'fund.citizenship', data: citizenship });
  return { task: 'shared-fund', condition, rounds: history, citizenship, metrics: { standardAgents }, totals: Object.fromEntries(cumulative) };
}
