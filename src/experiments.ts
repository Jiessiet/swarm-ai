import { setTimeout as delay } from 'node:timers/promises';
import { modelAgent } from './providers.js';
import type { Agent, Observer } from './types.js';
import * as resource from '../tasks/shared-resource/definition.js';
import { runEnvironment } from './environment.js';
import * as fund from '../tasks/shared-fund/definition.js';
import { runFund } from '../tasks/shared-fund/environment.js';
import type { FundObservation, FundCondition } from '../tasks/shared-fund/types.js';
export function taskInfo(id: string) {
  if (id === 'shared-resource') return { id, defaults: resource.defaults };
  if (id === 'shared-fund') return { id, defaults: fund.defaults };
  throw new Error('Unknown task');
}
export function createExperiment(config: any, observe: Observer) {
  const task = config.task ?? 'shared-resource';
  const defaults = taskInfo(task).defaults;
  const { mode = 'demo', count = defaults.count, rounds = defaults.rounds, tokens = defaults.tokens, maxTake = defaults.maxTake, condition = 'planted' } = config;
  if (!['demo', 'adaption'].includes(mode) || !Number.isInteger(count) || count < 2 || count > 8 ||
    ![rounds, tokens, maxTake].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 1000)) throw new Error('Invalid run settings');
  if (task === 'shared-fund' && (count !== 5 || !['planted', 'control'].includes(condition))) throw new Error('Shared fund requires five agents and a planted or control condition');
  function demo<O>(name: string, instructions: string, decide: (o: O) => unknown): Agent<O> {
    return { name, async decide(o, signal) {
      observe({ type: 'agent.prompt', agent: name, data: { prompt: instructions, observation: o } });
      observe({ type: 'sdk.turn.started', agent: name, data: { type: 'turn.started' } });
      const text = JSON.stringify(decide(o));
      for (let end = 30; end < text.length + 30; end += 30) {
        await delay(90, undefined, { signal });
        observe({ type: 'sdk.item.updated', agent: name, data: { item: { id: 'demo', type: 'agent_message', text: text.slice(0, end) } } });
      }
      observe({ type: 'sdk.item.completed', agent: name, data: { item: { id: 'demo', type: 'agent_message', text } } });
      observe({ type: 'sdk.turn.completed', agent: name, data: { usage: { input_tokens: 120, output_tokens: 36, cached_input_tokens: 0 } } });
      return JSON.parse(text);
    } };
  }
  if (task === 'shared-fund') {
    const agents = Array.from({ length: 5 }, (_, i) => {
      const name = `Agent ${String.fromCharCode(65 + i)}`;
      const role = fund.roleFor(i, condition);
      const prompt = fund.promptFor(name, rounds, role);
      return mode === 'adaption' ? modelAgent<FundObservation>(name, prompt, () => fund.decisionSchema, observe) : demo<FundObservation>(name, prompt, () => fund.demoDecision(role));
    });
    return { config: { task, mode, count, rounds, tokens: 10, maxTake: 5, condition }, agents: agents.map(a => a.name), run: (signal?: AbortSignal) => runFund(agents, rounds, condition as FundCondition, observe, signal) };
  }
  const agents = Array.from({ length: count }, (_, i) => {
    const name = `Agent ${String(i + 1).padStart(2, '0')}`;
    return mode === 'adaption' ? modelAgent(name, resource.instructions, resource.decisionSchema, observe) : demo(name, resource.instructions, (o: import('../tasks/shared-resource/types.js').Observation) => resource.demoDecision(o, i));
  });
  return { config: { task, mode, count, rounds, tokens, maxTake, condition: undefined }, agents: agents.map(a => a.name), run: (signal?: AbortSignal) => runEnvironment(agents, rounds, tokens, maxTake, observe, signal) };
}
