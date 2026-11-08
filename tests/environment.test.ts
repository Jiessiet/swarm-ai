import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEnvironment, validateDecision } from '../src/environment.js';
import { baseline } from '../src/providers.js';
test('conserves resources and rotates the first mover', async () => {
  const result = await runEnvironment([baseline('a'), baseline('b')], 3, 9, 4);
  assert.equal(result.turns.reduce((sum, t) => sum + t.take, 0) + result.poolRemaining, 9);
  assert.deepEqual(result.turns.filter(t => t.round === 2).map(t => t.agent), ['b', 'a']);
  assert.ok(result.turns.every(t => t.poolRemaining >= 0));
});
test('rejects malformed and out of range model decisions', () => {
  for (const take of [-1, 5, 1.5, '2', true]) assert.throws(() => validateDecision({ take, reason: 'x' }, 4));
});
test('history cannot be mutated by an agent', async () => {
  const result = await runEnvironment([baseline('a'), { name: 'b', async decide(o) { o.history[0].take = 99; return { take: 0, reason: 'wait' }; } }], 1);
  assert.equal(result.turns[0].take, 2);
});
test('stops at exhaustion and propagates provider failures', async () => {
  assert.equal((await runEnvironment([baseline('a')], 5, 1)).turns.length, 1);
  await assert.rejects(runEnvironment([{ name: 'broken', async decide() { throw new Error('offline'); } }]), /offline/);
});
