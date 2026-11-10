import { briefMarkdown } from '../tasks/hackathon/environment.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { catalog } from './pricing.js';
import { createTrace } from './traces.js';
import { createExperiment, taskInfo } from './experiments.js';

async function main() {
  const backend = process.env.AGENT_BACKEND ?? 'adaption';
  if (!['baseline', 'adaption'].includes(backend)) throw new Error('AGENT_BACKEND must be baseline or adaption');
  const defaults = taskInfo(process.env.TASK).defaults;
  const repetitions = Number(process.env.REPETITIONS ?? 1);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) throw new Error('REPETITIONS must be 1..100');
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    const id = randomUUID();
    let trace: ReturnType<typeof createTrace>;
    const observe: import('./types.js').Observer = event => trace.append(event);
    const count = Number(process.env.AGENT_COUNT ?? defaults.count);
    const experiment = createExperiment({
      mode: backend === 'baseline' ? 'demo' : backend, count,
      rounds: Number(process.env.ROUNDS ?? defaults.rounds), objective: process.env.OBJECTIVE,
      models: process.env.AGENT_MODELS?.split(',') ?? Array.from({ length: count }, (_, i) => catalog.models[(i + repetition - 1) % catalog.models.length].id),
    }, observe);
    console.log(`Planning estimate: ${experiment.setup.pricing.expectedCharge.toFixed(6)} credits. ${experiment.setup.pricing.assumptions}`);
    console.table(experiment.setup.assignments.map(a => ({ agent: a.name, model: a.model, role: a.label })));
    trace = createTrace(id, { ...experiment.config, repetition }, experiment.agents, experiment.setup);
    observe({ type: 'run.started', data: { ...experiment.config, repetition, agents: experiment.agents } });
    observe({ type: 'operator.setup', data: experiment.setup });
    try {
      const result = await experiment.run();
      await mkdir('results', { recursive: true });
      await writeFile(`results/run-${id}.json`, JSON.stringify({ ...experiment.config, repetition, ...result }, null, 2), { flag: 'wx' });
      await writeFile(`results/run-${id}.md`, briefMarkdown(result), { flag: 'wx' });
      observe({ type: 'run.completed', data: result });
      console.log(`Swarm Chamber / ${backend} / repetition ${repetition}: results/run-${id}.json`);
    } catch (error) {
      observe({ type: 'run.failed', data: { message: error instanceof Error ? error.message : 'Run failed' } });
      throw error;
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
