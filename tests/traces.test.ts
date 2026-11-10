import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { createTrace, readTrajectory, traceRoot } from '../src/traces.js';
import { runHackathon } from '../tasks/hackathon/environment.js';
import { demoDecision } from '../tasks/hackathon/definition.js';
test('persisted public and per-agent private traces are separated', () => {
  const id = randomUUID();
  try {
    const trace = createTrace(id, { mode: 'test' }, ['Alice', 'Bob'], { assignments: [{ name: 'Bob', role: 'Reviewer' }] });
    trace.append({ type: 'operator.setup', data: { assignments: [{ name: 'Bob', role: 'Reviewer' }] } });
    trace.append({ type: 'agent.observation', agent: 'Alice', data: { secret: 'alice-only' } });
    trace.append({ type: 'sdk.item.completed', agent: 'Bob', data: { secret: 'bob-only' } });
    trace.append({ type: 'agent.message', agent: 'Alice', data: { text: 'Hello group' } });
    trace.append({ type: 'run.stopped' });
    const shared = readTrajectory(id);
    assert.equal(shared.manifest.status, 'stopped');
    assert.equal(shared.manifest.setup.assignments[0].role, 'Reviewer');
    assert.ok(!shared.events.some(e => e.type === 'operator.setup'));
    assert.ok(!JSON.stringify(shared.events).includes('only'));
    const alice = readTrajectory(id, 'agent-1');
    assert.ok(JSON.stringify(alice.events).includes('alice-only'));
    assert.ok(!JSON.stringify(alice.events).includes('bob-only'));
    assert.ok(JSON.stringify(alice.events).includes('Hello group'));
    assert.throws(() => readTrajectory(id, '../operator'));
    assert.throws(() => readTrajectory('../outside'));
  } finally { rmSync(join(traceRoot, id), { recursive: true, force: true }); }
});
test('agents receive validated contributions, not private SDK events', async () => {
  const events: any[] = [];
  await runHackathon([
    { name: 'Alice', async decide(o) {
      if(o.phase === 'synthesis') return demoDecision(o);
      events.push({ type: 'sdk.item.completed', data: { secret: 'private-tool-output' } });
      return { action:'share', query:'', url:'', message:'Hello Bob', sourceIds:[] };
    } },
    { name: 'Bob', async decide(o) {
      if(o.phase === 'synthesis') return demoDecision(o);
      assert.equal(o.history[0].agent, 'Alice');
      assert.ok(!JSON.stringify(o).includes('private-tool-output'));
      o.history[0].message = 'mutated';
      return { action:'share', query:'', url:'', message:'Hello Alice', sourceIds:[] };
    } },
  ], 3, e => events.push(e), undefined, undefined, true);
  const contributions=events.filter(e=>e.type==='hackathon.contribution');
  assert.equal(contributions[0].data.message,'Hello Bob');
  assert.equal(contributions.length,6);
});

test('saves partial hackathon status and public timeout records for replay', () => {
  const id = randomUUID();
  try {
    const trace = createTrace(id, { task: 'hackathon' }, ['Agent E']);
    trace.append({ type: 'hackathon.agent.timeout', agent: 'Agent E', data: { phase: 'synthesis', round: 4, timeoutSeconds: 600, message: 'Agent E timed out after 600 seconds' } });
    trace.append({ type: 'run.completed', data: { completion: 'partial', brief: null } });
    const saved = readTrajectory(id);
    assert.equal(saved.manifest.status, 'partial');
    assert.equal(saved.events[0].type, 'hackathon.agent.timeout');
    assert.equal(saved.events[0].visibility, 'public');
    assert.equal(saved.events[1].type, 'run.completed');
  } finally { rmSync(join(traceRoot, id), { recursive: true, force: true }); }
});
