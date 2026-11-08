import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFund, validateFundDecision } from '../tasks/shared-fund/environment.js';
import { promptFor, roleFor, demoReview } from '../tasks/shared-fund/definition.js';
import type { Agent } from '../src/types.js';
import type { FundObservation } from '../tasks/shared-fund/types.js';
const agents = (values: number[]): Agent<FundObservation>[] => values.map((c, i) => ({ name: String(i), async decide(o) { if (o.phase === 'peer-review') return demoReview(o); return { contribution: c, message: 'test' }; } }));
test('fund payouts match cooperative and planted examples', async () => {
  const control = await runFund(agents([5,5,5,5,5]), 1, 'control');
  assert.ok(control.rounds[0].outcomes.every(o => o.payoff === 15));
  const planted = await runFund(agents([5,5,5,5,0]), 1, 'planted');
  assert.equal(planted.rounds[0].outcomes[4].payoff, 18);
  assert.ok(planted.rounds[0].outcomes.slice(0,4).every(o => o.payoff === 13));
  assert.equal(planted.rounds[0].outcomes.reduce((s,o)=>s+o.payoff,0), 70);
});
test('round barrier withholds all current-round decisions and isolates history', async () => {
  let received = 0; const publicEvents: any[] = [];
  const group: Agent<FundObservation>[] = Array.from({ length:5 }, (_, i) => ({name: String(i), async decide(o) {
    if (o.phase === 'peer-review') return demoReview(o);
    assert.equal(o.history.length, o.round - 1);
    if (o.round === 1) { received++; await new Promise(resolve => setTimeout(resolve, i * 10)); assert.ok(!publicEvents.length); }
    if (o.round === 2) { assert.equal(o.history[0].outcomes[0].message, 'test'); o.history[0].outcomes[0].message = 'mutated'; }
    return { contribution: 5, message:'test' };
  } }));
  await runFund(group, 2, 'control', e => { if (e.type === 'fund.round') { assert.equal(received, 5); publicEvents.push(e); } });
  assert.equal(publicEvents.length, 2);
});
test('invalid submissions never reveal a partial round and settle cancelled siblings', async () => {
  let reveals = 0, settled = 0;
  const group = agents([5,5,5,5,0]);
  group[0].decide = async () => { throw new Error('provider down'); };
  group[1].decide = async (_, signal) => { await new Promise(resolve => { if (signal?.aborted) resolve(null); else signal?.addEventListener('abort', () => resolve(null)); }); settled++; throw new Error('cancelled'); };
  await assert.rejects(runFund(group, 1, 'planted', e => { if(e.type==='fund.round') reveals++; }), /provider down/);
  assert.equal(reveals, 0); assert.equal(settled, 1);
  for (const c of [-1, 2, '5', true]) assert.throws(() => validateFundDecision({contribution:c,message:'x'}));
  await assert.rejects(runFund(agents([5,5,5,5,5]), 1, 'planted'), /Planted agent/);
});
test('metrics distinguish initial non-contribution, switches, and returns', async () => {
  const group = agents([5,5,5,5,0]);
  group[0].decide = async o => o.phase === 'peer-review' ? demoReview(o) : ({ contribution: o.round === 2 ? 0 : 5, message:'x' });
  const result = await runFund(group, 3, 'planted');
  assert.equal(result.metrics.standardAgents[0].firstSwitchToZero, 2);
  assert.deepEqual(result.metrics.standardAgents[0].returnToFiveRounds,[3]);
  assert.equal(result.metrics.standardAgents.length,4);
});
test('private prompts assign roles without exposing experiment hypothesis to participants', () => {
  assert.equal(roleFor(4,'control'),'standard'); assert.equal(roleFor(4,'planted'),'planted');
  assert.ok(promptFor('A', 10, 'standard').includes('Agent A'));
  assert.ok(!promptFor('A',10,'standard').includes('designated non-contributing'));
  assert.ok(promptFor('E',10,'planted').includes('Contribute $0 every round'));
});

test('operator setup matches actual private assignments in both conditions', async () => {
  const { describeSetup, createExperiment } = await import('../src/experiments.js');
  const setup = describeSetup({ task: 'shared-fund', condition: 'planted', rounds: 7 });
  assert.equal(setup.assignments[4].name, 'Agent E');
  assert.equal(setup.assignments[4].role, 'planted');
  assert.ok(setup.assignments[4].instruction.includes('$0'));
  assert.equal(setup.assignments.filter(a => a.role === 'standard').length, 4);
  const control = createExperiment({ task: 'shared-fund', condition: 'control', rounds: 1, mode: 'demo' }, () => {});
  assert.ok(control.setup.assignments.every(a => a.role === 'standard'));
  assert.equal(control.setup.assignments.length, 5);
  assert.throws(() => describeSetup({ task: 'shared-fund', condition: 'unknown' }));
});
