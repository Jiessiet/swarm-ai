import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { runEnvironment } from './environment.js';
import { baseline, adaptionAgent } from './providers.js';
async function main() {
  const backend = process.env.AGENT_BACKEND ?? 'adaption';
  if (!['baseline', 'adaption'].includes(backend)) throw new Error('AGENT_BACKEND must be baseline or adaption');
  const agents = [1, 2, 3].map(i => (backend === 'baseline' ? baseline : adaptionAgent)(`${backend}-${i}`));
  const result = await runEnvironment(agents, Number(process.env.ROUNDS ?? 3), Number(process.env.STARTING_TOKENS ?? 12), Number(process.env.MAX_TAKE ?? 4));
  await mkdir('results', { recursive: true });
  const path = `results/run-${randomUUID()}.json`;
  await writeFile(path, JSON.stringify({ timestamp: new Date().toISOString(), backend, ...result }, null, 2), { flag: 'wx' });
  console.table(result.turns);
  console.log(`Pool remaining: ${result.poolRemaining}. Saved ${path}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
