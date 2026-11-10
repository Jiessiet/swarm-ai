import type { TraceEvent } from './traces.js';
import type { AgentNetwork } from './network.js';

type RecordEvent = Omit<TraceEvent, 'data'> & { data?: any };
type ActivityKind = 'context' | 'research' | 'contribution' | 'change' | 'error' | 'phase' | 'outcome';
export type RecordedActivity = {
  id: number; time: string; elapsedMs: number; kind: ActivityKind; type: string;
  agent: string | null; agents: string[]; phase: string; round: number | null;
  title: string; detail: string; role: string | null; roleRevision: number | null;
  networkRevision: number | null; networkRef: string | null; sourceIds: string[]; recipients: string[] | null;
  observedBy: string[]; contextPeers: string[]; inSynthesisContext: boolean; network: AgentNetwork | null;
};
const contributionKey = (c: any) => JSON.stringify([c.agent, c.round, c.phase]);
const stamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
const sum = (items: number[]) => items.reduce((a,b)=>a+b,0);
const count = (n:number, noun:string, plural = noun+'s') => `${n} ${n===1?noun:plural}`;

// Analyze recorded behavior only. Private prompts, reasoning and raw SDK items
// are never copied into the report, and no additional model calls are made.
export function analyzeRun(manifest: any, input: TraceEvent[]) {
  const events = [...new Map(input.map(e=>[e.id,e])).values()].sort((a,b)=>a.id-b.id) as RecordEvent[];
  const setup = manifest.setup ?? events.find(e=>e.type==='operator.setup')?.data ?? {};
  const started = events.find(e=>e.type==='run.started');
  const names: string[] = array(manifest.agents).map(a=>a.name);
  for(const name of array(started?.data?.agents)) if(!names.includes(name)) names.push(name);
  const members = names.map((name,index)=>({
    name, index, id: array(manifest.agents).find(a=>a.name===name)?.id ?? `agent-${index+1}`,
    model: setup.assignments?.[index]?.model ?? manifest.config?.models?.[index] ?? null,
    initialRole: setup.assignments?.[index]?.label ?? null,
    roles: [] as {id:number;title:string;instructions:string;revision:number}[],
    contributions:0, byPhase:{} as Record<string,number>, searches:0, reads:0,
    sources:[] as string[], citations:[] as string[], peerSources:[] as string[],
    attempts:0, retries:0, failedAttempts:0, skippedTurns:0, timeouts:0,
    tokens:null as number|null, credits:null as number|null, responseMs:[] as number[],
    peersSeen:[] as string[], peerContributionsSeen:0, contexts:0, contextsWithPeers:0,
    synthesisAttempts:0, synthesized:false, activityIds:[] as number[],
  }));
  const member = (name?: string|null) => members.find(a=>a.name===name);
  const begin = stamp(started?.time) ?? stamp(manifest.created) ?? stamp(events[0]?.time) ?? 0;
  const terminal = [...events].reverse().find(e=>['run.completed','run.failed','run.stopped'].includes(e.type));
  const lastTime = stamp(terminal?.time) ?? stamp(events.at(-1)?.time) ?? begin;
  let phase='setup', round:number|null=null;
  let network:AgentNetwork|null=setup.network ?? manifest.config?.network ?? null;
  const networks:Record<string,AgentNetwork>={};
  const activities: RecordedActivity[] = [], sources: {id:string;title:string;url:string;kind:string;agent:string|null;eventId:number}[] = [];
  const phaseRecords: {phase:string;round:number;eventId:number;time:string}[]=[];
  const pending = new Map<string,number>();
  const sdkTokens = new Map<string,number>(), usageTokens = new Map<string,number>();
  const peerSeen = new Map<string,Set<string>>(), exposure = new Map<string,Set<string>>();
  const contextual = new Map<string,{phase:string;round:number;role:string;roleRevision:number|null;network:AgentNetwork|null}>();
  const add = (event:RecordEvent, kind:ActivityKind, title:string, detail:string, extra:Partial<RecordedActivity>={}) => {
    const context=contextual.get(event.agent??'');
    const snapshot=context?.network??network;const networkRef=snapshot?`${snapshot.count}:${snapshot.revision}`:null;
    if(networkRef&&snapshot&&!networks[networkRef])networks[networkRef]=structuredClone(snapshot);
    const item:RecordedActivity={id:event.id,time:event.time,elapsedMs:Math.max(0,(stamp(event.time)??begin)-begin),kind,type:event.type,agent:event.agent??null,agents:event.agent?[event.agent]:[],phase:context?.phase??phase,round:context?.round??round,title,detail,role:context?.role??null,roleRevision:context?.roleRevision??null,networkRevision:(context?.network??network)?.revision??null,networkRef,sourceIds:[],recipients:null,observedBy:[],contextPeers:[],inSynthesisContext:false,network:snapshot&&snapshot.count<=20?structuredClone(snapshot):null,...extra};
    activities.push(item);
    for(const name of item.agents)member(name)?.activityIds.push(item.id);
    return item;
  };
  const close=(name:string|undefined,time:string)=>{
    if(!name||!pending.has(name))return;
    const end=stamp(time),start=pending.get(name)!;
    if(end!==null&&end>=start)member(name)?.responseMs.push(end-start);
    pending.delete(name);
  };
  for(const agent of members){
    const role=setup.assignments?.[agent.index];
    if(role)agent.roles.push({id:0,title:role.label??role.role,instructions:role.instruction??'',revision:0});
  }
  for(const event of events){
    const d=event.data??{}, a=member(event.agent);
    if(event.type==='hackathon.phase'){
      phase=d.phase;round=d.round;phaseRecords.push({phase,round:d.round,eventId:event.id,time:event.time});
      add(event,'phase',`${phase[0]?.toUpperCase()??''}${phase.slice(1)} started`,`Round ${round}.`,{phase,round});
    }else if(event.type==='agent.observation'&&a){
      a.attempts++;a.contexts++;
      if(d.phase==='synthesis')a.synthesisAttempts++;
      if(stamp(event.time)!==null)pending.set(a.name,stamp(event.time)!);
      const peers=array(d.history).filter(c=>c.agent!==a.name);
      if(peers.length)a.contextsWithPeers++;
      const seen=peerSeen.get(a.name)??new Set<string>();
      for(const c of peers){seen.add(contributionKey(c));const viewers=exposure.get(contributionKey(c))??new Set<string>();viewers.add(a.name);exposure.set(contributionKey(c),viewers);if(!a.peersSeen.includes(c.agent))a.peersSeen.push(c.agent);}
      peerSeen.set(a.name,seen);
      contextual.set(a.name,{phase:d.phase??phase,round:d.round??round,role:d.role??a.roles.at(-1)?.title??'',roleRevision:d.roleRevision??null,network:d.network??network});
      add(event,'context','Received a decision context',`${array(d.history).length} contributions visible; ${peers.length} from peers. ${array(d.sources).length} sources available.`,{sourceIds:array(d.sources).map(s=>s.id),contextPeers:[...new Set<string>(peers.map(c=>c.agent))]});
    }else if(event.type==='sdk.turn.started'&&a){
      if(!events.some(e=>e.type==='agent.observation'&&e.agent===a.name))a.attempts++;
    }else if(event.type==='sdk.turn.completed'&&a){
      close(a.name,event.time);
      if(d.usage)sdkTokens.set(a.name,(sdkTokens.get(a.name)??0)+(d.usage.input_tokens??0)+(d.usage.output_tokens??0));
    }else if(event.type==='agent.usage'&&a){
      if(typeof d.credits==='number')a.credits=(a.credits??0)+d.credits;
      if(d.usage)usageTokens.set(a.name,(usageTokens.get(a.name)??0)+(d.usage.input_tokens??0)+(d.usage.output_tokens??0));
    }else if(event.type==='hackathon.web.request'){
      if(d.action==='search'&&a)a.searches++;if(d.action==='read'&&a)a.reads++;
      add(event,'research',d.action==='search'?'Requested a source search':'Requested a page read',d.query||d.url||'Research request recorded.');
    }else if(event.type==='hackathon.web.result'){
      for(const s of array(d.results))if(!sources.some(source=>source.id===s.id)){
        sources.push({id:s.id,title:s.title,url:s.url,kind:s.kind,agent:event.agent??null,eventId:event.id});a?.sources.push(s.id);
      }
      add(event,d.error?'error':'research',d.error?'Web research failed':'Retrieved research evidence',d.error??(array(d.results).length?array(d.results).map(s=>`${s.id}: ${s.title}`).join('\n'):'No sources returned.'),{sourceIds:array(d.results).map(s=>s.id)});
    }else if(event.type==='hackathon.contribution'){
      if(a){a.contributions++;a.byPhase[d.phase]=(a.byPhase[d.phase]??0)+1;for(const id of array(d.sourceIds))if(!a.citations.includes(id))a.citations.push(id);}
      add(event,'contribution',`Shared ${d.phase??'research'} contribution`,d.message??'',{phase:d.phase??phase,round:d.round??round,role:d.role??contextual.get(event.agent??'')?.role??a?.roles.at(-1)?.title??null,roleRevision:d.roleRevision??contextual.get(event.agent??'')?.roleRevision??null,networkRevision:d.networkRevision??network?.revision??null,sourceIds:array(d.sourceIds),recipients:Array.isArray(d.recipients)?d.recipients:null});
    }else if(event.type==='hackathon.agent.error'||event.type==='hackathon.agent.timeout'||event.type==='sdk.error'||event.type==='sdk.turn.failed'){
      const sdk=event.type.startsWith('sdk.');
      // New runners record a normalized recovery event after the SDK error.
      if(sdk&&events.some(e=>e.agent===event.agent&&e.id>event.id&&e.id<=event.id+5&&['hackathon.agent.error','hackathon.agent.timeout'].includes(e.type)))continue;
      close(event.agent,event.time);
      if(a){if(event.type==='hackathon.agent.timeout'){a.timeouts++;a.skippedTurns++;}else{a.failedAttempts++;if(d.retrying)a.retries++;if(d.retrying===false)a.skippedTurns++;}}
      add(event,'error',event.type==='hackathon.agent.timeout'?'Decision timed out':d.retrying?'Decision failed · retry scheduled':'Decision failed',d.message??d.error?.message??'Provider failure recorded.',{phase:d.phase??phase,round:d.round??round});
    }else if(event.type==='hackathon.network'){
      network=d.network??network;
      add(event,'change','Communication network changed',`Revision ${network?.revision??'?'} · ${network?.edges.length??0} directed channels. Effective on subsequent decisions.`,{agents:names,network:network&&network.count<=20?structuredClone(network):null,networkRevision:network?.revision??null,phase,round});
    }else if(event.type==='hackathon.roles'){
      const changed:string[]=d.changedAgents??[];
      for(const name of changed){const agent=member(name),role=d.roles?.assignments?.[agent?.index??-1];if(agent&&role)agent.roles.push({id:event.id,title:role.title,instructions:role.instructions,revision:d.roles.revision});}
      add(event,'change','Agent roles changed',changed.map(name=>{const role=d.roles?.assignments?.[member(name)?.index??-1];return `${name}: ${role?.title??'updated role'}${role?.instructions?` — ${role.instructions}`:''}`;}).join('\n'),{agents:changed,phase,round});
    }else if(event.type==='hackathon.brief'){
      if(a&&d.brief)a.synthesized=true;
      add(event,'outcome',d.brief?'Produced the final research brief':'Saved partial research',d.brief?`${d.brief.title}\n\n${d.brief.researchQuestion}`:'No validated final brief was produced. Contributions and sources were retained.',{sourceIds:array(d.brief?.relatedWork).map(w=>w.sourceId)});
    }else if(['run.completed','run.failed','run.stopped'].includes(event.type)){
      if(event.type!=='run.completed')for(const name of pending.keys())close(name,event.time);
      add(event,'outcome',event.type==='run.failed'?'Run failed':event.type==='run.stopped'?'Run stopped':d.completion==='partial'?'Run finished with partial research':'Run completed',d.message??(d.completion==='partial'?'No final synthesis was available.':'Recorded work is saved.'),{phase,round});
    }
  }
  for(const a of members){
    a.peerContributionsSeen=peerSeen.get(a.name)?.size??0;
    a.tokens=sdkTokens.get(a.name)??usageTokens.get(a.name)??null;
    a.peerSources=a.citations.filter(id=>{const s=sources.find(s=>s.id===id);return s&&s.agent!==a.name;});
  }
  for(const item of activities)if(item.type==='hackathon.contribution')item.observedBy=[...(exposure.get(contributionKey(item))??[])];
  const briefEvent=events.find(e=>e.type==='hackathon.brief'), result=briefEvent?.data;
  const finalBrief=result?.brief??terminal?.data?.brief??null;
  const synthesisAgent=result?.synthesisAgent??briefEvent?.agent??null;
  const synthContext=[...events].reverse().find(e=>e.type==='agent.observation'&&e.agent===synthesisAgent&&e.data?.phase==='synthesis');
  const synthesisKeys=new Set(array(synthContext?.data?.history).map(contributionKey));
  for(const activity of activities)if(activity.type==='hackathon.contribution')activity.inSynthesisContext=synthesisKeys.has(contributionKey(activity));
  const citedIds=[...new Set<string>(array(finalBrief?.relatedWork).map(w=>w.sourceId))];
  const contributionEvents=activities.filter(e=>e.kind==='contribution');
  const researchEvents=activities.filter(e=>e.kind==='research'||e.type==='hackathon.web.result');
  const networkChanges=activities.filter(e=>e.type==='hackathon.network'), roleChanges=activities.filter(e=>e.type==='hackathon.roles');
  const errorEvents=activities.filter(e=>e.kind==='error');
  const attempts=sum(members.map(a=>a.attempts)), contextsWithPeers=sum(members.map(a=>a.contextsWithPeers));
  const contributing=members.filter(a=>a.contributions>0), citedContributions=contributionEvents.filter(e=>e.sourceIds.length>0).length;
  const status=terminal?.type==='run.failed'?'failed':terminal?.type==='run.stopped'?'stopped':result?.completion??(terminal?'complete':manifest.status??'running');
  const summary=[
    {title:'What happened',text:`${count(contributionEvents.length,'validated contribution')} from ${contributing.length} of ${members.length} agents across ${count(phaseRecords.filter(p=>p.phase!=='synthesis').length,'discussion round')}. ${finalBrief?`${synthesisAgent??'An agent'} produced a final research plan.`:status==='running'?'The run is still in progress.':'No validated final research brief was produced.'}`,eventIds:[...contributionEvents.slice(0,2).map(e=>e.id),...(briefEvent?[briefEvent.id]:[])]},
    {title:'Evidence use',text:`${count(sum(members.map(a=>a.searches)),'search','searches')} and ${count(sum(members.map(a=>a.reads)),'page read')} were requested. ${sources.length} sources were retrieved; ${citedContributions} contributions cited retrieved source IDs. The final brief cites ${count(citedIds.length,'distinct source')}. ${sources.length?'Citation counts show evidence use, not factual correctness or independent verification.':'No retrieved evidence supports novelty or empirical claims in this run.'}`,eventIds:[...researchEvents.slice(0,2).map(e=>e.id),...contributionEvents.filter(e=>e.sourceIds.length).slice(0,2).map(e=>e.id)]},
    {title:'How work moved',text:attempts?`${contextsWithPeers} of ${sum(members.map(a=>a.contexts))} recorded decision contexts contained peer contributions. ${count(members.filter(a=>a.peerContributionsSeen>0).length,'agent')} received at least one peer contribution. Context exposure establishes what was available to the model, not agreement or causal influence.`:'This older trace has no decision-context records, so peer exposure cannot be determined.',eventIds:activities.filter(e=>e.kind==='context').slice(0,3).map(e=>e.id)},
    {title:'Changes & recovery',text:`${count(networkChanges.length,'network edit')} and ${count(roleChanges.length,'role edit')} were recorded. ${count(sum(members.map(a=>a.failedAttempts)),'decision failure')}, ${count(sum(members.map(a=>a.retries)),'scheduled retry','scheduled retries')}, ${count(sum(members.map(a=>a.timeouts)),'timeout')} and ${activities.filter(e=>e.type==='hackathon.web.result'&&e.kind==='error').length} web failures were recorded. ${terminal?.type==='run.failed'?`The run ended with: ${terminal.data?.message??'an error'}.`:'Changes and failures can be inspected alongside the task phases below.'}`,eventIds:[...networkChanges,...roleChanges,...errorEvents].sort((a,b)=>a.id-b.id).slice(0,5).map(e=>e.id)},
  ];
  return {
    runId:manifest.id,task:manifest.config?.task??setup.task??'hackathon',status,simulated:manifest.config?.mode==='demo',
    objective:manifest.config?.objective??setup.objective??setup.citizenship?.objective??null,
    startedAt:started?.time??manifest.created,endedAt:terminal?.time??null,durationMs:Math.max(0,lastTime-begin),
    totals:{contributions:contributionEvents.length,searches:sum(members.map(a=>a.searches)),reads:sum(members.map(a=>a.reads)),sources:sources.length,citedSources:citedIds.length,failedAttempts:sum(members.map(a=>a.failedAttempts)),timeouts:sum(members.map(a=>a.timeouts)),networkChanges:networkChanges.length,roleChanges:roleChanges.length},
    summary,members,activities,sources,networks,phases:phaseRecords,
    outcome:finalBrief?{title:finalBrief.title,question:finalBrief.researchQuestion,pitch:finalBrief.pitch,agent:synthesisAgent,eventId:briefEvent?.id??null,citedIds,contextContributionIds:contributionEvents.filter(e=>e.inSynthesisContext).map(e=>e.id),peersInSynthesis:[...new Set<string>(array(synthContext?.data?.history).filter(c=>c.agent!==synthesisAgent).map(c=>c.agent))]}:null,
    limitations:['This report uses recorded actions and model-visible contexts; it does not infer private reasoning, intent, agreement, or causal influence.','A routed contribution was available to its recorded recipients. “Seen in context” means it appeared in a later recorded observation. These are different measures.','The hackathon produces a research plan; it does not execute the proposed empirical experiment.',...(manifest.config?.mode==='demo'?['Demo activity and token usage are simulated; no web browsing or model calls were made.']:[]),...(!network?['Topology was not recorded for this older run; no missing edges are invented.']:[])],
  };
}
export function analysisMarkdown(report:ReturnType<typeof analyzeRun>) {
  return `# What the agents actually did\n\nRun: ${report.runId}\nStatus: ${report.status}${report.simulated?' · SIMULATED DEMO':''}\n\n## Research objective\n${report.objective??'Not recorded.'}\n\n${report.summary.map(s=>`## ${s.title}\n${s.text}\nEvidence: ${s.eventIds.map(id=>`event #${id}`).join(', ')||'No matching events.'}`).join('\n\n')}\n\n## Per-agent behavior\n${report.members.map(a=>`### ${a.name} · ${a.model??'model not recorded'}\n${a.contributions} contributions; ${a.searches} searches; ${a.reads} reads; ${a.peerContributionsSeen} distinct peer contributions seen; ${a.failedAttempts} failed attempts; ${a.timeouts} timeouts.\nRoles: ${a.roles.map(r=>`${r.title} (revision ${r.revision})`).join(' → ')||'Not recorded.'}`).join('\n\n')}\n\n## Recorded activity\n${report.activities.map(a=>`### #${a.id} · ${a.agent??'Environment'} · ${a.title}\n${a.phase}${a.round?` · round ${a.round}`:''} · ${a.time}\n${a.detail}\n${a.sourceIds.length?`Sources: ${a.sourceIds.join(', ')}\n`:''}${a.recipients?`Available to: ${a.recipients.join(', ')||'no outgoing neighbors'}\n`:''}${a.observedBy.length?`Seen in later contexts: ${a.observedBy.join(', ')}\n`:''}`).join('\n')}\n\n## Interpretation limits\n${report.limitations.map(l=>`- ${l}`).join('\n')}\n`;
}
