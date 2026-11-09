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
    assert.equal(task.id, 'hackathon');
    assert.deepEqual(task.defaults, { count: 5, rounds: 3, tokens: 1, maxTake: 1 });
    assert.equal((await fetch(base + '/run', { method: 'POST', headers: { Origin: 'https://example.com' }, body: '{}' })).status, 403);
    assert.equal((await fetch(base + '/run', { method: 'POST', body: '{"count":101}' })).status, 400);
    const response = await fetch(base + '/events', { signal: abort.signal });
    const reader = response.body!.getReader();
    const start = () => fetch(base + '/run', { method: 'POST', body: JSON.stringify({ task: 'shared-resource', mode: 'demo', count: 2, rounds: 1, tokens: 6 }) });
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

test('dashboard applies validated live network changes and records revisions', async () => {
  const server = createDashboard().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const abort = new AbortController();
  try {
    const response = await fetch(base+'/events',{signal:abort.signal});
    const reader=response.body!.getReader();
    const started=await (await fetch(base+'/run',{method:'POST',body:JSON.stringify({task:'hackathon',mode:'demo',count:5,rounds:3})})).json();
    const change=(runId:string,revision:number,edges:unknown[])=>fetch(base+'/network',{method:'POST',body:JSON.stringify({runId,revision,network:{count:5,edges}})});
    assert.equal((await change('wrong-run',0,[])).status,409);
    assert.equal((await change(started.id,0,[{from:0,to:5}])).status,400);
    assert.equal((await change(started.id,0,[])).status,200);
    assert.equal((await change(started.id,0,[])).status,400);
    const current=await (await fetch(base+'/network')).json();
    assert.equal(current.network.revision,1);assert.deepEqual(current.network.edges,[]);
    let stream='';
    while(!stream.includes('hackathon.network')){const chunk=await reader.read();stream+=new TextDecoder().decode(chunk.value);}
    assert.match(stream,/next-decision/);
    await fetch(base+'/stop',{method:'POST'});
    while(!stream.includes('run.stopped')){const chunk=await reader.read();stream+=new TextDecoder().decode(chunk.value);}
    await reader.cancel();
    const trace=await (await fetch(base+'/runs/'+started.id)).json();
    assert.ok(trace.events.some((e:any)=>e.type==='hackathon.network'&&e.data.network.revision===1));
  } finally {abort.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('dashboard changes live roles with validation, revision checks and saved audit events', async () => {
  const server=createDashboard().listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`,abort=new AbortController();
  try {
    const response=await fetch(base+'/events',{signal:abort.signal}),reader=response.body!.getReader();
    const started=await(await fetch(base+'/run',{method:'POST',body:JSON.stringify({task:'hackathon',mode:'demo',count:2,rounds:3})})).json();
    const initial=await(await fetch(base+'/roles')).json();
    const roles=initial.roles.assignments;roles[0]={title:'Live red team',instructions:'Challenge unsupported claims.'};
    const update=(runId:string,revision:number,assignments:unknown)=>fetch(base+'/roles',{method:'POST',body:JSON.stringify({runId,revision,roles:assignments})});
    assert.equal((await update('wrong-run',0,roles)).status,409);
    assert.equal((await update(started.id,0,[{title:'',instructions:''},roles[1]])).status,400);
    assert.equal((await update(started.id,0,roles)).status,200);
    assert.equal((await update(started.id,0,roles)).status,400);
    let stream='';while(!stream.includes('"role":"Live red team"')){const chunk=await reader.read();assert.ok(!chunk.done);stream+=new TextDecoder().decode(chunk.value);}
    assert.match(stream,/hackathon.roles/);assert.match(stream,/next-decision/);
    const current=await(await fetch(base+'/roles')).json();assert.equal(current.roles.revision,1);assert.equal(current.roles.assignments[0].title,'Live red team');
    await fetch(base+'/stop',{method:'POST'});while(!stream.includes('run.stopped')){const chunk=await reader.read();stream+=new TextDecoder().decode(chunk.value);}
    await reader.cancel();
    const saved=await(await fetch(base+'/runs/'+started.id)).json();
    assert.ok(saved.events.some((e:any)=>e.type==='hackathon.roles'&&e.data.roles.assignments[0].title==='Live red team'));
  } finally {abort.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('behavior report covers whole saved runs, links evidence IDs and serves readable exports', async () => {
  const server=createDashboard().listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const abort=new AbortController();
  try{
    const stream=await fetch(base+'/events',{signal:abort.signal}),reader=stream.body!.getReader();
    const started=await(await fetch(base+'/run',{method:'POST',body:JSON.stringify({task:'hackathon',mode:'demo',count:2,rounds:3})})).json();
    let text='';while(!text.includes('run.completed')){const chunk=await reader.read();assert.ok(!chunk.done);text+=new TextDecoder().decode(chunk.value);}await reader.cancel();
    const response=await fetch(base+`/runs/${started.id}/analysis`);assert.equal(response.status,200);
    const report=await response.json();assert.equal(report.runId,started.id);assert.equal(report.status,'complete');assert.equal(report.simulated,true);assert.equal(report.totals.contributions,6);assert.equal(report.members.length,2);
    assert.equal(report.members[0].attempts,3);assert.equal(report.members[1].attempts,4);assert.ok(report.outcome.contextContributionIds.length>0);
    assert.ok(report.activities.every((a:any)=>!['agent.prompt','sdk.item.updated','sdk.item.completed'].includes(a.type)));
    const markdown=await(await fetch(base+`/runs/${started.id}/analysis.md`)).text();assert.match(markdown,/What the agents actually did/);assert.match(markdown,/SIMULATED DEMO/);
    const publicTrace=await(await fetch(base+`/runs/${started.id}`)).json();assert.ok(publicTrace.events.every((e:any)=>e.visibility==='public'));
    assert.equal((await fetch(base+'/runs/not-an-id/analysis')).status,400);
  }finally{abort.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
