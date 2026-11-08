import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { runEnvironment } from './environment.js';
import { baseline, adaptionAgent } from './providers.js';
import { createTrace } from './traces.js';
import { defaults, taskId } from '../tasks/shared-resource/definition.js';
async function main() {
  const backend = process.env.AGENT_BACKEND ?? 'adaption';
  if (!['baseline', 'adaption'].includes(backend)) throw new Error('AGENT_BACKEND must be baseline or adaption');
  const runId = randomUUID();
  let trace: ReturnType<typeof createTrace>;
  const observe = (event: import('./types.js').Activity) => trace.append(event);
  const agents = Array.from({ length: defaults.count }, (_, index) => index + 1).map(i => (backend === 'baseline' ? baseline(`${backend}-${i}`) : adaptionAgent(`${backend}-${i}`, observe)));
  trace = createTrace(runId, { task: taskId, mode: backend }, agents.map(a => a.name));
  observe({ type: 'run.started', data: { mode: backend, agents: agents.map(a => a.name), tokens: Number(process.env.STARTING_TOKENS ?? defaults.tokens) } });
  let result;
  try { result = await runEnvironment(agents, Number(process.env.ROUNDS ?? defaults.rounds), Number(process.env.STARTING_TOKENS ?? defaults.tokens), Number(process.env.MAX_TAKE ?? defaults.maxTake), observe);
    observe({ type: 'run.completed', data: result });
  } catch (error) { observe({ type: 'run.failed', data: { message: error instanceof Error ? error.message : 'Run failed' } }); throw error; }
  await mkdir('results', { recursive: true });
  const path = `results/run-${randomUUID()}.json`;
  await writeFile(path, JSON.stringify({ timestamp: new Date().toISOString(), backend, task: taskId, ...result }, null, 2), { flag: 'wx' });
  console.table(result.turns);
  console.log(`Pool remaining: ${result.poolRemaining}. Saved ${path}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
