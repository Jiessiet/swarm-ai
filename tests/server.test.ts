import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDashboard } from '../src/server.js';
test('dashboard streams turns, rejects overlapping runs, and stops cleanly', async () => {
  const server = createDashboard().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const abort = new AbortController();
  try {
    assert.equal((await fetch(base)).status, 200);
    const setup = await (await fetch(base + '/setup?task=shared-fund&condition=planted&rounds=4')).json();
    assert.equal(setup.assignments[4].role, 'planted');
    assert.equal(setup.rounds, 4);
    const task = await (await fetch(base + '/task')).json();
    assert.equal(task.id, 'shared-resource');
    assert.deepEqual(task.defaults, { count: 3, rounds: 3, tokens: 12, maxTake: 4 });
    assert.equal((await fetch(base + '/run', { method: 'POST', headers: { Origin: 'https://example.com' }, body: '{}' })).status, 403);
    assert.equal((await fetch(base + '/run', { method: 'POST', body: '{"count":99}' })).status, 400);
    const response = await fetch(base + '/events', { signal: abort.signal });
    const reader = response.body!.getReader();
    const start = () => fetch(base + '/run', { method: 'POST', body: JSON.stringify({ mode: 'demo', count: 2, rounds: 1, tokens: 6 }) });
    assert.equal((await start()).status, 202);
    assert.equal((await start()).status, 409);
    let stream = '';
    while (!stream.includes('agent.decision')) {
      const chunk = await reader.read(); stream += new TextDecoder().decode(chunk.value);
    }
    assert.match(stream, /agent.observation/);
    assert.match(stream, /sdk.item.updated/);
    assert.equal((await fetch(base + '/stop', { method: 'POST' })).status, 202);
    while (!stream.includes('run.stopped')) { const chunk = await reader.read(); stream += new TextDecoder().decode(chunk.value); }
    assert.match(stream, /Stopped by user/);
    await reader.cancel();
    const runs = await (await fetch(base + '/runs')).json();
    const run = runs.find((r: any) => r.config.tokens === 6 && r.config.mode === 'demo');
    assert.ok(run);
    const publicTrace = await (await fetch(base + '/runs/' + run.id)).json();
    assert.ok(publicTrace.events.every((e: any) => e.visibility === 'public'));
    assert.ok(publicTrace.events.some((e: any) => e.type === 'agent.message'));
    const privateTrace = await (await fetch(base + '/runs/' + run.id + '?agent=agent-1')).json();
    assert.ok(privateTrace.events.some((e: any) => e.type === 'sdk.item.updated'));
    assert.ok(!privateTrace.events.some((e: any) => e.visibility === 'private' && e.agent === 'Agent 02'));
    assert.equal((await fetch(base + '/runs/' + run.id + '?agent=unknown')).status, 400);
  } finally { abort.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
