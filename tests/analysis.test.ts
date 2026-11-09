import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRun, analysisMarkdown } from '../src/analysis.js';
import { createTrace, readAnalysisTrajectory } from '../src/traces.js';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import type { TraceEvent } from '../src/traces.js';
const network={count:2,revision:0,edges:[{from:0,to:1},{from:1,to:0}]};
const manifest={id:'example',created:'2026-11-09T04:00:00.000Z',status:'completed',config:{task:'hackathon',mode:'adaption',objective:'Test coordination'},agents:[{name:'Agent A',id:'agent-1'},{name:'Agent B',id:'agent-2'}],setup:{network,assignments:[{name:'Agent A',label:'Scout',instruction:'Find sources',model:'model-a'},{name:'Agent B',label:'Reviewer',instruction:'Evaluate sources',model:'model-b'}]}};
function records(items:any[]):TraceEvent[]{return items.map((e,i)=>({...e,id:i+1,time:new Date(Date.parse(manifest.created)+i*1000).toISOString(),run:'example',visibility:e.type.startsWith('sdk.')||e.type==='agent.observation'?'private':'public'}));}
const contribution={agent:'Agent A',round:1,phase:'research',message:'Evidence suggests a matched evaluation.',sourceIds:['S1']};
function fixture(){return records([
  {type:'run.started',data:{agents:['Agent A','Agent B']}},
  {type:'agent.prompt',agent:'Agent A',data:{prompt:'PRIVATE_PROMPT_SENTINEL'}},
  {type:'hackathon.phase',data:{phase:'research',round:1}},
  {type:'agent.observation',agent:'Agent A',data:{phase:'research',round:1,role:'Scout',roleRevision:0,network,history:[],sources:[]}},
  {type:'hackathon.web.request',agent:'Agent A',data:{action:'search',query:'coordination safety'}},
  {type:'hackathon.web.result',agent:'Agent A',data:{action:'search',results:[{id:'S1',title:'Primary evidence',url:'https://example.org/paper',kind:'search-result'}]}},
  {type:'sdk.turn.completed',agent:'Agent A',data:{usage:{input_tokens:10,output_tokens:5}}},
  {type:'agent.usage',agent:'Agent A',data:{credits:.01,usage:{input_tokens:10,output_tokens:5}}},
  {type:'hackathon.contribution',agent:'Agent A',data:{...contribution,role:'Scout',roleRevision:0,networkRevision:0,recipients:['Agent B']}},
  {type:'agent.observation',agent:'Agent B',data:{phase:'research',round:1,role:'Reviewer',network,history:[contribution],sources:[{id:'S1'}]}},
  {type:'sdk.item.completed',agent:'Agent B',data:{item:{type:'reasoning',text:'PRIVATE_REASONING_SENTINEL'}}},
  {type:'hackathon.contribution',agent:'Agent B',data:{agent:'Agent B',round:1,phase:'research',message:'Propose a control condition.',sourceIds:['S1'],recipients:['Agent A']}},
  {type:'hackathon.network',data:{network:{count:2,revision:1,edges:[{from:0,to:1}]}}},
  {type:'hackathon.roles',data:{roles:{revision:1,assignments:[{title:'Scout',instructions:'Find sources'},{title:'Statistician',instructions:'Check power'}]},changedAgents:['Agent B']}},
  {type:'hackathon.phase',data:{phase:'synthesis',round:4}},
  {type:'agent.observation',agent:'Agent B',data:{phase:'synthesis',round:4,role:'Statistician; acting synthesis lead',roleRevision:1,network:{count:2,revision:1,edges:[{from:0,to:1}]},history:[contribution],sources:[{id:'S1'}]}},
  {type:'hackathon.brief',agent:'Agent B',data:{completion:'complete',synthesisAgent:'Agent B',brief:{title:'A matched evaluation',researchQuestion:'Does topology change coordination?',pitch:'Test it.',relatedWork:[{sourceId:'S1'}]}}},
  {type:'run.completed',data:{completion:'complete'}},
]);}
test('summarizes actual work, unique peer exposure and source use without duplicating token usage',()=>{
  const report=analyzeRun(manifest,fixture());
  assert.equal(report.totals.contributions,2);assert.equal(report.totals.searches,1);assert.equal(report.totals.reads,0);assert.equal(report.totals.sources,1);assert.equal(report.totals.citedSources,1);
  assert.equal(report.members[0].tokens,15);assert.equal(report.members[0].credits,.01);
  assert.equal(report.members[1].peerContributionsSeen,1);assert.deepEqual(report.members[1].peerSources,['S1']);assert.equal(report.members[1].contextsWithPeers,2);
  assert.deepEqual(report.members[1].roles.map(r=>r.title),['Reviewer','Statistician']);
  const action=report.activities.find(a=>a.type==='hackathon.contribution'&&a.agent==='Agent A')!;
  assert.deepEqual(action.recipients,['Agent B']);assert.deepEqual(action.observedBy,['Agent B']);assert.ok(action.inSynthesisContext);
  assert.deepEqual(report.outcome?.contextContributionIds,[9]);assert.equal(report.durationMs,17000);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_PROMPT_SENTINEL'));assert.ok(!JSON.stringify(report).includes('PRIVATE_REASONING_SENTINEL'));
});
test('historical snapshots and role-at-decision attribution do not change with later edits',()=>{
  const report=analyzeRun(manifest,fixture());
  assert.equal(report.activities.find(a=>a.id===9)?.network?.revision,0);
  assert.equal(report.activities.find(a=>a.type==='hackathon.network')?.network?.revision,1);
  assert.equal(report.activities.find(a=>a.id===12)?.role,'Reviewer');
  assert.equal(report.activities.find(a=>a.id===16)?.role,'Statistician; acting synthesis lead');
  assert.equal(report.activities.find(a=>a.id===14)?.agents[0],'Agent B');
});
test('deduplicates SDK/recovery failures, preserves run failure causes and reports no invented topology',()=>{
  const report=analyzeRun({...manifest,status:'failed',setup:{},config:{task:'hackathon',mode:'adaption'}},records([
    {type:'run.started',data:{agents:['Agent A','Agent B']}},
    {type:'agent.observation',agent:'Agent A',data:{round:1,phase:'research',history:[]}},
    {type:'sdk.error',agent:'Agent A',data:{message:'429 Too Many Requests'}},
    {type:'hackathon.agent.error',agent:'Agent A',data:{message:'429 Too Many Requests',retrying:true,round:1,phase:'research'}},
    {type:'agent.observation',agent:'Agent A',data:{round:1,phase:'research',history:[]}},
    {type:'hackathon.agent.timeout',agent:'Agent A',data:{message:'Agent A timed out',round:1,phase:'research'}},
    {type:'run.failed',data:{message:'Output could not be saved'}},
  ]));
  assert.equal(report.members[0].failedAttempts,1);assert.equal(report.members[0].retries,1);assert.equal(report.members[0].timeouts,1);assert.equal(report.status,'failed');assert.equal(report.outcome,null);
  assert.equal(report.activities.filter(a=>a.type==='sdk.error').length,0);assert.ok(report.summary.some(s=>s.text.includes('Output could not be saved')));
  assert.ok(report.activities.every(a=>a.network===null));assert.ok(report.limitations.some(l=>l.includes('Topology was not recorded')));
  assert.match(analysisMarkdown(report),/Output could not be saved/);
});
test('analysis reads failures and all agents without changing public/private trajectory scopes',()=>{
  const id=randomUUID(),trace=createTrace(id,{task:'hackathon',mode:'demo'},['Agent A','Agent B']);
  try{
    trace.append({type:'run.started',data:{agents:['Agent A','Agent B']}});
    trace.append({type:'agent.observation',agent:'Agent B',data:{phase:'research',round:1,history:[]}});
    trace.append({type:'run.failed',data:{message:'429 provider limit'}});
    const trajectory=readAnalysisTrajectory(id),report=analyzeRun(trajectory.manifest,trajectory.events);
    assert.equal(report.status,'failed');assert.equal(report.members[1].contexts,1);assert.ok(report.activities.some(a=>a.detail==='429 provider limit'));
  }finally{rmSync(`traces/${id}`,{recursive:true,force:true});}
});
test('demo reports and Markdown label simulated activity and retain every action',()=>{
  const report=analyzeRun({...manifest,config:{...manifest.config,mode:'demo'}},fixture());
  assert.ok(report.simulated);assert.ok(report.limitations.some(l=>l.includes('simulated')));
  const text=analysisMarkdown(report);assert.match(text,/SIMULATED DEMO/);assert.match(text,/event #9/);assert.match(text,/Evidence suggests a matched evaluation/);
  assert.equal(new Set(report.activities.map(a=>a.id)).size,report.activities.length);
});
