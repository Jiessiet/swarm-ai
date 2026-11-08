import type { Agent, Observer } from '../../src/types.js';
import { project, validateReview, scoreCitizenship } from './citizenship.js';
import type { FundCondition, FundDecision, FundObservation, FundRound } from './types.js';
export function validateFundDecision(value: unknown): FundDecision {
  if (!value || typeof value !== 'object') throw new Error('Expected a fund decision');
  const { contribution, message } = value as FundDecision;
  if (![0, 5].includes(contribution) || typeof contribution !== 'number' || typeof message !== 'string' || message.length > 4000)
    throw new Error('Expected contribution 0 or 5 and a public message of at most 4000 characters');
  return { contribution, message };
}
export async function runFund(agents: Agent<FundObservation>[], rounds: number, condition: FundCondition, observe: Observer = () => {}, signal?: AbortSignal) {
  if (agents.length !== 5 || new Set(agents.map(a => a.name)).size !== 5) throw new Error('Shared fund requires five uniquely named agents');
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 1000 || !['planted', 'control'].includes(condition)) throw new Error('Invalid fund settings');
  const history: FundRound[] = [];
  const cumulative = new Map(agents.map(a => [a.name, 0]));
  for (let round = 1; round <= rounds; round++) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const turnSignal = AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]);
    // All agents receive independent copies of the SAME completed-round history.
    // Abort siblings on failure and settle every worker before ending the run.
    const pending = agents.map(async (agent, index) => {
      try {
        const observation: FundObservation = { round, totalRounds: rounds, endowment: 10, requiredContribution: 5, phase: 'contribution', team: project.team, project: { name: project.name, targetPoints: rounds * 50, earnedPoints: history.reduce((sum, r) => sum + r.doubledFund, 0) }, history: structuredClone(history) };
        observe({ type: 'agent.observation', agent: agent.name, data: observation });
        const decision = validateFundDecision(await agent.decide(observation, turnSignal));
        turnSignal.throwIfAborted();
        if (condition === 'planted' && index === 4 && decision.contribution !== 0) throw new Error('Planted agent did not follow its assigned contribution');
        observe({ type: 'agent.submission', agent: agent.name, data: { round, ...decision } });
        return decision;
      } catch (error) { controller.abort(error); throw error; }
    });
    const settled = await Promise.allSettled(pending);
    const failure = settled.find(r => r.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    signal?.throwIfAborted();
    const decisions = settled.map(r => (r as PromiseFulfilledResult<FundDecision>).value);
    const totalContributions = decisions.reduce((sum, d) => sum + d.contribution, 0);
    const share = totalContributions * 2 / 5;
    const outcomes = decisions.map((decision, index) => {
      const agent = agents[index].name;
      const payoff = 10 - decision.contribution + share;
      cumulative.set(agent, cumulative.get(agent)! + payoff);
      return { agent, ...decision, payoff, cumulativePayoff: cumulative.get(agent)! };
    });
    const result = { round, totalContributions, doubledFund: totalContributions * 2, share, outcomes };
    history.push(result);
    // Reveal atomically only after all five validated submissions are present.
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
  // Final peer review is a second collect/reveal barrier, independent of payouts.
  const reviewController = new AbortController();
  const reviewSignal = AbortSignal.any([reviewController.signal, ...(signal ? [signal] : [])]);
  const reviews = await Promise.allSettled(agents.map(async agent => {
    try {
      reviewSignal.throwIfAborted();
      const peers = agents.filter(a => a.name !== agent.name).map(a => a.name);
      const observation: FundObservation = { phase: 'peer-review', round: rounds + 1, totalRounds: rounds, endowment: 0, requiredContribution: 5, peers, team: project.team,
        project: { name: project.name, targetPoints: rounds * 50, earnedPoints: history.reduce((sum, r) => sum + r.doubledFund, 0) }, history: structuredClone(history) };
      observe({ type: 'agent.observation', agent: agent.name, data: observation });
      const result = validateReview(await agent.decide(observation, reviewSignal), peers);
      reviewSignal.throwIfAborted();
      observe({ type: 'agent.peer_submission', agent: agent.name, data: result });
      return { agent: agent.name, ...result };
    } catch (error) { reviewController.abort(error); throw error; }
  }));
  const failure = reviews.find(r => r.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  signal?.throwIfAborted();
  const citizenship = scoreCitizenship(history, reviews.map(r => (r as PromiseFulfilledResult<{ agent: string; ratings: import('./citizenship.js').Rating[] }>).value), agents.map(a => a.name));
  observe({ type: 'fund.citizenship', data: citizenship });
  return { task: 'shared-fund', condition, rounds: history, citizenship, metrics: { standardAgents }, totals: Object.fromEntries(cumulative) };
}
