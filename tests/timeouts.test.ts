import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentTimeoutMs, AgentTimeoutError, withAgentTimeout } from '../src/timeouts.js';

test('uses a configurable ten-minute deadline and rejects invalid settings', () => {
  assert.equal(agentTimeoutMs({}), 600_000);
  assert.equal(agentTimeoutMs({ AGENT_TIMEOUT_SECONDS: '900' }), 900_000);
  for (const value of ['', '0', '-1', '1.5', 'NaN', '3601']) assert.throws(() => agentTimeoutMs({ AGENT_TIMEOUT_SECONDS: value }), /AGENT_TIMEOUT_SECONDS/);
});
test('times out even when a provider ignores cancellation, with a specific agent error', async () => {
  let forwarded: AbortSignal | undefined;
  await assert.rejects(withAgentTimeout('Agent E', 10, async signal => {
    forwarded = signal;
    return await new Promise<never>(() => {});
  }), error => error instanceof AgentTimeoutError && error.agent === 'Agent E' && error.timeoutMs === 10 && /timed out/.test(error.message));
  assert.equal(forwarded?.aborted, true);
});
test('successful calls clean up their deadlines and preserve provider errors', async () => {
  let forwarded: AbortSignal | undefined;
  assert.equal(await withAgentTimeout('A', 10, async signal => { forwarded = signal; return 42; }), 42);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(forwarded?.aborted, false);
  const error = new Error('Provider rejected request');
  await assert.rejects(withAgentTimeout('A', 100, async () => { throw error; }), e => e === error);
});
test('operator cancellation remains cancellation, never a recoverable agent timeout', async () => {
  const controller = new AbortController();
  const stopped = new Error('Stopped by user');
  await assert.rejects(withAgentTimeout('E', 100, async signal => {
    controller.abort(stopped);
    assert.ok(signal.aborted);
    return new Promise<never>(() => {});
  }, controller.signal), error => error === stopped);
  await assert.rejects(withAgentTimeout('E', 100, async () => { throw new Error('Must not start'); }, controller.signal), error => error === stopped);
});
