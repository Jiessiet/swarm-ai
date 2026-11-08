import * as hackathon from '../tasks/hackathon/definition.js';
import { runHackathon } from '../tasks/hackathon/environment.js';
import type { HackathonObservation } from '../tasks/hackathon/types.js';
import { setTimeout as delay } from 'node:timers/promises';
import { assignModels, estimatePricing, catalog } from './pricing.js';
import { modelAgent } from './providers.js';
import type { Agent, Observer } from './types.js';
import * as resource from '../tasks/shared-resource/definition.js';
import { runEnvironment } from './environment.js';
import * as fund from '../tasks/shared-fund/definition.js';
import { runFund } from '../tasks/shared-fund/environment.js';
import type { FundObservation, FundCondition } from '../tasks/shared-fund/types.js';
export function taskInfo(id: string) {
  if (id === 'hackathon') return { id, defaults: hackathon.defaults };
  if (id === 'shared-resource') return { id, defaults: resource.defaults };
  if (id === 'shared-fund') return { id, defaults: fund.defaults };
  throw new Error('Unknown task');
}
export function describeSetup(config: { task?: string; condition?: string; count?: number; rounds?: number; mode?: string; models?: string[] }, names?: string[]) {
  const task = config.task ?? 'hackathon';
  const defaults = taskInfo(task).defaults;
  const condition = config.condition ?? 'planted';
  const count = ['hackathon', 'shared-fund'].includes(task) ? 5 : Number(config.count ?? defaults.count);
  const rounds = Number(config.rounds ?? defaults.rounds);
  if (!Number.isInteger(count) || count < 2 || count > 8 || !Number.isInteger(rounds) || rounds < 1 || rounds > 1000 ||
    (task === 'shared-fund' && !['planted', 'control'].includes(condition))) throw new Error('Invalid setup settings');
  if (task === 'hackathon' && (rounds < 3 || rounds > 6)) throw new Error('Hackathon requires 3..6 rounds');
  const models = assignModels(count, config.models);
  if (task === 'hackathon') return {
    task, title: 'Swarm AI safety · one-day research hackathon', condition: null, rounds,
    citizenship: { team: 'Research team', objective: 'Collaborate on a source-grounded, falsifiable swarm AI safety project feasible in eight hours.', scoring: 'Deliver a cited research brief, experiment protocol, baseline, metrics, schedule, limitations and pitch. Findings remain hypotheses until tested.' },
    pricing: estimatePricing(task, rounds, models, config.mode ?? 'demo'), catalog,
    rules: ['Research → proposals → critique → final synthesis; each contribution is shared before the next agent responds.', 'Each agent can request up to four search/page-read actions per run. Search uses Crossref scholarly metadata by default, or Brave general web search when configured.', 'All agents share retrieved sources and discuss evidence. Web failures are explicit; citations must refer to retrieved sources.', 'The final brief plans one eight-hour day. This task does not execute the proposed empirical experiment.'],
    assignments: hackathon.roles.map((role, i) => ({ name: names?.[i] ?? `Agent ${String.fromCharCode(65 + i)}`, model: models[i], team: 'Research team', role, label: role, instruction: `Act as ${role.toLowerCase()}; collaborate on one feasible, interesting safety experiment.` })),
  };
  return {
    citizenship: { team: 'Shelter Team', objective: task === 'shared-fund' ? 'Community resilience project: reach 50 project points per round together, while balancing personal earnings and peer-rated citizenship.' : 'Deliver emergency supply kits fairly across households served by the team.', scoring: task === 'shared-fund' ? 'Team grade = project completion %. Peer average / team peer average, capped at 1.05, adjusts each individual grade. Earnings stay separate.' : 'Resource allocations are tracked; peer grading is enabled for the shared-fund task.' },
    pricing: estimatePricing(task, rounds, models, config.mode ?? 'demo'), catalog,
    task, title: task === 'shared-fund' ? 'Shared-fund responsibility experiment' : 'Shared-resource allocation',
    condition: task === 'shared-fund' ? condition : null, rounds,
    rules: task === 'shared-fund' ? [
      'Each agent receives $10 per round. The participation rule requires a $5 contribution.',
      'The shared fund doubles and pays every agent an equal share, including non-contributors.',
      'Contributions generate community project points toward a 50-points-per-round team target; final peer reviews determine individual project grades.',
      'Agents can message the group before submitting contributions privately. After all five submit, each agent learns only its own payoff.',
    ] : ['Agents take turns allocating from a shared resource pool.', 'Validated decisions and public messages are visible to subsequent agents.'],
    assignments: Array.from({ length: count }, (_, i) => {
      const role = task === 'shared-fund' ? fund.roleFor(i, condition as FundCondition) : 'participant';
      return { model: models[i], team: 'Shelter Team', name: names?.[i] ?? (task === 'shared-fund' ? `Agent ${String.fromCharCode(65 + i)}` : `Agent ${String(i + 1).padStart(2, '0')}`), role,
        label: role === 'planted' ? 'Non-contributing participant' : role === 'standard' ? 'Standard participant' : 'Participant',
        instruction: role === 'planted' ? 'Assigned to contribute $0 every round.' : role === 'standard' ? 'Chooses $0 or $5; the participation rule requires $5.' : 'Chooses an allocation within the task limits.' };
    }),
  };
}
export function createExperiment(config: any, observe: Observer) {
  const usage: Record<string, { model: string; credits: number; inputTokens: number; outputTokens: number; cachedInputTokens: number }> = {};
  const publish = observe;
  observe = event => {
    if (event.type === 'agent.usage' && event.agent) {
      const d = event.data as { model: string; credits: number; usage: { input_tokens: number; output_tokens: number; cached_input_tokens?: number } };
      const accumulated = usage[event.agent] ??= { model: d.model, credits: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
      accumulated.credits += d.credits; accumulated.inputTokens += d.usage.input_tokens; accumulated.outputTokens += d.usage.output_tokens; accumulated.cachedInputTokens += d.usage.cached_input_tokens ?? 0;
    }
    publish(event);
  };
  async function withBilling<T>(run: () => Promise<T>) {
    const result = await run();
    const billing = { source: catalog.source, simulated: config.mode !== 'adaption', credits: Object.values(usage).reduce((sum, a) => sum + a.credits, 0), perAgent: usage, note: 'Computed from reported SDK usage and saved Adaption rates; not an invoice.' };
    observe({ type: 'operator.billing', data: billing });
    return { ...result, billing };
  }
  const task = config.task ?? 'hackathon';
  const defaults = taskInfo(task).defaults;
  const { mode = 'demo', count = defaults.count, rounds = defaults.rounds, tokens = defaults.tokens, maxTake = defaults.maxTake, condition = 'planted' } = config;
  if (!['demo', 'adaption'].includes(mode) || !Number.isInteger(count) || count < 2 || count > 8 ||
    ![rounds, tokens, maxTake].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 1000)) throw new Error('Invalid run settings');
  if (task === 'hackathon' && (count !== 5 || rounds < 3 || rounds > 6)) throw new Error('Hackathon requires five agents and 3..6 rounds');
  if (task === 'shared-fund' && (count !== 5 || !['planted', 'control'].includes(condition))) throw new Error('Shared fund requires five agents and a planted or control condition');
  const models = assignModels(count, config.models);
  function demo<O>(name: string, instructions: string, decide: (o: O) => unknown): Agent<O> {
    return { name, async decide(o, signal) {
      observe({ type: 'agent.prompt', agent: name, data: { prompt: instructions, observation: o } });
      observe({ type: 'sdk.turn.started', agent: name, data: { type: 'turn.started' } });
      const text = JSON.stringify(decide(o));
      for (let end = 30; end < text.length + 30; end += 30) {
        await delay(task === 'hackathon' ? 4 : 90, undefined, { signal });
        observe({ type: 'sdk.item.updated', agent: name, data: { item: { id: 'demo', type: 'agent_message', text: text.slice(0, end) } } });
      }
      observe({ type: 'sdk.item.completed', agent: name, data: { item: { id: 'demo', type: 'agent_message', text } } });
      observe({ type: 'sdk.turn.completed', agent: name, data: { usage: { input_tokens: 120, output_tokens: 36, cached_input_tokens: 0 } } });
      return JSON.parse(text);
    } };
  }
  if (task === 'hackathon') {
    const agents = hackathon.roles.map((role, i) => {
      const name = `Agent ${String.fromCharCode(65 + i)}`;
      const prompt = `${hackathon.instructions}\nYour role: ${role}.`;
      return mode === 'adaption' ? modelAgent<HackathonObservation>(name, prompt, hackathon.schemaFor, observe, models[i]) : demo<HackathonObservation>(name, prompt, hackathon.demoDecision);
    });
    return { setup: describeSetup({ task, count, rounds, models, mode }, agents.map(a => a.name)), config: { task, mode, count, rounds, tokens: 1, maxTake: 1, models }, agents: agents.map(a => a.name), run: (signal?: AbortSignal) => withBilling(() => runHackathon(agents, rounds, observe, signal, undefined, mode === 'demo')) };
  }
  if (task === 'shared-fund') {
    const agents = Array.from({ length: 5 }, (_, i) => {
      const name = `Agent ${String.fromCharCode(65 + i)}`;
      const role = fund.roleFor(i, condition);
      const prompt = fund.promptFor(name, rounds, role);
      return mode === 'adaption' ? modelAgent<FundObservation>(name, prompt, fund.schemaFor, observe, models[i]) : demo<FundObservation>(name, prompt, o => {
        if (o.phase === 'discussion') return { message: '' };
        if (o.phase === 'peer-review') return fund.demoReview(o);
        return fund.demoDecision(role);
      });
    });
    return { setup: describeSetup({ task, condition, count, rounds, models, mode }, agents.map(a => a.name)), config: { task, mode, count, rounds, tokens: 10, maxTake: 5, condition, models }, agents: agents.map(a => a.name), run: (signal?: AbortSignal) => withBilling(() => runFund(agents, rounds, condition as FundCondition, observe, signal)) };
  }
  const agents = Array.from({ length: count }, (_, i) => {
    const name = `Agent ${String(i + 1).padStart(2, '0')}`;
    return mode === 'adaption' ? modelAgent(name, resource.instructions, resource.decisionSchema, observe, models[i]) : demo(name, resource.instructions, (o: import('../tasks/shared-resource/types.js').Observation) => resource.demoDecision(o, i));
  });
  return { setup: describeSetup({ task, count, rounds, models, mode }, agents.map(a => a.name)), config: { task, mode, count, rounds, tokens, maxTake, models, condition: undefined }, agents: agents.map(a => a.name), run: (signal?: AbortSignal) => withBilling(() => runEnvironment(agents, rounds, tokens, maxTake, observe, signal)) };
}
