import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNetworkController, normalizeNetwork } from '../src/network.js';
import { createExperiment } from '../src/experiments.js';
import { runHackathon } from '../tasks/hackathon/environment.js';
import { demoDecision } from '../tasks/hackathon/definition.js';
import type { Agent } from '../src/types.js';
import type { HackathonObservation } from '../tasks/hackathon/types.js';
const share = (message = 'Research proposal', sourceIds: string[] = []) => ({ action: 'share', query: '', url: '', message, sourceIds });
const brief = () => demoDecision({ phase: 'synthesis' } as HackathonObservation);
function team(decide: (o: HackathonObservation, i: number) => Promise<unknown>, count = 5): Agent<HackathonObservation>[] {
  return Array.from({length: count}, (_, i) => ({name: `Agent ${i}`, decide: o => decide(o,i)}));
}
test('validates directed networks and rejects stale edits without mutating the graph', () => {
  const controller = createNetworkController(5);
  assert.equal(controller.get().edges.length,20);
  const draft=controller.get(); draft.edges=[]; assert.equal(controller.get().edges.length,20);
  const next=controller.update({count:5,edges:[{from:0,to:1}]},0);
  assert.equal(next.revision,1);
  assert.throws(()=>controller.update({count:5,edges:[]},0),/changed/);
  for(const edges of [[{from:0,to:0}],[{from:0,to:5}],[{from:0,to:1},{from:0,to:1}],[{from:'0',to:1}]]) assert.throws(()=>normalizeNetwork(5,{count:5,edges}));
  assert.throws(()=>controller.update({count:4,edges:[]},1),/Invalid network/);
  assert.deepEqual(controller.get(),next);
});
test('directed edges route history and sources; disconnected agents and synthesis get no global bypass', async () => {
  const network=createNetworkController(5,{count:5,edges:[{from:0,to:1},{from:1,to:2}]});
  let aCalls=0, relayed=false, synthesisChecked=false;
  const result=await runHackathon(team(async (o,i)=>{
    if(o.phase==='synthesis') { assert.equal(i,4);assert.equal(o.history.length,3);assert.ok(o.history.every(c=>c.agent==='Agent 4'));assert.equal(o.sources.length,0);synthesisChecked=true;return brief(); }
    if(o.phase==='research'&&i===0) {
      assert.equal(o.history.length,0);
      if(++aCalls===1)return {...share(),action:'search',query:'safety'};
      return share('Original evidence',['S1']);
    }
    if(o.phase==='research'&&i===1){assert.deepEqual(o.incomingPeers,['Agent 0']);assert.equal(o.sources[0].id,'S1');assert.equal(o.history[0].agent,'Agent 0');return share('Relayed the cited evidence',['S1']);}
    if(o.phase==='research'&&i===2){assert.ok(!o.history.some(c=>c.agent==='Agent 0'));assert.equal(o.history[0].agent,'Agent 1');assert.equal(o.sources[0].id,'S1');relayed=true;}
    if(i===3){assert.ok(o.history.every(c=>c.agent==='Agent 3'));assert.equal(o.sources.length,0);}
    return share();
  }),3,undefined,undefined,{async search(){return [{title:'Source',url:'https://example.com',text:'Evidence',kind:'search-result',retrievedAt:'2026-11-09'}];},async read(){throw new Error('unused');}},false,network);
  assert.ok(relayed&&synthesisChecked);assert.equal(result.completion,'complete');assert.equal(result.contributions.length,15);
});
test('live edge removal takes effect on the next decision and retains operator records', async () => {
  const network=createNetworkController(5);let checked=false;
  const result=await runHackathon(team(async(o,i)=>{
    if(o.phase==='research'&&i===0){network.update({count:5,edges:[]},0);return share('Only the operator retains this globally');}
    if(o.phase==='research'&&i===1){assert.equal(o.network.revision,1);assert.equal(o.history.length,0);checked=true;}
    return o.phase==='synthesis'?brief():share();
  }),3,undefined,undefined,undefined,true,network,'Investigate coordination failures');
  assert.ok(checked);assert.equal(result.network.revision,1);assert.equal(result.contributions.length,15);assert.equal(result.objective,'Investigate coordination failures');
});
test('supports smaller and larger research teams with matching model and role setup', () => {
  for(const count of [2,5,7]){
    const experiment=createExperiment({task:'hackathon',count,mode:'demo',network:{count,edges:[]},objective:'Study communication topology'},()=>{});
    assert.equal(experiment.agents.length,count);assert.equal(experiment.setup.assignments.length,count);assert.equal(experiment.config.network?.count,count);assert.equal(experiment.setup.pricing.perAgent.length,count);
  }
  assert.throws(()=>createExperiment({task:'hackathon',objective:''},()=>{}),/objective/);
  assert.throws(()=>createExperiment({task:'hackathon',network:{count:5,edges:[{from:0,to:9}]}},()=>{}),/edge/);
});
