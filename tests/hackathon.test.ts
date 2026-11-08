import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHackathon, validateBrief, briefMarkdown } from '../tasks/hackathon/environment.js';
import { demoDecision, roles } from '../tasks/hackathon/definition.js';
import { publicAddress, validatePublicUrl, plainText, type WebResearch } from '../tasks/hackathon/web.js';
import { createExperiment, describeSetup } from '../src/experiments.js';
import { estimatePricing, assignModels } from '../src/pricing.js';
import { visibility } from '../src/traces.js';
import type { Agent } from '../src/types.js';
import type { Brief, HackathonObservation } from '../tasks/hackathon/types.js';
const share = (message = 'Shared evidence and a concrete research proposal', sourceIds: string[] = []) => ({ action: 'share', query: '', url: '', message, sourceIds });
const brief = () => demoDecision({ phase: 'synthesis' } as HackathonObservation) as Brief;
function team(decide?: (o: HackathonObservation, i: number, signal?: AbortSignal) => Promise<unknown>): Agent<HackathonObservation>[] {
  return roles.map((_, i) => ({ name: `Agent ${i}`, decide: (o, signal) => decide ? decide(o, i, signal) : Promise.resolve(o.phase === 'synthesis' ? brief() : share()) }));
}
const noWeb: WebResearch = { async search() { throw new Error('No network in offline tests'); }, async read() { throw new Error('No network in offline tests'); } };
test('agents receive shared research, tool evidence and critiques before final synthesis', async () => {
  const calls: string[] = [], events: any[] = [];
  let leadSawCritiques = false;
  const result = await runHackathon(team(async (o, i) => {
    if (o.phase === 'research' && i === 0) {
      if (!o.toolFeedback) return { ...share(), action: 'search', query: 'multi agent safety' };
      if (o.sources.length === 1) return { ...share(), action: 'read', url: o.sources[0].url };
      assert.equal(o.sources[1].kind, 'page'); return share('Read the primary source; proposing a matched evaluation.', ['S2']);
    }
    if (o.phase === 'research' && i === 1) {
      assert.equal(o.history[0].sourceIds[0], 'S2'); assert.equal(o.sources.length, 2);
      // Mutating a prompt must not rewrite team state.
      o.history[0].message = 'mutation'; o.sources[0].title = 'mutation';
    }
    if (o.phase === 'synthesis') { leadSawCritiques = o.history.filter(c => c.phase === 'critique').length === 5; const b = brief(); b.relatedWork = [{ sourceId: 'S2', relevance: 'Primary source on the mechanism.' }]; return b; }
    return share(`Round ${o.round}: respond to peers with controls and feasibility checks.`);
  }), 3, e => events.push(e), undefined, {
    async search(query) { calls.push(query); return [{ title: 'Research evidence', url: 'https://example.com/paper', text: 'Discovery metadata', kind: 'search-result', retrievedAt: '2026-11-07' }]; },
    async read(url) { calls.push(url); return { title: 'Primary paper', url, text: 'Primary source contents', kind: 'page', retrievedAt: '2026-11-07' }; },
  });
  assert.equal(calls.length, 2); assert.equal(result.contributions.length, 15); assert.ok(leadSawCritiques);
  assert.equal(result.sources[0].title, 'Research evidence'); assert.ok(!result.contributions.some(c => c.message === 'mutation'));
  assert.equal(result.empiricalStatus, 'not-run'); assert.equal(result.evidence.pagesRead, 1);
  assert.match(briefMarkdown(result), /empirical experiment not yet run/i);
  assert.ok(events.filter(e => e.type.startsWith('hackathon.')).every(e => visibility(e) === 'public'));
});
test('web failures reach the agent and exhausted action budgets terminate without endless calls', async () => {
  let feedbackSeen = false;
  const agents = team(async (o, i) => {
    if (o.phase === 'synthesis') return brief();
    if (i === 0 && o.phase === 'research') {
      if (!o.toolFeedback) return { ...share(), action: 'search', query: 'safety' };
      feedbackSeen = JSON.stringify(o.toolFeedback).includes('No network');
    }
    return share('Evidence gap: browsing failed; verify related work before claims.');
  });
  await runHackathon(agents, 3, undefined, undefined, noWeb); assert.ok(feedbackSeen);
  let calls = 0;
  await assert.rejects(runHackathon(team(async () => { calls++; return { ...share(), action: 'search', query: 'safety' }; }), 3, undefined, undefined, noWeb), /budget exhausted/);
  assert.equal(calls, 5);
});
test('rejects fabricated citations, malformed briefs, overlong plans and invalid settings', async () => {
  await assert.rejects(runHackathon(team(async () => share('Fabricated evidence', ['invented'])), 3), /unknown source/);
  const b = brief(); b.schedule[0].hours = 8; assert.throws(() => validateBrief(b, []), /eight-hour/);
  const fabricated = brief(); fabricated.relatedWork = [{ sourceId: 'S999', relevance: 'invented' }]; assert.throws(() => validateBrief(fabricated, []), /unknown source/);
  const missing: any = brief(); delete missing.experiment.baseline; assert.throws(() => validateBrief(missing, []), /baseline/);
  assert.throws(() => createExperiment({ task: 'hackathon', count: 4 }, () => {}), /five agents/);
  assert.throws(() => createExperiment({ task: 'hackathon', rounds: 1 }, () => {}), /3..6 rounds/);
});
test('cancellation propagates through an in-progress web action and publishes no brief', async () => {
  const controller = new AbortController(); const events: any[] = [];
  await assert.rejects(runHackathon(team(async () => ({ ...share(), action: 'search', query: 'safety' })), 3, e => events.push(e), controller.signal, {
    async search(_q, signal) { controller.abort(); signal?.throwIfAborted(); return []; }, read: noWeb.read,
  }), /abort/i);
  assert.ok(!events.some(e => e.type === 'hackathon.brief'));
});
test('demo has no internet calls, task-specific setup, zero billing and an eight-hour plan', async () => {
  const setup = describeSetup({}); assert.equal(setup.task, 'hackathon'); assert.equal(setup.assignments.length, 5);
  const result = await runHackathon(team(async o => demoDecision(o)), 3, undefined, undefined, noWeb, true);
  assert.equal(result.simulated, true); assert.equal(result.sources.length, 0); assert.equal(result.brief.schedule.reduce((sum, s) => sum + s.hours, 0), 8);
  assert.match(briefMarkdown(result), /SIMULATED DEMO/);
  assert.equal(estimatePricing('hackathon', 3, assignModels(5), 'demo').expectedCharge, 0);
  assert.equal(estimatePricing('hackathon', 3, assignModels(5)).calls, 36);
});
test('page access rejects local and private targets and strips executable page content', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '::1', 'fe80::1', '::ffff:127.0.0.1']) assert.equal(publicAddress(address), false);
  assert.equal(publicAddress('8.8.8.8'), true);
  for (const url of ['http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://user:password@example.com', 'https://example.com:8080']) await assert.rejects(validatePublicUrl(url));
  assert.equal(plainText('<script>attack()</script><h1>Paper &amp; evidence</h1>'), 'Paper & evidence');
});
