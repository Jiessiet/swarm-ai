import { agentCode } from './identity.js';
import { DomeScene } from './dome-scene.js';
const $=id=>document.getElementById(id);
const palette=['#c9b879','#89accc','#b7a1ce','#d09c7e','#99b39b','#ca9db3','#a7b777','#91bab6'];
const NS='http://www.w3.org/2000/svg';
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
function svg(tag,attrs={}){const node=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,String(v));return node;}
function duration(ms){if(ms===null||ms===undefined)return 'not recorded';if(ms<1000)return `${Math.round(ms)} ms`;if(ms<60000)return `${(ms/1000).toFixed(1)} s`;return `${Math.floor(ms/60000)}m ${Math.round(ms%60000/1000)}s`;}
function button(text,action,cls='quiet'){const node=el('button',text,cls);node.type='button';node.onclick=action;return node;}
function safeLink(title,url){const node=el('a',title);try{const parsed=new URL(url);if(['https:','http:'].includes(parsed.protocol)){node.href=parsed.href;node.target='_blank';node.rel='noopener noreferrer';}}catch{}return node;}
export class BehaviorPanel{
  constructor({onActivity,onAgent,onArchive,onBrief}){
    this.onActivity=onActivity;this.onAgent=onAgent;this.onArchive=onArchive;this.onBrief=onBrief;
    this.dome=new DomeScene({onAgent:i=>this.selectAgent(this.report.members[i].name,true),onActivity:id=>{this.pause();this.agent='all';this.kind='all';this.select(id);},label:'3D spiral trajectory replay'});this.speed=1;this.frame=null;this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    this.report=null;this.runId=null;this.liveRunId=null;this.agent='all';this.kind='all';this.selectedId=null;this.follow=true;this.limit=12;this.archived=false;this.version=0;this.playing=false;this.layout='spiral';
    $('behavior-agent').onchange=e=>this.selectAgent(e.target.value);
    $('behavior-kind').onchange=e=>{this.kind=e.target.value;this.limit=12;this.renderInteractive();};
    for(const control of document.querySelectorAll('[data-replay-layout]'))control.onclick=()=>{this.layout=control.dataset.replayLayout;document.querySelectorAll('[data-replay-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.replayLayout===this.layout)));this.renderGraph(this.report?.activities.find(a=>a.id===this.selectedId));};
    $('behavior-outcome').onclick=()=>{if(this.report?.outcome)this.onBrief?.(this.report);else{const event=this.report?.activities.filter(a=>a.kind==='outcome').at(-1);if(event){this.agent='all';this.kind='all';this.select(event.id);}}};
    $('behavior-speed').onchange=e=>{this.speed=Number(e.target.value);if(this.playing){this.pause();this.play();}};
    $('behavior-play').onclick=()=>this.playing?this.pause():this.play();
    $('behavior-prev').onclick=()=>this.step(-1);$('behavior-next').onclick=()=>this.step(1);
    $('behavior-slider').oninput=e=>{this.pause();this.select(this.filtered()[Number(e.target.value)]?.id);};
    $('behavior-follow').onchange=e=>{this.follow=e.target.checked;if(this.follow)this.select(this.filtered().at(-1)?.id,false);};
    $('behavior-live').onclick=()=>{this.archived=false;this.load(this.liveRunId);};
    $('behavior-more').onclick=()=>{this.limit+=24;this.renderList();};
    $('behavior-refresh').onclick=()=>this.load(this.runId);
    this.observer=new ResizeObserver(()=>this.renderRiver());this.observer.observe($('behavior-river'));
  }
  beginRun(id){clearTimeout(this.timer);this.timer=null;this.liveRunId=id;this.archived=false;this.agent='all';this.kind='all';this.follow=true;this.selectedId=null;this.limit=12;this.pause();return this.load(id);}
  event(event){if(!event.run)return;if(event.type==='run.started'){this.beginRun(event.run);return;}if(event.run!==this.liveRunId||this.archived)return;
    if(['run.completed','run.failed','run.stopped','hackathon.contribution','hackathon.phase','hackathon.roles','hackathon.network','hackathon.web.request','hackathon.web.result','hackathon.agent.error','hackathon.agent.timeout','agent.observation'].includes(event.type)){
      if(['run.completed','run.failed','run.stopped'].includes(event.type)){clearTimeout(this.timer);this.timer=null;this.load(event.run);}else if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.load(event.run);},700);
    }
  }
  async load(id,{archive=false}={}){
    if(!id)return;if(archive){this.archived=true;this.pause();this.agent='all';this.kind='all';this.selectedId=null;this.follow=false;}
    const changed=id!==this.runId;this.runId=id;const version=++this.version;
    if(changed){this.report=null;$('behavior-status').textContent='Loading recorded activity…';}
    try{
      const response=await fetch(`/runs/${encodeURIComponent(id)}/analysis`);if(!response.ok)throw new Error(await response.text());
      const report=await response.json();if(version!==this.version||id!==this.runId)return;
      this.report=report;this.renderSummary();this.renderInteractive();
    }catch(error){if(version===this.version)$('behavior-status').textContent=`Report unavailable: ${error.message}`;}
  }
  filtered(){return (this.report?.activities??[]).filter(a=>(this.kind==='all'||a.kind===this.kind)&&(this.agent==='all'||a.agent===this.agent||a.agents.includes(this.agent)||a.recipients?.includes(this.agent)||a.observedBy.includes(this.agent)||a.contextPeers.includes(this.agent)));}
  selectAgent(name,notify=false){if(!this.report)return;this.agent=this.report.members.some(a=>a.name===name)?name:'all';this.limit=12;this.follow=false;if(this.agent!=='all')this.selectedId=this.report.activities.filter(a=>a.agent===this.agent).at(-1)?.id??null;this.renderInteractive();if(notify&&this.agent!=='all')this.onAgent?.(this.agent,this.report);}
  select(id,notify=true){if(!id)return;this.selectedId=id;this.follow=false;this.renderInteractive();}
  step(direction){this.pause();const items=this.filtered();if(!items.length)return;const current=items.findIndex(a=>a.id===this.selectedId);this.select(items[Math.max(0,Math.min(items.length-1,current+direction))].id);}
  play(){if(!this.filtered().length)return;this.follow=false;this.playing=true;const items=this.filtered();if(this.selectedId===items.at(-1)?.id)this.selectedId=items[0].id;
    $('behavior-play').textContent='Ⅱ Pause trajectory';this.renderInteractive();
    this.playTimer=setInterval(()=>{const sequence=this.filtered(),index=sequence.findIndex(a=>a.id===this.selectedId);if(index>=sequence.length-1){this.pause();return;}this.select(sequence[index+1].id);},1100/this.speed);
  }
  pause(){clearInterval(this.playTimer);this.playing=false;document.querySelectorAll('#behavior-graph .playing').forEach(node=>node.classList.remove('playing'));$('behavior-play').textContent='▶ Play trajectory';if(this.report)this.renderGraph(this.report.activities.find(a=>a.id===this.selectedId));}
  renderSummary(){
    const r=this.report;$('behavior-empty').hidden=true;$('behavior-content').hidden=false;
    $('behavior-status').textContent=`${this.archived?'ARCHIVE':'CURRENT RUN'} · ${r.status.toUpperCase()}${r.simulated?' · SIMULATED':''}`;
    $('behavior-run').textContent=`${r.runId.slice(0,8)} · ${new Date(r.startedAt).toLocaleString()} · ${duration(r.durationMs)}`;
    $('behavior-overview').textContent=r.summary[0]?.text??'No recorded summary available.';
    $('behavior-objective').textContent=r.objective??'Research objective was not recorded for this older run.';
    $('behavior-live').hidden=!this.archived||!this.liveRunId;
    $('behavior-download').href=`/runs/${encodeURIComponent(r.runId)}/analysis.md`;
    $('behavior-kpis').replaceChildren();for(const[label,value]of [['Contributions',r.totals.contributions],['Sources retrieved',r.totals.sources],['Sources in brief',r.totals.citedSources],['Failures / timeouts',`${r.totals.failedAttempts} / ${r.totals.timeouts}`]]){const tile=el('div');tile.append(el('strong',String(value)),el('span',label));$('behavior-kpis').append(tile);}
    $('behavior-findings').replaceChildren();for(const finding of r.summary){const card=el('article',undefined,'behavior-finding');card.append(el('h3',finding.title),el('p',finding.text));if(finding.eventIds.length)card.append(button(`Inspect evidence · ${finding.eventIds.map(id=>`#${id}`).join(', ')}`,()=>{this.agent='all';this.kind='all';this.select(finding.eventIds[0]);$('behavior-detail').scrollIntoView({behavior:'smooth',block:'nearest'});},'evidence-link'));$('behavior-findings').append(card);}
    $('behavior-limits').replaceChildren();for(const note of r.limitations)$('behavior-limits').append(el('li',note));
    $('behavior-phases').replaceChildren();for(const p of r.phases){const chip=button(`${p.phase} · ${p.round}`,()=>{this.agent='all';this.kind='all';this.select(p.eventId);},'phase-chip');$('behavior-phases').append(chip);}
    this.renderMembers();
  }
  renderMembers(){
    const r=this.report,target=$('behavior-members');target.replaceChildren();
    for(const a of r.members){const card=el('article',undefined,'behavior-member');card.style.setProperty('--agent-color',palette[a.index%palette.length]);const title=button(`${a.name} ↗`,()=>this.selectAgent(a.name,true),'member-select');
      const times=[...a.responseMs].sort((x,y)=>x-y),median=times.length?times[Math.floor(times.length/2)]:null;
      card.append(title,el('p',a.roles.at(-1)?.title??a.initialRole??'Role not recorded','behavior-member-role'),el('p',a.model??'Model not recorded','behavior-model'),el('p',`${a.contributions} contributions · ${a.searches} search requests · ${a.reads} read requests`),el('p',`${a.peerContributionsSeen} distinct peer contributions in context · ${a.peersSeen.length} peers seen`),el('p',`${a.citations.length} distinct source IDs cited; ${a.peerSources.length} from teammates`),el('p',`${a.failedAttempts} failed attempts · ${a.retries} retries · ${a.timeouts} timeouts`),el('p',`Median decision: ${duration(median)} · Tokens: ${a.tokens===null?'not reported':a.tokens.toLocaleString()}`));
      if(a.roles.length>1)card.append(el('p',`Role path: ${a.roles.map(role=>role.title).join(' → ')}`,'behavior-role-path'));
      if(a.synthesized)card.append(el('span','Produced the final brief','tag'));target.append(card);
    }
  }
  renderInteractive(){
    if(!this.report)return;const items=this.filtered();
    $('behavior-agent').replaceChildren(new Option('Entire swarm','all'));for(const a of this.report.members)$('behavior-agent').add(new Option(a.name,a.name));$('behavior-agent').value=this.agent;$('behavior-kind').value=this.kind;$('behavior-follow').checked=this.follow;
    if(this.follow)this.selectedId=items.at(-1)?.id??null;
    if(!items.some(a=>a.id===this.selectedId))this.selectedId=items[0]?.id??null;
    const index=items.findIndex(a=>a.id===this.selectedId);$('behavior-slider').max=String(Math.max(0,items.length-1));$('behavior-slider').value=String(Math.max(0,index));$('behavior-slider').disabled=!items.length;
    $('behavior-position').textContent=items.length?`${index+1} / ${items.length} recorded actions`:'No matching actions';
    $('behavior-prev').disabled=!items.length||index<=0;$('behavior-next').disabled=!items.length||index>=items.length-1;$('behavior-play').disabled=!items.length;
    this.renderRiver();this.renderDetail(items[index]);this.renderGraph(items[index]);this.renderList();if(items[index])this.onActivity?.(items[index],this.report);
  }
  renderRiver(){
    if(!this.report)return;const target=$('behavior-river'),r=this.report,items=this.filtered();target.replaceChildren();
    const lanes=[...r.members.map(a=>a.name),'Environment'];const width=Math.max(520,target.clientWidth-2),left=96,top=23,row=24,height=top+lanes.length*row+16;
    const diagram=svg('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':'Recorded activity by agent and elapsed time'});diagram.style.width=`${width}px`;diagram.style.minWidth='100%';diagram.style.height=`${height}px`;
    const span=Math.max(1,r.durationMs);for(let tick=0;tick<5;tick++){const x=left+(width-left-24)*tick/4;diagram.append(svg('line',{x1:x,x2:x,y1:top-12,y2:height-24,class:'river-grid'}));const label=svg('text',{x,y:15,class:'river-time'});label.textContent=duration(span*tick/4);diagram.append(label);}
    lanes.forEach((name,index)=>{const y=top+index*row;const label=svg('text',{x:8,y:y+5,class:'river-name'});label.textContent=name;diagram.append(label,svg('line',{x1:left,x2:width-20,y1:y,y2:y,class:'river-lane'}));});
    for(const activity of items){const lane=activity.agent?r.members.findIndex(a=>a.name===activity.agent):lanes.length-1;const x=left+(width-left-24)*Math.min(1,activity.elapsedMs/span),y=top+Math.max(0,lane)*row;const dot=svg('g',{role:'button',tabindex:0,'aria-label':`Event ${activity.id}: ${activity.agent??'Environment'} · ${activity.title}`,class:`river-event ${activity.kind} ${activity.id===this.selectedId?'selected':''}`});const color=lane<r.members.length?palette[lane%palette.length]:'#b4bca3';dot.style.setProperty('--event-color',color);dot.append(svg('circle',{cx:x,cy:y,r:activity.id===this.selectedId?5:3}));const title=svg('title');title.textContent=`#${activity.id} · ${activity.agent??'Environment'} · ${activity.title}`;dot.append(title);dot.onclick=()=>this.select(activity.id);dot.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.select(activity.id);}};diagram.append(dot);}
    const current=items.find(a=>a.id===this.selectedId);if(current){const x=left+(width-left-24)*Math.min(1,current.elapsedMs/span);diagram.append(svg('line',{x1:x,x2:x,y1:top-12,y2:height-24,class:'river-playhead'}));}
    target.append(diagram);
  }
  renderDetail(activity){
    const target=$('behavior-detail');target.replaceChildren();if(!activity){target.append(el('p','No actions match these filters.'));return;}
    const r=this.report;target.append(el('div',`EVENT #${activity.id} · ${duration(activity.elapsedMs)} FROM START`,'eyebrow'),el('h3',`${activity.agent??'Environment'} · ${activity.title}`),el('p',`${activity.phase}${activity.round?` · round ${activity.round}`:''}${activity.role?` · ${activity.role}`:''}`,'behavior-event-meta'),el('p',activity.detail,'behavior-event-text'));
    const chips=(label,names)=>{if(!names?.length)return;const line=el('div',undefined,'activity-recipients');line.append(el('span',label));for(const name of names)line.append(button(name,()=>this.selectAgent(name,true),'agent-chip'));target.append(line);};
    if(activity.recipients!==null){if(activity.recipients.length)chips('Available to',activity.recipients);else target.append(el('p','No outgoing recipients recorded for this contribution.','behavior-event-meta'));}
    chips('Seen in later contexts',activity.observedBy);chips('Peer work in this context',activity.contextPeers);
    if(activity.inSynthesisContext)target.append(el('p',`This contribution was present in ${r.outcome?.agent??'the synthesizer'}’s final synthesis context.`,'synthesis-link'));
    if(activity.sourceIds.length){const sourceList=el('div',undefined,'activity-sources');sourceList.append(el('h4',activity.kind==='context'?'Sources available in this context':'Linked sources'));for(const id of activity.sourceIds){const source=r.sources.find(s=>s.id===id),line=el('p');if(source)line.append(safeLink(`${id} · ${source.title}`,source.url));else line.textContent=`${id} · source details not recorded`;if(r.outcome?.citedIds.includes(id))line.append(el('span',' · cited in final brief','synthesis-link'));sourceList.append(line);}target.append(sourceList);}
    const actions=el('div',undefined,'activity-detail-actions');if(activity.agent)actions.append(button(this.archived?'Locate replay node ↑':'Locate this agent ↑',()=>{this.onAgent?.(activity.agent,r);(r.runId===this.liveRunId&&!this.archived?$('network-panel'):$('behavior-graph')).scrollIntoView({behavior:'smooth',block:'start'});}));
    if(activity.type!=='run.failed')actions.append(button('Open recorded event ↗',()=>this.onArchive?.(activity,r)));
    if(r.outcome)actions.append(button('Read final research brief ↓',()=>this.onBrief?.(r)));
    target.append(actions);
  }
  renderGraph(activity){
    cancelAnimationFrame(this.frame);const target=$('behavior-graph');if(this.layout!=='spiral')target.replaceChildren();if(!this.report){target.replaceChildren();return;}const r=this.report,n=r.members.length;if(!n)return;const large=n>20,snapshot=activity?.network??r.networks?.[activity?.networkRef]??null;target.classList.toggle('replay-large',large);
    if(this.layout==='spiral'){
      this.dome.mount(target);this.dome.setData({members:r.members,network:snapshot,activities:r.activities,activity,selected:r.members.findIndex(m=>m.name===activity?.agent),runId:r.runId,playing:this.playing,speed:this.speed});
      this.graphCaption(activity,snapshot,large);return;
    }
    const scene=svg('svg',{viewBox:'0 0 620 350',role:'group','aria-label':'Swarm activity replay, read only'});
    const defs=svg('defs'),marker=svg('marker',{id:'replay-arrow',viewBox:'0 0 10 10',refX:7,refY:5,markerWidth:5,markerHeight:5,orient:'auto'});marker.append(svg('path',{d:'M 0 1 L 9 5 L 0 9 z',fill:'#d7c590'}));defs.append(marker);scene.append(defs);
    const columns=Math.ceil(Math.sqrt(n*1.7)),rows=Math.ceil(n/columns);
    const positions=r.members.map((a,i)=>large?({x:38+(i%columns)*544/Math.max(1,columns-1),y:30+Math.floor(i/columns)*275/Math.max(1,rows-1)}):({x:this.layout==='flow'?65+i*(490/Math.max(1,n-1)):310+195*Math.cos(-Math.PI/2+i*2*Math.PI/n),y:this.layout==='flow'?170+(i%2?40:-40):171+112*Math.sin(-Math.PI/2+i*2*Math.PI/n)}));
    const routes=[];if(activity?.agent){for(const name of activity.recipients??[])routes.push([activity.agent,name,'published']);for(const name of activity.contextPeers)routes.push([name,activity.agent,'observed']);}
    const index=name=>r.members.findIndex(a=>a.name===name);const edge=(from,to,cls)=>{if(from<0||to<0||from===to||!positions[from]||!positions[to])return;const a=positions[from],b=positions[to],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;const line=svg('line',{x1:a.x+dx/len*(large?13:26),y1:a.y+dy/len*(large?13:26),x2:b.x-dx/len*(large?13:29),y2:b.y-dy/len*(large?13:29),class:cls});if(cls!=='replay-edge')line.setAttribute('marker-end','url(#replay-arrow)');scene.append(line);if(cls!=='replay-edge'){const packet=svg('circle',{cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,r:large?2:3,class:'replay-packet'});if(this.playing&&!this.reducedMotion.matches){for(const [attributeName,from,to]of [['cx',a.x,b.x],['cy',a.y,b.y]])packet.append(svg('animate',{attributeName,from,to,dur:`${1.1/this.speed}s`,repeatCount:'indefinite'}));}scene.append(packet);}};
    const selectedAgent=index(activity?.agent),drawnEdges=(snapshot?.edges??[]).filter(e=>!large||e.from===selectedAgent||e.to===selectedAgent);for(const e of drawnEdges)edge(e.from,e.to,'replay-edge');for(const[from,to,kind]of routes)edge(index(from),index(to),`replay-route ${kind} ${this.playing?'playing':''}`);
    r.members.forEach((a,i)=>{const p=positions[i],selected=a.name===activity?.agent||activity?.agents.includes(a.name),related=routes.some(route=>route[0]===a.name||route[1]===a.name);const node=svg('g',{transform:`translate(${p.x},${p.y})`,role:'button',tabindex:0,'aria-label':`Inspect ${a.name} activity`,class:`replay-node ${selected?'selected':''} ${related?'related':''}`});node.style.setProperty('--agent-color',palette[i%palette.length]);
      const history=r.activities.filter(event=>event.agent===a.name),selectedIndex=history.findIndex(event=>event.id===activity?.id);let trail=history.length>60?history.filter((event,index)=>index%Math.ceil(history.length/60)===0||index===selectedIndex):history;
      const trailPath=[];for(const event of trail){const j=history.indexOf(event),angle=j*.55-Math.PI/2,radius=(large?24:56)+Math.min(24,j*.65),x=Math.cos(angle)*radius,y=Math.sin(angle)*radius*.58;trailPath.push(`${trailPath.length?'L':'M'}${x},${y}`);const dot=svg('g',{role:'button',tabindex:0,'aria-label':`Select event ${event.id}: ${a.name} · ${event.title}`,class:`replay-action ${event.id===activity?.id?'current':''} ${event.elapsedMs>(activity?.elapsedMs??0)?'future':''}`});dot.append(svg('circle',{cx:x,cy:y,r:large?2:3}));const title=svg('title');title.textContent=`#${event.id} · ${event.title}`;dot.append(title);const select=()=>{this.pause();this.agent='all';this.kind='all';this.select(event.id);};dot.onclick=e=>{e.stopPropagation();select();};dot.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();select();}};node.append(dot);}const path=svg('path',{d:trailPath.join(' '),class:'replay-action-trail'});node.prepend(path);
      node.append(svg('circle',{r:large?10:24,class:'replay-node-circle'}));const letter=svg('text',{'text-anchor':'middle',y:5,class:'replay-letter'});letter.textContent=agentCode(i);const label=svg('text',{'text-anchor':'middle',y:44,class:'replay-label'});label.textContent=a.name;node.append(letter,label);node.onclick=()=>this.selectAgent(a.name,true);node.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.selectAgent(a.name,true);}};scene.append(node);});
    scene.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();this.step(e.key==='ArrowLeft'?-1:1);}};
    target.append(scene);
    this.graphCaption(activity,snapshot,large);
  }
  graphCaption(activity,snapshot,large){
    $('behavior-route').textContent=activity?.agent?`${activity.agent}${activity.contextPeers.length?' ← '+activity.contextPeers.join(', '):activity.recipients?.length?' → '+activity.recipients.join(', '):''}`:activity?.title??'';$('behavior-graph-caption').textContent=activity?`Recorded snapshot · ${snapshot?`network revision ${activity.networkRevision??0}`:'topology not recorded'}${large?' · selected-agent channels':''} · event #${activity.id} · ${duration(activity.elapsedMs)} · ${this.layout==='spiral'?'3D · drag to rotate':'select a trail dot'}`:'Select an action to inspect its swarm.';
  }
  renderList(){
    const target=$('behavior-actions'),all=this.filtered();target.replaceChildren();for(const activity of all.slice(0,this.limit)){const row=button('',()=>this.select(activity.id),'recorded-action');row.classList.toggle('selected',activity.id===this.selectedId);row.append(el('span',`#${activity.id} · ${duration(activity.elapsedMs)}`,'action-time'),el('b',`${activity.agent??'Environment'} · ${activity.title}`),el('span',activity.detail.length>175?activity.detail.slice(0,175)+'…':activity.detail,'action-excerpt'));target.append(row);}if(!all.length)target.append(el('p','No recorded actions match these filters.','trace-note'));$('behavior-more').hidden=this.limit>=all.length;$('behavior-more').textContent=`Show more · ${Math.max(0,all.length-this.limit)} remaining`;
  }
}
