import { agentCode, agentName } from './identity.js';
const NS = 'http://www.w3.org/2000/svg';
const colors = ['#c9b879','#89accc','#b7a1ce','#d09c7e','#99b39b','#ca9db3','#a7b777','#91bab6'];
const $ = id => document.getElementById(id);
function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
function svg(tag, attrs) { const e = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, value); return e; }
export function presetNetwork(count, preset) {
  const edges = [], add = (from, to, both = true) => { if (from === to) return; if (!edges.some(e => e.from === from && e.to === to)) edges.push({from,to}); if (both) add(to, from, false); };
  if (preset === 'mesh') for (let i=0;i<count;i++) for(let j=i+1;j<count;j++) add(i,j);
  if (preset === 'hub') for(let i=0;i<count-1;i++) add(count-1,i);
  if (preset === 'ring') for(let i=0;i<count;i++) add(i,(i+1)%count);
  if (preset === 'pipeline') for(let i=0;i<count-1;i++) add(i,i+1,false);
  if (preset === 'clusters') { const split=Math.ceil(count/2); for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)if((i<split)===(j<split))add(i,j); add(split-1,split); }
  return {count, revision:0, edges};
}
export class SwarmNetwork {
  constructor(onChange, onRoleChange, onSelect) {
    this.onSelect=onSelect;this.activityFocus=null;this.onChange=onChange;this.onRoleChange=onRoleChange;this.roleSettings=null;this.roleDrafts=new Map();this.roleNotices=new Map();this.roleSaving=false;this.assignments=[];this.graph=presetNetwork(5,'mesh');this.selected=0;this.positions=[];this.states=new Map();this.packets=[];this.running=false;this.saving=false;this.connect=false;this.preset='mesh';this.activeRun=null;this.paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.svg=$('network-graph');this.canvas=$('swarm-canvas');this.ctx=this.canvas.getContext('2d');
    for(const b of document.querySelectorAll('[data-preset]'))b.onclick=()=>this.applyPreset(b.dataset.preset);
    $('pause-animation').onclick=()=>{this.paused=!this.paused;this.motionLabel();if(this.paused)this.draw(performance.now());};
    $('connect-mode').onclick=()=>{this.connect=!this.connect;$('connect-mode').setAttribute('aria-pressed',String(this.connect));this.help();};
    $('inspect-agent').onchange=()=>{this.connect=false;$('connect-mode').setAttribute('aria-pressed','false');this.choose(Number($('inspect-agent').value));};
    $('reset-layout').onclick=()=>{this.layout();this.render();};
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe($('graph-stage'));
    document.addEventListener('visibilitychange',()=>{this.lastTime=0;});
    const frame=time=>{if(!this.paused&&!document.hidden)this.draw(time);this.frame=requestAnimationFrame(frame);};this.frame=requestAnimationFrame(frame);
    this.motionLabel();
  }
  motionLabel(){ $('pause-animation').textContent=this.paused?'▶ Resume motion':'Ⅱ Pause motion';$('pause-animation').setAttribute('aria-pressed',String(this.paused)); }
  resize(){ const mobile=matchMedia('(max-width:850px)').matches;const changed=this.mobile!==mobile;this.mobile=mobile;this.svg.setAttribute('viewBox',mobile?'100 0 700 480':'0 0 900 480');const rect=this.canvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);if(changed){this.layout();this.render();}else this.draw(performance.now()); }
  layout(){ const n=this.graph.count;if(n>20){const columns=Math.ceil(Math.sqrt(n*1.8)),rows=Math.ceil(n/columns);this.positions=Array.from({length:n},(_,i)=>({x:75+(i%columns)*750/Math.max(1,columns-1),y:55+Math.floor(i/columns)*330/Math.max(1,rows-1)}));return;}this.positions=Array.from({length:n},(_,i)=>{if(this.preset==='pipeline')return this.mobile?{x:i%2?630:270,y:55+i*(330/(n-1))}:{x:100+i*(700/(n-1)),y:240+(i%2?24:-24)};if(this.preset==='hub'&&i===n-1)return{x:450,y:240};const size=this.preset==='hub'?n-1:n;const angle=-Math.PI/2+i*2*Math.PI/size;return{x:450+260*Math.cos(angle),y:238+155*Math.sin(angle)};}); }
  configure(setup, {runId=null, force=false}={}) {
    const changed=this.graph.count!==setup.assignments.length;
    const defaults=setup.roleSettings?.assignments??setup.assignments.map(a=>({title:a.label,instructions:a.instruction??''}));
    if(force||!this.roleSettings){this.roleSettings=structuredClone(setup.roleSettings??{revision:0,assignments:defaults});this.roleDrafts.clear();this.roleNotices.clear();}
    else if(changed){this.roleSettings={revision:0,assignments:defaults.map((role,i)=>this.roleSettings.assignments[i]??role)};this.roleDrafts.clear();}
    this.assignments=setup.assignments.map((a,i)=>({...a,role:this.roleSettings.assignments[i].title,label:this.roleSettings.assignments[i].title,instruction:this.roleSettings.assignments[i].instructions}));
    if(force||changed){this.graph=structuredClone(setup.network??presetNetwork(setup.assignments.length,'mesh'));const key = edges => edges.map(e=>`${e.from}:${e.to}`).sort().join(',');
      this.preset = ['mesh','hub','ring','pipeline','clusters'].find(name=>key(presetNetwork(this.graph.count,name).edges)===key(this.graph.edges)) ?? 'custom';
      this.selected=Math.min(this.selected,this.graph.count-1);this.layout();}
    this.activeRun=runId;this.render();
  }
  receiveRoles(settings){
    this.roleSettings=structuredClone(settings);
    this.assignments=this.assignments.map((a,i)=>({...a,role:settings.assignments[i].title,label:settings.assignments[i].title,instruction:settings.assignments[i].instructions}));
    this.render();
  }
  roleEditor(index){
    const assigned=this.roleSettings?.assignments[index];if(!assigned)return null;
    const value=this.roleDrafts.get(index)??assigned;
    const form=el('form',undefined,'role-editor');form.setAttribute('aria-label',`${this.name(index)} role editor`);
    const titleLabel=el('label','Role title'),title=el('input');title.type='text';title.maxLength=80;title.required=true;title.value=value.title;title.dataset.roleField='title';title.setAttribute('aria-label',`${this.name(index)} role title`);titleLabel.append(title);
    const instructionsLabel=el('label','Role instructions'),instructions=el('textarea');instructions.rows=3;instructions.maxLength=2000;instructions.value=value.instructions;instructions.dataset.roleField='instructions';instructions.placeholder='Describe what this agent should focus on…';instructions.setAttribute('aria-label',`${this.name(index)} role instructions`);instructionsLabel.append(instructions);
    const actions=el('div',undefined,'role-actions'),save=el('button',this.roleSaving?'Applying…':'Apply role');save.type='submit';const reset=el('button','Discard');reset.type='button';reset.className='quiet';reset.onclick=()=>{this.roleDrafts.delete(index);this.roleNotices.delete(index);this.renderInspector();};
    const isDirty=()=>JSON.stringify({title:title.value,instructions:instructions.value})!==JSON.stringify(assigned);
    const refresh=()=>{save.disabled=this.roleSaving||!title.value.trim()||!isDirty();reset.disabled=this.roleSaving||!isDirty();};
    const edit=()=>{this.roleDrafts.set(index,{title:title.value,instructions:instructions.value});this.roleNotices.delete(index);refresh();};title.oninput=instructions.oninput=edit;
    title.disabled=instructions.disabled=this.roleSaving;refresh();actions.append(save,reset);
    const note=el('p',this.roleNotices.get(index)??(this.running?'Changes apply to this agent’s next decision.':'Save this role for the next run.'),'role-save-status');note.setAttribute('role','status');
    form.append(titleLabel,instructionsLabel,actions,note);
    form.onsubmit=async event=>{
      event.preventDefault();if(this.roleSaving||!title.value.trim())return;
      const next=structuredClone(this.roleSettings);next.assignments[index]={title:title.value,instructions:instructions.value};
      this.roleSaving=true;this.renderInspector();
      try{const accepted=await this.onRoleChange(next);this.roleDrafts.delete(index);this.roleNotices.set(index,this.running?'Role applied · next decision.':'Role saved for the next run.');this.receiveRoles(accepted??next);}
      catch(error){this.roleNotices.set(index,error.message);}
      finally{this.roleSaving=false;this.renderInspector();}
    };
    return form;
  }
  setRunning(running,runId=this.activeRun){this.running=running;this.activeRun=runId;this.help();this.updateMode();}
  updateMode(){ $('graph-mode-label').textContent=this.running?'Live activity · pulses follow contributions':this.hasRun?'Run finished · ambient swarm':'Ambient swarm · awaiting run'; }
  help(){ $('network-help').textContent=this.connect?`Connect mode: select a source, then another node to toggle a ${$('two-way').checked?'two-way link':'one-way channel'}.`:'Select a node to inspect. Drag to arrange. Use Connect nodes to add or remove channels.';$('network-save').textContent=this.saving?'Saving network…':this.running?'Live · edits apply next decision':'Applies when you start'; }
  async applyPreset(name){if(this.saving)return;this.preset=name;const next=presetNetwork(this.graph.count,name);next.revision=this.graph.revision;await this.commit(next,true);}
  async commit(next, layout=false){
    if(this.saving)return;this.saving=true;this.renderInspector();this.help();
    try{const accepted=await this.onChange(next);this.graph=structuredClone(accepted??next);if(layout)this.layout();}
    catch(error){$('network-save').textContent=error.message;this.error=error.message;}
    finally{this.saving=false;this.render();if(this.error){$('network-save').textContent=this.error;this.error=null;}}
  }
  receive(graph){const key=edges=>edges.map(e=>`${e.from}:${e.to}`).sort().join(',');const preset=['mesh','hub','ring','pipeline','clusters'].find(name=>key(presetNetwork(graph.count,name).edges)===key(graph.edges))??'custom';const relayout=this.positions.length!==graph.count||(preset!=='custom'&&preset!==this.preset);this.graph=structuredClone(graph);this.preset=preset;if(relayout)this.layout();this.render();}
  toggle(from,to,both=false){if(this.saving||from===to)return;this.preset='custom';const next=structuredClone(this.graph);const exists=next.edges.some(e=>e.from===from&&e.to===to);const pairs=both?[[from,to],[to,from]]:[[from,to]];for(const[a,b]of pairs){next.edges=next.edges.filter(e=>!(e.from===a&&e.to===b));if(!exists)next.edges.push({from:a,to:b});}this.commit(next);}
  choose(i){if(this.connect&&this.selected!==i){this.toggle(this.selected,i,$('two-way').checked);return;}this.selected=i;this.selectedEdge=null;this.activityFocus=null;this.render();this.onSelect?.(this.name(i));}
  focusActivity(activity){const index=this.assignments.findIndex(a=>a.name===activity.agent);if(index<0){this.activityFocus=null;this.render();return;}this.selected=index;this.activityFocus=activity;this.selectedEdge=null;this.render();}
  name(i){return this.assignments[i]?.name??agentName(i);}
  render(){
    if(!this.positions.length)this.layout();
    const n=this.graph.count, edges=this.graph.edges,large=n>20,edgeKeys=new Set(edges.map(e=>`${e.from}:${e.to}`));
    const pairs=edges.filter(e=>e.from<e.to&&edgeKeys.has(`${e.to}:${e.from}`)).length;
    const visibleEdges=large?edges.filter(e=>e.from===this.selected||e.to===this.selected):edges;
    $('network-panel').classList.toggle('network-large',large);
    const inspect=$('inspect-agent'),focused=document.activeElement===inspect;
    if(!focused){inspect.replaceChildren();this.assignments.forEach((a,i)=>inspect.add(new Option(`${a.name} · ${a.label}`,String(i))));inspect.value=String(this.selected);}
    $('large-network-note').textContent=large?`All ${n} nodes shown · channels for ${this.name(this.selected)} highlighted. Select an agent to inspect its connections.`:'';
    const singles=edges.length-2*pairs;$('network-summary').textContent=`${n} agents · ${pairs?`${pairs} two-way ${pairs===1?'link':'links'}`:''}${pairs&&singles?' + ':''}${singles?`${singles} one-way ${singles===1?'channel':'channels'}`:''}${!pairs&&!singles?'no channels':''}`;
    $('network-revision').textContent=this.running?`REV ${String(this.graph.revision).padStart(2,'0')}`:'DRAFT';
    document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===this.preset)));
    this.svg.replaceChildren();const defs=svg('defs',{});for(const end of ['end','start']){const marker=svg('marker',{id:`arrow-${end}`,viewBox:'0 0 10 10',refX:5,refY:5,markerWidth:6,markerHeight:6,orient:end==='start'?'auto-start-reverse':'auto',markerUnits:'userSpaceOnUse'});marker.append(svg('path',{d:'M 0 1 L 9 5 L 0 9 z',fill:'#b2b89c'}));defs.append(marker);}this.svg.append(defs);
    const drawn=new Set();for(const edge of visibleEdges){const lo=Math.min(edge.from,edge.to),hi=Math.max(edge.from,edge.to),key=`${lo}:${hi}`;if(drawn.has(key))continue;drawn.add(key);const a=this.positions[lo],b=this.positions[hi],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,margin=large?18:36;const attrs={x1:a.x+dx/len*margin,y1:a.y+dy/len*margin,x2:b.x-dx/len*margin,y2:b.y-dy/len*margin};const line=svg('line',{...attrs,class:'graph-edge'});if(edgeKeys.has(`${lo}:${hi}`))line.setAttribute('marker-end','url(#arrow-end)');if(edgeKeys.has(`${hi}:${lo}`))line.setAttribute('marker-start','url(#arrow-start)');const hit=svg('line',{...attrs,class:'graph-edge hit',tabindex:0,role:'button','aria-label':`Inspect link ${this.name(lo)} and ${this.name(hi)}`});const select=()=>{this.selectedEdge={lo,hi};this.renderInspector();};hit.onclick=select;hit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};this.svg.append(line,hit);}
    for(let i=0;i<n;i++){const p=this.positions[i],state=this.states.get(this.name(i));const group=svg('g',{transform:`translate(${p.x},${p.y})`,class:`graph-node ${i===this.selected?'selected':''} ${this.activityFocus?.agent===this.name(i)?'activity-focused':''} ${state==='Working'?'working':''}`,tabindex:0,role:'button','aria-label':`${this.name(i)} · ${this.assignments[i]?.label??'Researcher'}`,'aria-pressed':String(i===this.selected)});group.style.setProperty('--node-color',colors[i%colors.length]);group.append(svg('circle',{r:large?19:this.mobile?46:39,class:'node-halo'}),svg('circle',{r:large?13:this.mobile?36:28,class:'node-ring'}));const letter=svg('text',{'text-anchor':'middle','dominant-baseline':'central'});letter.textContent=agentCode(i);const label=svg('text',{y:large?30:this.mobile?64:53,'text-anchor':'middle',class:'node-label'});label.textContent=this.name(i);const role=svg('text',{y:69,'text-anchor':'middle',class:'role-label'});role.textContent=this.assignments[i]?.label??'Researcher';group.append(letter,label,role,svg('circle',{cx:22,cy:-20,r:3.5,class:'node-status'}));this.bindNode(group,i);this.svg.append(group);}
    if(this.activityFocus){
      const activity=this.activityFocus,from=this.assignments.findIndex(a=>a.name===activity.agent);
      for(const recipient of activity.recipients??[]){const to=this.assignments.findIndex(a=>a.name===recipient);if(from<0||to<0)continue;const a=this.positions[from],b=this.positions[to],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
        const path=svg('line',{x1:a.x+dx/length*36,y1:a.y+dy/length*36,x2:b.x-dx/length*36,y2:b.y-dy/length*36,class:'recorded-route','marker-end':'url(#arrow-end)'});this.svg.insertBefore(path,this.svg.querySelector('.graph-node'));
      }
    }
    this.renderInspector();this.help();this.warning();this.draw(performance.now());
  }
  bindNode(group,index){let drag=null,moved=false;group.onpointerdown=e=>{if(e.button!==0)return;const p=this.svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const start=p.matrixTransform(this.svg.getScreenCTM().inverse());drag={x:start.x,y:start.y,original:{...this.positions[index]}};moved=false;group.setPointerCapture(e.pointerId);};group.onpointermove=e=>{if(!drag)return;const p=this.svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const next=p.matrixTransform(this.svg.getScreenCTM().inverse());const dx=next.x-drag.x,dy=next.y-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;if(moved){this.positions[index]={x:Math.max(55,Math.min(845,drag.original.x+dx)),y:Math.max(55,Math.min(385,drag.original.y+dy))};group.setAttribute('transform',`translate(${this.positions[index].x},${this.positions[index].y})`);}};group.onpointerup=()=>{drag=null;if(moved){this.render();this.skipClick=true;setTimeout(()=>{this.skipClick=false;},0);}};group.onpointercancel=()=>{drag=null;this.render();};group.onclick=()=>{if(this.skipClick){this.skipClick=false;return;}this.choose(index);};group.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();this.choose(index);}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const p=this.positions[index];p.x=Math.max(55,Math.min(845,p.x+(e.key==='ArrowLeft'?-12:e.key==='ArrowRight'?12:0)));p.y=Math.max(55,Math.min(385,p.y+(e.key==='ArrowUp'?-12:e.key==='ArrowDown'?12:0)));this.render();this.svg.querySelectorAll('.graph-node')[index].focus();}};}
  renderInspector(){
    const target=$('node-inspector');const active=document.activeElement;const focus=target.contains(active)&&active.dataset?.roleField?{field:active.dataset.roleField,start:active.selectionStart,end:active.selectionEnd,index:Number(active.closest('.role-editor')?.dataset.index)}:null;
    // Keep the actual editing element mounted while live status events arrive.
    // Replacing it mid-keystroke can interrupt typing, paste, and IME input.
    if(focus&&focus.index===this.selected&&!this.roleSaving){
      target.querySelector('.inspector-status').textContent=this.states.get(this.name(this.selected))??'Ready to research';
      target.querySelector('.inspector-role').textContent=this.assignments[this.selected]?.label??'Researcher';
      return;
    }
    target.replaceChildren();const i=this.selected;const assignment=this.assignments[i];const cap=el('div',undefined,'inspector-eyebrow');cap.append(el('span','AGENT INSPECTOR'),el('span',`${String(i+1).padStart(2,'0')} / ${String(this.graph.count).padStart(2,'0')}`));target.append(cap,el('h3',this.name(i),'inspector-name'),el('p',assignment?.label??'Researcher','inspector-role'),el('p',assignment?.model??'Loading model…','inspector-model'),el('div',this.states.get(this.name(i))??'Ready to research','inspector-status'));
    const editor=this.roleEditor(i);if(editor){editor.dataset.index=String(i);target.append(editor);}
    if(this.selectedEdge){const{lo,hi}=this.selectedEdge;const section=el('div',undefined,'channel-list');section.append(el('p',`Selected: ${this.name(lo)} ↔ ${this.name(hi)}`,'inspector-note'));const remove=el('button','Remove this link');remove.type='button';remove.disabled=this.saving;remove.onclick=()=>{this.preset='custom';const next=structuredClone(this.graph);next.edges=next.edges.filter(e=>!((e.from===lo&&e.to===hi)||(e.from===hi&&e.to===lo)));this.selectedEdge=null;this.commit(next);};section.append(remove);target.append(section);}
    const list=el('div',undefined,'channel-list');list.append(el('div','RECEIVES FROM','channel-title'));for(let j=0;j<this.graph.count;j++){if(i===j)continue;const label=el('label',undefined,'channel-row'),text=el('span',this.name(j)),dot=el('i');dot.style.setProperty('--node-color',colors[j%colors.length]);text.prepend(dot);const input=el('input');input.type='checkbox';input.checked=this.graph.edges.some(e=>e.from===j&&e.to===i);input.disabled=this.saving;input.setAttribute('aria-label',`${this.name(i)} receives from ${this.name(j)}`);input.onchange=()=>this.toggle(j,i);label.append(text,input);list.append(label);}const channels=el('div',undefined,'inspector-channels');channels.append(list);const out=el('div',undefined,'channel-outgoing');out.append(el('div','SENDS TO','channel-title'));const names=this.graph.edges.filter(e=>e.from===i).map(e=>this.name(e.to));out.append(el('div',names.join(' · ')||'No outgoing channels','outgoing-list'));channels.append(out);target.append(channels,el('p','Arrows route contributions and sources. No incoming links means independent research. Synthesis follows the same network.','inspector-note'));
    const activityLink=el('a','View this agent’s recorded activity ↓','inspector-activity-link');activityLink.href='#behavior';activityLink.onclick=()=>this.onSelect?.(this.name(i));target.append(activityLink);
    if(focus&&focus.index===i){const field=target.querySelector(`[data-role-field="${focus.field}"]`);if(field&&!field.disabled){field.focus({preventScroll:true});field.setSelectionRange(focus.start,focus.end);}}
  }
  warning(){const n=this.graph.count,reach=new Set([0]);for(let pass=0;pass<n;pass++)for(const e of this.graph.edges)if(reach.has(e.from)||reach.has(e.to)){reach.add(e.from);reach.add(e.to);}const isolated=Array.from({length:n},(_,i)=>i).filter(i=>!this.graph.edges.some(e=>e.to===i));const text=reach.size<n?'Disconnected groups: some researchers cannot exchange ideas. The final brief may miss their perspectives.':isolated.length?`${isolated.map(i=>this.name(i)).join(', ')} ${isolated.length===1?'has':'have'} no incoming channels and will research independently.`:'';$('network-warning').hidden=!text;$('network-warning').textContent=text;}
  state(name,state){this.states.set(name,state);const i=this.assignments.findIndex(a=>a.name===name);const node=this.svg.querySelectorAll('.graph-node')[i];node?.classList.toggle('working',state==='Working');if(i===this.selected){const status=$('node-inspector').querySelector('.inspector-status');if(status)status.textContent=state;}}
  activity(name,recipients){const from=this.assignments.findIndex(a=>a.name===name);if(from<0)return;for(const recipient of recipients??[]){const to=this.assignments.findIndex(a=>a.name===recipient);if(to>=0)this.packets.push({from,to,start:performance.now()});}this.hasRun=true;}
  draw(time){
    const ctx=this.ctx;if(!ctx||!this.canvas.width||!this.positions.length)return;const w=this.canvas.width,h=this.canvas.height;ctx.clearRect(0,0,w,h);const viewWidth=this.mobile?700:900;const scale=Math.min(w/viewWidth,h/480),ox=(w-viewWidth*scale)/2-(this.mobile?100*scale:0),oy=(h-480*scale)/2;ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);const t=this.paused?0:time/1000;
    // Ambient particles are visual context, not extra agents or fabricated messages.
    for(let arm=0;arm<this.graph.count;arm++){const node=this.positions[arm];ctx.fillStyle=colors[arm%colors.length];for(let j=0;j<(this.graph.count>20?5:43);j++){const r=9+j*2.05,angle=j*.61+t*.10+arm*1.27;const x=node.x+Math.cos(angle)*r,y=node.y+Math.sin(angle)*r*.47;ctx.globalAlpha=.10+(j%5)*.045;ctx.beginPath();ctx.arc(x,y,j%7===0?1.5:.8,0,Math.PI*2);ctx.fill();}}
    this.packets=this.packets.filter(p=>time-p.start<1500);for(const p of this.packets){const a=this.positions[p.from],b=this.positions[p.to];if(!a||!b)continue;const phase=Math.min(1,(time-p.start)/1500);ctx.globalAlpha=1;ctx.fillStyle=colors[p.from%colors.length];ctx.shadowColor=colors[p.from%colors.length];ctx.shadowBlur=12;ctx.beginPath();ctx.arc(a.x+(b.x-a.x)*phase,a.y+(b.y-a.y)*phase,3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}ctx.restore();
  }
}
