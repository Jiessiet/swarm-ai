import { briefMarkdown } from '../tasks/hackathon/environment.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { catalog } from './pricing.js';
import { createTrace } from './traces.js';
import { createExperiment, taskInfo } from './experiments.js';
async function main() {
  const backend = process.env.AGENT_BACKEND ?? 'adaption';
  if (!['baseline', 'adaption'].includes(backend)) throw new Error('AGENT_BACKEND must be baseline or adaption');
  const task = process.env.TASK ?? 'hackathon';
  const defaults = taskInfo(task).defaults;
  const repetitions = Number(process.env.REPETITIONS ?? 1);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) throw new Error('REPETITIONS must be 1..100');
  const conditions = task === 'shared-fund' && process.env.CONDITION === 'both' ? ['planted', 'control'] : [process.env.CONDITION ?? 'planted'];
  for (let repetition = 1; repetition <= repetitions; repetition++) for (const condition of conditions) {
    const id = randomUUID();
    let trace: ReturnType<typeof createTrace>;
    const observe = (event: import('./types.js').Activity) => trace.append(event);
    const experiment = createExperiment({ task, condition, mode: backend === 'baseline' ? 'demo' : backend, rounds: Number(process.env.ROUNDS ?? defaults.rounds), tokens: Number(process.env.STARTING_TOKENS ?? defaults.tokens), maxTake: Number(process.env.MAX_TAKE ?? defaults.maxTake), count: Number(process.env.AGENT_COUNT ?? defaults.count), models: process.env.AGENT_MODELS ? process.env.AGENT_MODELS.split(',') : Array.from({ length: Number(process.env.AGENT_COUNT ?? defaults.count) }, (_, i) => catalog.models[(i + repetition - 1) % 5].id) }, observe);
    console.log(`Pre-run estimate: ${experiment.setup.pricing.expectedCharge.toFixed(6)} credits; ${experiment.setup.pricing.calls} planned calls. ${experiment.setup.pricing.assumptions}`);
    console.table(experiment.setup.assignments.map((a, i) => ({ agent: a.name, model: a.model, estimatedCredits: experiment.setup.pricing.perAgent[i].expectedCharge })));
    trace = createTrace(id, { ...experiment.config, repetition }, experiment.agents, experiment.setup);
    observe({ type: 'run.started', data: { ...experiment.config, repetition, agents: experiment.agents } });
    observe({ type: 'operator.setup', data: experiment.setup });
    try {
      const result = await experiment.run();
      await mkdir('results', { recursive: true });
      const path = `results/run-${id}.json`;
      await writeFile(path, JSON.stringify({ ...experiment.config, repetition, ...result }, null, 2), { flag: 'wx' });
      if ('brief' in result) await writeFile(`results/run-${id}.md`, briefMarkdown(result), { flag: 'wx' });
      observe({ type: 'run.completed', data: result });
      console.log(`${task} / ${task === 'shared-fund' ? condition : backend} / repetition ${repetition}: ${path}`);
      if ('brief' in result) { console.log(`Research brief: results/run-${id}.md`); }
      else if ('metrics' in result) console.table(result.metrics.standardAgents);
      else console.table(result.turns);
    } catch (error) { observe({ type: 'run.failed', data: { message: error instanceof Error ? error.message : 'Run failed' } }); throw error; }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
