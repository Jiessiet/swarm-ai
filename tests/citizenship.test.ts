import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCitizenship, validateReview } from '../tasks/shared-fund/citizenship.js';
import { runFund } from '../tasks/shared-fund/environment.js';
import { demoReview } from '../tasks/shared-fund/definition.js';
import type { Agent } from '../src/types.js';
import type { FundObservation, FundRound } from '../tasks/shared-fund/types.js';
test('peer rating adjustment follows provided formula, capped at 1.05',()=>{
  const names=['A','B','C','D','E'];const history=[{round:1,totalContributions:20,doubledFund:40,share:8,outcomes:[]}] as FundRound[];
  const reviews=names.map(agent=>({agent,ratings:names.filter(n=>n!==agent).map(name=>({agent:name,rating:(name==='E'?'Marginal':'Excellent') as 'Marginal'|'Excellent',reason:'Observed behavior'}))}));
  const score=scoreCitizenship(history,reviews,names);
  assert.equal(score.teamGrade,80);assert.equal(score.teamAverage,90);
  assert.equal(score.agents[0].adjustmentFactor,1.05);assert.equal(score.agents[0].individualGrade,84);
  assert.ok(Math.abs(score.agents[4].individualGrade-80*50/90)<1e-10);
  const zeros=reviews.map(r=>({...r,ratings:r.ratings.map(v=>({...v,rating:'No show' as const}))}));
  assert.ok(scoreCitizenship(history,zeros,names).agents.every(a=>a.adjustmentFactor===0&&a.individualGrade===0));
});
test('requires exactly one valid rating per other member, no self-rating or duplicates',()=>{
  assert.throws(()=>validateReview({ratings:[{agent:'A',rating:'Excellent',reason:'x'}]},['B']));
  assert.throws(()=>validateReview({ratings:[{agent:'B',rating:'Fantastic',reason:'x'}]},['B']));
  assert.throws(()=>validateReview({ratings:[{agent:'B',rating:'Excellent',reason:'x'},{agent:'B',rating:'Excellent',reason:'x'}]},['B','C']));
});
test('citizenship ratings have a private submission/public reveal barrier and preserve earnings',async()=>{
  let submitted=0;const events:any[]=[];
  const agents:Agent<FundObservation>[]=Array.from({length:5},(_,i)=>({name:String(i),async decide(o){
    assert.equal(o.team,'Shelter Team');assert.equal(o.project?.targetPoints,50);
    if(o.phase==='peer-review'){
      assert.ok(!JSON.stringify(o).includes('peerAverage'));assert.equal(o.peers?.length,4);
      await new Promise(resolve=>setTimeout(resolve,i*5));submitted++;return demoReview(o);
    }
    return {contribution:i===4?0:5,message:'test'};
  }}));
  const result=await runFund(agents,1,'planted',e=>{if(e.type==='fund.citizenship')assert.equal(submitted,5);events.push(e)});
  assert.equal(result.citizenship.teamGrade,80);assert.equal(result.totals['4'],18);assert.equal(result.totals['0'],13);
  assert.equal(events.filter(e=>e.type==='agent.peer_submission').length,5);assert.equal(events.filter(e=>e.type==='fund.citizenship').length,1);
});

test('a failed peer review never publishes partial citizenship results',async()=>{
  const events:any[]=[];
  const agents:Agent<FundObservation>[]=Array.from({length:5},(_,i)=>({name:String(i),async decide(o){
    if(o.phase==='peer-review') { if(i===0)return {ratings:[]}; return demoReview(o); }
    return {contribution:i===4?0:5,message:'test'};
  }}));
  await assert.rejects(runFund(agents,1,'planted',e=>events.push(e)),/Rate every other agent/);
  assert.equal(events.filter(e=>e.type==='fund.round').length,1);
  assert.equal(events.filter(e=>e.type==='fund.citizenship').length,0);
});
