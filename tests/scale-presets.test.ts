import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { agentCode, agentName } from '../src/identity.js';
import { assignModels, estimatePricing } from '../src/pricing.js';
import { normalizeNetwork } from '../src/network.js';
import { normalizeRoles } from '../src/roles.js';
import { createRolePresetStore } from '../src/role-presets.js';
import { createExperiment } from '../src/experiments.js';
import { runHackathon } from '../tasks/hackathon/environment.js';
import { demoDecision } from '../tasks/hackathon/definition.js';
import { createDashboard } from '../src/server.js';
import { analyzeRun } from '../src/analysis.js';
import type { HackathonObservation } from '../tasks/hackathon/types.js';
import type { TraceEvent } from '../src/traces.js';

test('supports 100 repeated model assignments and charges independently per agent',()=>{
  const models=Array(100).fill('deepseek-v4-flash');assert.deepEqual(assignModels(100,models),models);
  assert.equal(assignModels(100).length,100);
  const quote=estimatePricing('hackathon',3,models);assert.equal(quote.perAgent.length,100);assert.equal(quote.calls,701);
  assert.ok(quote.totalCredits>quote.perAgent[0].credits*99);
  assert.throws(()=>assignModels(101),/100/);assert.throws(()=>assignModels(100,['deepseek-v4-flash']),/one valid/);assert.throws(()=>assignModels(2,['unknown','unknown']),/valid/);
  assert.equal(agentCode(25),'Z');assert.equal(agentCode(26),'AA');assert.equal(agentCode(99),'CV');assert.equal(new Set(Array.from({length:100},(_,i)=>agentName(i))).size,100);
});

test('100-agent setup uses a sparse default and accepts a fully connected custom graph',()=>{
  assert.equal(normalizeNetwork(100).edges.length,200);
  const mesh={count:100,edges:Array.from({length:100},(_,from)=>Array.from({length:100},(_,to)=>({from,to}))).flat().filter(e=>e.from!==e.to)};
  assert.equal(normalizeNetwork(100,mesh).edges.length,9900);
  const setup=createExperiment({task:'hackathon',count:100,models:Array(100).fill('deepseek-v4-flash')},()=>{});
  assert.equal(setup.agents[99],'Agent CV');assert.equal(setup.setup.assignments.length,100);assert.ok(setup.setup.assignments.every(a=>a.label));
  assert.throws(()=>createExperiment({task:'hackathon',count:101},()=>{}),/Invalid run/);
  assert.throws(()=>normalizeRoles(101),/100/);assert.throws(()=>normalizeNetwork(101),/100/);
});

test('a full 100-agent task completes and its report deduplicates large topology snapshots',async()=>{
  const events:TraceEvent[]=[];let id=0;
  const names=Array.from({length:100},(_,i)=>agentName(i));
  const result=await runHackathon(names.map(name=>({name,async decide(o:HackathonObservation){return demoDecision(o);}})),3,event=>events.push({...event,id:++id,time:new Date(1700000000000+id).toISOString(),run:'test',visibility:'public'}),undefined,undefined,true);
  assert.equal(result.contributions.length,300);assert.equal(result.completion,'complete');assert.equal(result.errors.length,0);
  const report=analyzeRun({id:'test',config:{task:'hackathon',mode:'demo'},agents:names.map((name,i)=>({name,id:`agent-${i+1}`}))},events);
  assert.equal(report.members.length,100);assert.equal(report.totals.contributions,300);
  assert.equal(Object.keys(report.networks).length,1);assert.ok(report.activities.filter(a=>a.type==='hackathon.contribution').every(a=>a.network===null&&a.networkRef==='100:0'));
  assert.ok(JSON.stringify(report).length<1500000);
});

test('role presets persist across store instances, overwrite by name and preserve validation failures',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'swarm-roles-')),file=join(directory,'role-presets.json');
  try{
    const store=createRolePresetStore(file),roles=normalizeRoles(100).assignments;roles[99]={title:'Moral philosopher',instructions:'Challenge assumptions about authority.'};
    const saved=await store.save('Moral debate team',roles);
    const reopened=createRolePresetStore(file);assert.equal((await reopened.list())[0].count,100);assert.equal((await reopened.get(saved.id)).roles[99].title,'Moral philosopher');
    const updated=await reopened.save('moral debate team',normalizeRoles(5).assignments);assert.equal(updated.id,saved.id);assert.equal((await reopened.list()).length,1);assert.equal((await reopened.get(saved.id)).count,5);
    await assert.rejects(store.save('',roles),/Preset name/);await assert.rejects(store.save('Bad',[]),/100/);assert.equal((await reopened.list()).length,1);
    await Promise.all([store.save('Team A',normalizeRoles(2).assignments),store.save('Team B',normalizeRoles(3).assignments)]);assert.equal((await store.list()).length,3);
    await writeFile(file,'{"version":999,"presets":[]}');await assert.rejects(store.save('Do not overwrite',roles),/Invalid role preset file/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('dashboard role library survives a fresh server and accepts payloads larger than the old 32K cap',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'swarm-role-server-')),file=join(directory,'roles.json');
  let server=createDashboard({rolePresetFile:file}).listen(0,'127.0.0.1');await once(server,'listening');
  const base=()=>`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const close=async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));};
  try{
    const roles=normalizeRoles(100).assignments.map(r=>({...r,instructions:'x'.repeat(1000)}));
    const response=await fetch(base()+'/role-presets',{method:'POST',body:JSON.stringify({name:'Reusable 100',roles})});assert.equal(response.status,200);const saved=await response.json();
    assert.equal((await fetch(base()+'/role-presets',{method:'POST',headers:{Origin:'https://example.com'},body:JSON.stringify({name:'Denied',roles})})).status,403);
    const setup=await(await fetch(base()+'/setup?task=hackathon&count=100&models='+Array(100).fill('deepseek-v4-flash').join(','))).json();assert.equal(setup.assignments.length,100);assert.ok(setup.assignments.every((a:any)=>a.model==='deepseek-v4-flash'));
    assert.equal((await fetch(base()+'/identity.js')).status,200);
    await close();server=createDashboard({rolePresetFile:file}).listen(0,'127.0.0.1');await once(server,'listening');
    const restored=await(await fetch(base()+'/role-presets/'+saved.id)).json();assert.equal(restored.roles.length,100);assert.equal(restored.roles[99].instructions.length,1000);
  }finally{await close();await rm(directory,{recursive:true,force:true});}
});

test('SSE status includes a complete 100-agent snapshot for reconnecting dashboards',async()=>{
  const server=createDashboard().listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`,abort=new AbortController();
  try{
    const started=await(await fetch(base+'/run',{method:'POST',body:JSON.stringify({task:'hackathon',mode:'demo',count:100,models:Array(100).fill('deepseek-v4-flash')})})).json();
    const stream=await fetch(base+'/events',{signal:abort.signal}),reader=stream.body!.getReader();let text='';
    while(!/event: status\ndata: [^\n]+\n\n/.test(text)){const chunk=await reader.read();assert.ok(!chunk.done);text+=new TextDecoder().decode(chunk.value);}
    const match=/event: status\ndata: ([^\n]+)\n\n/.exec(text);assert.ok(match);const status=JSON.parse(match[1]);
    assert.equal(status.run.id,started.id);assert.equal(status.run.agents.length,100);assert.equal(status.run.agents[99],'Agent CV');assert.equal(status.run.roles.assignments.length,100);assert.equal(status.run.network.count,100);
    await fetch(base+'/stop',{method:'POST'});await reader.cancel();
  }finally{abort.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
