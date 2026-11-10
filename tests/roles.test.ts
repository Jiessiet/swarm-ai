import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Codex } from '@openai/codex-sdk';
import { createRoleController, normalizeRoles } from '../src/roles.js';
import { createExperiment } from '../src/experiments.js';
import { runHackathon } from '../tasks/hackathon/environment.js';
import { createNetworkController } from '../src/network.js';
import { demoDecision } from '../tasks/hackathon/definition.js';
import type { HackathonObservation } from '../tasks/hackathon/types.js';
const share = () => ({ action:'share', query:'', url:'', message:'A grounded research proposal', sourceIds:[] });
const brief = () => demoDecision({phase:'synthesis'} as HackathonObservation);

test('role assignments validate size, titles and instruction limits and reject stale revisions', () => {
  const controller=createRoleController(5), initial=controller.get();
  const edited=structuredClone(initial.assignments);edited[0]={title:'  Red team  ',instructions:'Challenge assumptions.'};
  assert.equal(controller.update(edited,0).assignments[0].title,'Red team');
  assert.equal(controller.get().revision,1);
  edited[0].title='mutated';assert.equal(controller.get().assignments[0].title,'Red team');
  assert.throws(()=>controller.update(initial.assignments,0),/Roles changed/);
  assert.throws(()=>normalizeRoles(5,[]),/one role/);
  for(const role of [{title:' ',instructions:''},{title:'x'.repeat(81),instructions:''},{title:'Role',instructions:'x'.repeat(2001)},{title:'Role',instructions:42}]) {
    const roles=structuredClone(initial.assignments);roles[0]=role as any;
    assert.throws(()=>controller.update(roles,1),/Role title/);
  }
  assert.equal(controller.get().revision,1);
});

test('live role edits apply at the next decision while in-flight contributions retain their assignment', async () => {
  const roles=createRoleController(5);let changed=false,returned=false;
  const agents=Array.from({length:5},(_,i)=>({name:`Agent ${i}`,async decide(o:HackathonObservation){
    if(i===0&&o.phase==='research') {
      assert.equal(o.role,'Literature scout');
      const next=roles.get().assignments;next[0]={title:'Red-team researcher',instructions:'Challenge every proposed safety mechanism.'};roles.update(next,0);changed=true;
      assert.equal(o.role,'Literature scout');assert.equal(o.roleRevision,0);
    }
    if(i===0&&o.phase==='proposal') {
      assert.equal(o.role,'Red-team researcher');assert.equal(o.roleInstructions,'Challenge every proposed safety mechanism.');assert.equal(o.roleRevision,1);returned=true;
    }
    return o.phase==='synthesis'?brief():share();
  }}));
  const result=await runHackathon(agents,3,undefined,undefined,undefined,true,createNetworkController(5),undefined,roles);
  assert.ok(changed&&returned);assert.equal(result.errors.length,0);
  assert.equal(result.contributions[0].role,'Literature scout');assert.equal(result.contributions[0].roleRevision,0);
  assert.equal(result.contributions.find(c=>c.agent==='Agent 0'&&c.phase==='proposal')?.role,'Red-team researcher');
  assert.equal(result.roleSettings.revision,1);
});

test('role updates apply on retries and synthesis still uses the brief schema', async () => {
  const roles=createRoleController(2);let attempts=0,synthesis=false;
  const agents=Array.from({length:2},(_,i)=>({name:`Agent ${i}`,async decide(o:HackathonObservation){
    if(i===0&&o.phase==='research') {
      if(++attempts===1){const next=roles.get().assignments;next[0]={title:'Statistician',instructions:'Audit statistical power.'};next[1]={title:'Reviewer',instructions:'Find confounds.'};roles.update(next,0);throw new Error('Transient error');}
      assert.equal(o.role,'Statistician');assert.equal(o.roleRevision,1);
    }
    if(o.phase==='synthesis'){assert.match(o.role,/Reviewer; acting synthesis lead/);assert.equal(o.roleInstructions,'Find confounds.');synthesis=true;return brief();}
    return share();
  }}));
  const result=await runHackathon(agents,3,undefined,undefined,undefined,true,createNetworkController(2),undefined,roles);
  assert.ok(synthesis&&result.brief);assert.equal(result.errors.length,1);assert.equal(attempts,2);
});

test('custom roles survive experiment configuration and replace fixed role instructions in model prompts', async t => {
  const priorKey=process.env.ADAPTION_API_KEY;process.env.ADAPTION_API_KEY='offline-test';
  const roles=normalizeRoles(2).assignments;roles[0]={title:'Initial custom reviewer',instructions:'Inspect controls.'};
  const observations:HackathonObservation[]=[];const prompts:string[]=[];
  t.mock.method(Codex.prototype,'startThread',()=>({async runStreamed(prompt:string){
    prompts.push(prompt);const o=JSON.parse(prompt.split('\n').at(-1)!) as HackathonObservation;observations.push(o);
    return {events:(async function*(){yield {type:'item.completed',item:{type:'agent_message',text:JSON.stringify(o.phase==='synthesis'?brief():share())}};})()};
  }}));
  try {
    const experiment=createExperiment({task:'hackathon',count:2,mode:'adaption',roles},()=>{});
    assert.equal(experiment.setup.assignments[0].label,'Initial custom reviewer');
    const next=experiment.roles!.get().assignments;next[0]={title:'Updated reviewer',instructions:'Evaluate alternative hypotheses.'};experiment.roles!.update(next,0);
    const result=await experiment.run();assert.equal((result as any).completion,'complete');
    assert.equal(observations[0].role,'Updated reviewer');assert.equal(observations[0].roleInstructions,'Evaluate alternative hypotheses.');
    assert.ok(!prompts[0].includes('Your role: Literature scout'));
    assert.ok(!prompts[0].includes('Initial custom reviewer'));
  } finally {if(priorKey===undefined)delete process.env.ADAPTION_API_KEY;else process.env.ADAPTION_API_KEY=priorKey;}
});
