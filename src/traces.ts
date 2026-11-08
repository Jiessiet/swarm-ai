import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Activity } from './types.js';
export type TraceEvent = Activity & { id: number; time: string; run: string; visibility: 'public' | 'private' };
export const traceRoot = resolve(process.env.TRACE_DIR ?? 'traces');
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function runPath(id: string) { if (!validId.test(id)) throw new Error('Invalid run ID'); return join(traceRoot, id); }
export function visibility(event: Activity): 'public' | 'private' {
  return ['run.started', 'run.completed', 'run.stopped', 'agent.decision', 'agent.message', 'fund.round'].includes(event.type) ? 'public' : 'private';
}
export function createTrace(id: string, config: Record<string, unknown>, agents: string[]) {
  const directory = runPath(id);
  const members = agents.map((name, index) => ({ name, id: `agent-${index + 1}` }));
  mkdirSync(join(directory, 'public'), { recursive: true, mode: 0o700 });
  for (const member of members) mkdirSync(join(directory, 'agents', member.id), { recursive: true, mode: 0o700 });
  const manifest = { id, created: new Date().toISOString(), status: 'running', config, agents: members };
  const save = () => writeFileSync(join(directory, 'run.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  save(); let sequence = 0;
  return {
    append(event: Activity): TraceEvent {
      const record: TraceEvent = { ...event, run: id, id: ++sequence, time: new Date().toISOString(), visibility: visibility(event) };
      const member = members.find(a => a.name === event.agent);
      const target = record.visibility === 'public' ? join(directory, 'public', 'events.jsonl') : member ? join(directory, 'agents', member.id, 'private.jsonl') : join(directory, 'operator.jsonl');
      appendFileSync(target, JSON.stringify(record) + '\n', { mode: 0o600 });
      if (['run.completed', 'run.stopped', 'run.failed'].includes(event.type)) { manifest.status = event.type.slice(4); save(); }
      return record;
    },
  };
}
export function listTraces() {
  mkdirSync(traceRoot, { recursive: true, mode: 0o700 });
  return readdirSync(traceRoot).filter(id => validId.test(id)).flatMap(id => {
    try { return [JSON.parse(readFileSync(join(runPath(id), 'run.json'), 'utf8'))]; } catch { return []; }
  }).sort((a, b) => b.created.localeCompare(a.created));
}
export function readTrajectory(id: string, agent?: string): { manifest: any; events: TraceEvent[] } {
  const directory = runPath(id);
  const manifest = JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8'));
  const read = (path: string): TraceEvent[] => {
    try { return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  };
  const events = read(join(directory, 'public', 'events.jsonl'));
  if (agent) {
    const member = manifest.agents.find((a: { id: string }) => a.id === agent);
    if (!member) throw new Error('Unknown agent');
    events.push(...read(join(directory, 'agents', member.id, 'private.jsonl')));
  }
  return { manifest, events: events.sort((a, b) => a.id - b.id) };
}
