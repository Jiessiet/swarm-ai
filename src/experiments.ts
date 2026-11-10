import { MAX_AGENTS, agentName } from './identity.js';
import { createRoleController, normalizeRoles } from './roles.js';
import { createNetworkController, normalizeNetwork } from './network.js';
import { agentTimeoutMs } from './timeouts.js';
import * as research from '../tasks/hackathon/definition.js';
import { runHackathon } from '../tasks/hackathon/environment.js';
import type { HackathonObservation } from '../tasks/hackathon/types.js';
import { setTimeout as delay } from 'node:timers/promises';
import { assignModels, estimatePricing, catalog } from './pricing.js';
import { modelAgent } from './providers.js';
import type { Agent, Observer } from './types.js';

export type ExperimentConfig = {
  task?: string; mode?: string; count?: number; rounds?: number;
  models?: string[]; network?: unknown; roles?: unknown; objective?: string;
};

// Keep the original research identifier and event names so saved runs remain readable.
export function taskInfo(id = 'hackathon') {
  if (id !== 'hackathon') throw new Error('Unknown task: Swarm Chamber supports the collaborative research workflow');
  return { id, defaults: research.defaults, objective: research.defaultObjective };
}

export function describeSetup(config: ExperimentConfig, names?: string[]) {
  const task = config.task ?? 'hackathon';
  const defaults = taskInfo(task).defaults;
  const count = config.count ?? defaults.count, rounds = config.rounds ?? defaults.rounds;
  const mode = config.mode ?? 'demo';
  if (!['demo', 'adaption'].includes(mode) || !Number.isInteger(count) || count < 2 || count > MAX_AGENTS) throw new Error('Invalid run settings');
  if (!Number.isInteger(rounds) || rounds < 3 || rounds > 6) throw new Error('Swarm research requires 3..6 rounds');
  const objective = config.objective ?? research.defaultObjective;
  if (typeof objective !== 'string' || !objective.trim() || objective.length > 4000) throw new Error('Task objective must be 1..4000 characters');
  const models = assignModels(count, config.models), roleSettings = normalizeRoles(count, config.roles);
  return {
    task, title: 'Swarm Chamber · collaborative research', rounds, objective,
    agentTimeoutSeconds: agentTimeoutMs() / 1000,
    roleSettings, network: normalizeNetwork(count, config.network),
    pricing: estimatePricing(task, rounds, models, mode), catalog,
    rules: [
      'Research → proposals → critique → final synthesis. Each agent receives its own work and contributions from incoming neighbors.',
      'Roles and network links can change during a run. Changes apply to the next decision; an in-flight response keeps its original context.',
      'Each agent has up to four mediated search/page-read actions. Sources follow the same routing rules, including explicit citation relay.',
      `Turns have a ${agentTimeoutMs() / 1000}-second deadline. Decisions are retried once; a skipped turn does not stop the team.`,
      'The current workflow produces a research plan. Proposed experiments are not executed automatically.',
    ],
    assignments: Array.from({ length: count }, (_, i) => ({
      name: names?.[i] ?? agentName(i), model: models[i], role: roleSettings.assignments[i].title,
      label: roleSettings.assignments[i].title, instruction: roleSettings.assignments[i].instructions,
    })),
  };
}

export function createExperiment(config: ExperimentConfig, publish: Observer) {
  const setup = describeSetup(config);
  const usage: Record<string, { model: string; credits: number; inputTokens: number; outputTokens: number; cachedInputTokens: number }> = {};
  const observe: Observer = event => {
    if (event.type === 'agent.usage' && event.agent) {
      const d = event.data as { model: string; credits: number; usage: { input_tokens: number; output_tokens: number; cached_input_tokens?: number } };
      const accumulated = usage[event.agent] ??= { model: d.model, credits: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
      accumulated.credits += d.credits; accumulated.inputTokens += d.usage.input_tokens;
      accumulated.outputTokens += d.usage.output_tokens; accumulated.cachedInputTokens += d.usage.cached_input_tokens ?? 0;
    }
    publish(event);
  };
  const mode = config.mode ?? 'demo', count = setup.assignments.length, rounds = setup.rounds;
  const models = setup.assignments.map(a => a.model);
  const network = createNetworkController(count, config.network), roles = createRoleController(count, config.roles);
  const configuredDelay = Number(process.env.DEMO_STREAM_DELAY_MS ?? 40);
  const demoDelay = Number.isFinite(configuredDelay) && configuredDelay >= 1 && configuredDelay <= 250 ? configuredDelay : 40;
  function demo(name: string, instructions: string): Agent<HackathonObservation> {
    return { name, async decide(observation, signal) {
      observe({ type: 'agent.prompt', agent: name, data: { prompt: instructions, observation } });
      observe({ type: 'sdk.turn.started', agent: name, data: { type: 'turn.started' } });
      const decision = research.demoDecision(observation), text = JSON.stringify(decision);
      for (let end = 30; end < text.length + 30; end += 30) {
        await delay(demoDelay, undefined, { signal });
        observe({ type: 'sdk.item.updated', agent: name, data: { item: { id: 'demo', type: 'agent_message', text: text.slice(0, end) } } });
      }
      observe({ type: 'sdk.item.completed', agent: name, data: { item: { id: 'demo', type: 'agent_message', text } } });
      observe({ type: 'sdk.turn.completed', agent: name, data: { usage: { input_tokens: 120, output_tokens: 36, cached_input_tokens: 0 } } });
      return decision;
    } };
  }
  const agents = setup.assignments.map(assignment => {
    const prompt = `${research.instructions}\nYour current role and roleInstructions are provided in each observation. Follow that assignment for this decision.`;
    return mode === 'adaption'
      ? modelAgent<HackathonObservation>(assignment.name, prompt, research.schemaFor, observe, assignment.model, true)
      : demo(assignment.name, prompt);
  });
  return {
    setup, network, roles,
    config: { task: setup.task, mode, count, rounds, objective: setup.objective, roles: roles.get().assignments, network: network.get(), agentTimeoutSeconds: setup.agentTimeoutSeconds, models },
    agents: agents.map(a => a.name),
    async run(signal?: AbortSignal) {
      const result = await runHackathon(agents, rounds, observe, signal, undefined, mode === 'demo', network, setup.objective, roles);
      const billing = { source: catalog.source, simulated: mode === 'demo', credits: Object.values(usage).reduce((sum, a) => sum + a.credits, 0), perAgent: usage, note: 'Computed from reported SDK usage and saved Adaption rates; not an invoice.' };
      observe({ type: 'operator.billing', data: billing });
      return { ...result, billing };
    },
  };
}
