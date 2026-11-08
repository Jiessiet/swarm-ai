import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { createTrace, readTrajectory, traceRoot } from '../src/traces.js';
import { runEnvironment } from '../src/environment.js';
test('persisted public and per-agent private traces are separated', () => {
  const id = randomUUID();
  try {
    const trace = createTrace(id, { mode: 'test' }, ['Alice', 'Bob']);
    trace.append({ type: 'agent.observation', agent: 'Alice', data: { secret: 'alice-only' } });
    trace.append({ type: 'sdk.item.completed', agent: 'Bob', data: { secret: 'bob-only' } });
    trace.append({ type: 'agent.message', agent: 'Alice', data: { text: 'Hello group' } });
    trace.append({ type: 'run.stopped' });
    const shared = readTrajectory(id);
    assert.equal(shared.manifest.status, 'stopped');
    assert.ok(!JSON.stringify(shared.events).includes('only'));
    const alice = readTrajectory(id, 'agent-1');
    assert.ok(JSON.stringify(alice.events).includes('alice-only'));
    assert.ok(!JSON.stringify(alice.events).includes('bob-only'));
    assert.ok(JSON.stringify(alice.events).includes('Hello group'));
    assert.throws(() => readTrajectory(id, '../operator'));
    assert.throws(() => readTrajectory('../outside'));
  } finally { rmSync(join(traceRoot, id), { recursive: true, force: true }); }
});
test('agents receive validated shared messages, not private SDK events', async () => {
  const events: any[] = [];
  await runEnvironment([
    { name: 'Alice', async decide() { events.push({ type: 'sdk.item.completed', data: { secret: 'private-tool-output' } }); return { take: 1, reason: 'Share', message: 'Hello Bob' }; } },
    { name: 'Bob', async decide(o) {
      assert.equal(o.sharedMessages?.[0].text, 'Hello Bob');
      assert.equal(o.history[0].agent, 'Alice');
      assert.ok(!JSON.stringify(o).includes('private-tool-output'));
      o.sharedMessages![0].text = 'mutated';
      return { take: 1, reason: 'Reply', message: 'Hello Alice' };
    } },
  ], 1, 5, 4, e => events.push(e));
  assert.equal(events.find(e => e.type === 'agent.message').data.text, 'Hello Bob');
  assert.equal(events.filter(e => e.type === 'agent.message').length, 2);
});
