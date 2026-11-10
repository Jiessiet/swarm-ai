import { arcPoint, clamp, moveOnFloor, networkLayout, project3D, trajectoryPoint, TAU } from './dome-geometry.js';
import { agentCode } from './identity.js';
const NS = 'http://www.w3.org/2000/svg';
const colors = ['#c9b879','#89accc','#b7a1ce','#d09c7e','#99b39b','#ca9db3','#a7b777','#91bab6'];
let sceneId = 0;
function svg(tag, attrs = {}) { const node = document.createElementNS(NS, tag); for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value)); return node; }
function path(points) { return points.map((p,i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '); }
export class DomeScene {
  constructor({ onAgent, onActivity, onEdge, label = '3D spiral agent network' } = {}) {
    this.callbacks = { onAgent, onActivity, onEdge }; this.camera = { yaw: -.35, pitch: .58, zoom: 1 };
    this.uid = `dome-${++sceneId}`; this.offsets = new Map(); this.key = null; this.data = null; this.drag = null;
    this.root = document.createElement('div'); this.root.className = 'dome-scene';
    this.svg = svg('svg',{viewBox:'0 0 900 480',tabindex:0,role:'group','aria-label':label});
    const tools = document.createElement('div'); tools.className = 'dome-tools'; tools.setAttribute('aria-label','3D camera controls');
    for (const [text,label,action] of [['−','Zoom out',()=>this.zoom(.85)],['+','Zoom in',()=>this.zoom(1.18)],['⤾','Rotate left',()=>this.turn(-.25,0)],['⤿','Rotate right',()=>this.turn(.25,0)],['⌃','Tilt up',()=>this.turn(0,.12)],['⌄','Tilt down',()=>this.turn(0,-.12)],['Reset','Reset 3D view',()=>this.reset()]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.setAttribute('aria-label',label); button.onclick = action; tools.append(button);
    }
    this.root.append(this.svg,tools); this.bind();
  }
  mount(target) { if (this.root.parentElement !== target) target.replaceChildren(this.root); }
  setData(data) {
    this.data = data;
    const key = `${data.runId ?? ''}|${data.members.length}|${(data.network?.edges ?? []).map(e=>`${e.from}:${e.to}`).sort().join(',')}`;
    if (key !== this.key) { this.key = key; this.anchors = networkLayout(data.members.length,data.network?.edges ?? []); this.offsets.clear(); }
    this.histories = data.members.map(member => (data.activities ?? []).filter(a=>a.agent===member.name)); this.render();
  }
  reset() { this.camera = { yaw: -.35, pitch: .58, zoom: 1 }; this.offsets.clear(); this.render(); }
  zoom(factor) { this.camera.zoom = clamp(this.camera.zoom * factor,.6,1.7); this.render(); }
  turn(yaw,pitch) { this.camera.yaw += yaw; this.camera.pitch = clamp(this.camera.pitch + pitch,.25,1.15); this.render(); }
  worldPointer(event) { const p = this.svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; return p.matrixTransform(this.svg.getScreenCTM().inverse()); }
  bind() {
    this.svg.addEventListener('pointerdown',event=>{
      if (event.button !== 0 || event.target.closest('[data-event],[data-edge]')) return;
      const agent = event.target.closest('[data-agent]'), index = agent ? Number(agent.dataset.agent) : null;
      if (index !== null && this.data?.connect) return;
      this.drag = { index, lift: event.altKey, start: this.worldPointer(event), camera: {...this.camera}, anchor: index === null ? null : {...(this.offsets.get(index) ?? this.anchors[index])}, moved: false };
      this.svg.setPointerCapture(event.pointerId); event.preventDefault();
    });
    this.svg.addEventListener('pointermove',event=>{
      if (!this.drag) return; const p = this.worldPointer(event), dx = p.x - this.drag.start.x, dy = p.y - this.drag.start.y;
      if (Math.abs(dx)+Math.abs(dy)<4 && !this.drag.moved) return; this.drag.moved = true;
      if (this.drag.index === null) { this.camera.yaw = this.drag.camera.yaw + dx * .006; this.camera.pitch = clamp(this.drag.camera.pitch + dy * .004,.25,1.15); }
      else if(this.drag.lift)this.offsets.set(this.drag.index,{...this.drag.anchor,y:clamp((this.drag.anchor.y??0)-dy*1.4,0,180)});
      else this.offsets.set(this.drag.index,moveOnFloor(this.drag.anchor,dx,dy,this.camera));
      this.render();
    });
    const end = event=>{ if (!this.drag) return; this.ignoreClick = this.drag.moved; this.drag = null; if(this.svg.hasPointerCapture(event.pointerId))this.svg.releasePointerCapture(event.pointerId); };
    this.svg.addEventListener('pointerup',end); this.svg.addEventListener('pointercancel',end);
    this.svg.addEventListener('click',event=>{
      if (this.ignoreClick) { this.ignoreClick = false; return; }
      const action = event.target.closest('[data-event]'), edge = event.target.closest('[data-edge]'), agent = event.target.closest('[data-agent]');
      if (action) this.callbacks.onActivity?.(Number(action.dataset.event));
      else if (edge) this.callbacks.onEdge?.(Number(edge.dataset.from),Number(edge.dataset.to));
      else if (agent) this.callbacks.onAgent?.(Number(agent.dataset.agent));
    });
    this.svg.addEventListener('keydown',event=>{
      const action = event.target.closest('[data-event]'), agent = event.target.closest('[data-agent]');
      if (['Enter',' '].includes(event.key) && (action || agent)) { event.preventDefault(); if(action)this.callbacks.onActivity?.(Number(action.dataset.event));else this.callbacks.onAgent?.(Number(agent.dataset.agent)); return; }
      if(event.altKey&&agent&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const i=Number(agent.dataset.agent),anchor=this.offsets.get(i)??this.anchors[i];this.offsets.set(i,{...anchor,y:clamp((anchor.y??0)+(event.key==='ArrowUp'?15:-15),0,180)});this.render();this.svg.querySelector(`[data-agent="${i}"]`)?.focus();return;}
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(event.key)) return; event.preventDefault();
      if (event.shiftKey && agent) { const i=Number(agent.dataset.agent),anchor=this.offsets.get(i)??this.anchors[i];this.offsets.set(i,moveOnFloor(anchor,event.key==='ArrowLeft'?-15:event.key==='ArrowRight'?15:0,event.key==='ArrowUp'?-15:event.key==='ArrowDown'?15:0,this.camera));this.render();this.svg.querySelector(`[data-agent="${i}"]`)?.focus(); }
      else if(event.key==='+')this.zoom(1.1);else if(event.key==='-')this.zoom(.9);else this.turn(event.key==='ArrowLeft'?-.15:event.key==='ArrowRight'?.15:0,event.key==='ArrowUp'?.08:event.key==='ArrowDown'?-.08:0);
    });
    this.svg.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.altKey)return;event.preventDefault();this.zoom(event.deltaY<0?1.08:.92);},{passive:false});
  }
  render() {
    if (!this.data) return;
    const { members, network, activity, selected = -1, playing = false, speed = 1 } = this.data;
    const n = members.length, large = n > 20, radius = n > 20 ? 24 : n > 8 ? 44 : 68;
    const elapsed = activity?.elapsedMs ?? Infinity, project = point=>project3D(point,this.camera);
    this.svg.dataset.yaw=String(this.camera.yaw);this.svg.dataset.pitch=String(this.camera.pitch);this.svg.replaceChildren();
    const defs = svg('defs'), arrow = svg('marker',{id:`${this.uid}-arrow`,viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:4,markerHeight:4,orient:'auto-start-reverse'});arrow.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'context-stroke'}));defs.append(arrow);this.svg.append(defs);
    // A geometric hemisphere gives depth; there is no decorative particle layer.
    const guide = svg('g',{class:'dome-guide','aria-hidden':'true'});
    for(const elevation of [0,.3,.6,.9,1.2]) { const points=Array.from({length:73},(_,j)=>{const a=j/72*TAU,r=345*Math.cos(elevation);return project({x:r*Math.cos(a),z:r*Math.sin(a),y:265*Math.sin(elevation)});});guide.append(svg('path',{d:path(points)})); }
    for(let j=0;j<8;j++){const a=j/8*TAU,points=Array.from({length:33},(_,k)=>{const e=k/32*Math.PI/2;return project({x:345*Math.cos(e)*Math.cos(a),z:345*Math.cos(e)*Math.sin(a),y:265*Math.sin(e)});});guide.append(svg('path',{d:path(points)}));}this.svg.append(guide);
    const anchors = this.anchors.map((p,i)=>this.offsets.get(i)??p), current = [], scenes = [];
    members.forEach((member,i)=>{
      const history=this.histories[i], at=history.findLastIndex(a=>a.elapsedMs<=elapsed), progress=at<0?0:at/Math.max(1,history.length-1),anchor=anchors[i];
      current[i]=at<0?{...anchor,y:anchor.y??0}:trajectoryPoint(anchor,progress,radius);
      const group=svg('g',{class:`dome-agent-trail ${i===selected||activity?.agent===member.name?'selected':''}`});group.style.setProperty('--agent-color',colors[i%colors.length]);
      const scaffold=Array.from({length:121},(_,j)=>project(trajectoryPoint(anchor,j/120,radius)));
      group.append(svg('path',{d:path(scaffold),class:'dome-trail scaffold'}));
      if(at>=0){const samples=Math.max(2,Math.ceil(progress*120)+1),points=Array.from({length:samples},(_,j)=>project(trajectoryPoint(anchor,progress*j/(samples-1),radius)));group.append(svg('path',{d:path(points),class:'dome-trail recorded'}));}
      const step=Math.max(1,Math.ceil(history.length/(large?16:100)));
      history.forEach((event,j)=>{if(j%step!==0&&event.id!==activity?.id)return;const p=project(trajectoryPoint(anchor,j/Math.max(1,history.length-1),radius)),dot=svg('g',{'data-event':event.id,tabindex:0,role:'button','aria-label':`Select event ${event.id}: ${member.name} · ${event.title}`,class:`dome-action ${event.id===activity?.id?'current':''} ${event.elapsedMs>elapsed?'future':''}`});dot.append(svg('circle',{cx:p.x,cy:p.y,r:large?5:8,class:'dome-action-hit'}),svg('circle',{cx:p.x,cy:p.y,r:large?1.8:3.3,class:'dome-action-dot'}));const title=svg('title');title.textContent=`#${event.id} · ${event.title}`;dot.append(title);group.append(dot);});
      scenes.push({depth:project({...anchor,y:anchor.y??0}).depth,node:group});
    });
    const edges=(network?.edges??[]).filter(e=>!large||e.from===selected||e.to===selected||members[e.from]?.name===activity?.agent||members[e.to]?.name===activity?.agent);
    const drawn=new Set(),edgeKeys=new Set(edges.map(e=>`${e.from}:${e.to}`));for(const edge of edges){const key=[edge.from,edge.to].sort((a,b)=>a-b).join(':');if(drawn.has(key))continue;drawn.add(key);const a=current[edge.from],b=current[edge.to];if(!a||!b)continue;const points=Array.from({length:33},(_,j)=>project(arcPoint(a,b,j/32)));const line=svg('path',{d:path(points),class:'dome-channel','marker-end':`url(#${this.uid}-arrow)`});if(edgeKeys.has(`${edge.to}:${edge.from}`))line.setAttribute('marker-start',`url(#${this.uid}-arrow)`);this.svg.append(line);if(this.callbacks.onEdge){const hit=svg('path',{d:path(points),class:'dome-edge-hit','data-edge':`${edge.from}:${edge.to}`,'data-from':edge.from,'data-to':edge.to,role:'button',tabindex:0,'aria-label':`Inspect channel ${members[edge.from].name} to ${members[edge.to].name}`});hit.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();this.callbacks.onEdge(edge.from,edge.to);}};this.svg.append(hit);}}
    for(const item of scenes.sort((a,b)=>b.depth-a.depth))this.svg.append(item.node);
    const routes=[];const from=members.findIndex(m=>m.name===activity?.agent);if(from>=0){for(const name of activity.recipients??[]){const to=members.findIndex(m=>m.name===name);if(to>=0)routes.push({from,to,kind:'published'});}for(const name of activity.contextPeers??[]){const source=members.findIndex(m=>m.name===name);if(source>=0)routes.push({from:source,to:from,kind:'observed'});}}
    for(const route of routes){const points=Array.from({length:49},(_,j)=>project(arcPoint(current[route.from],current[route.to],j/48))),d=path(points),arc=svg('path',{d,class:`dome-route ${route.kind}`,'marker-end':`url(#${this.uid}-arrow)`});this.svg.append(arc);const packet=svg('circle',{r:3.5,class:`dome-packet ${route.kind}`});if(playing&&!matchMedia('(prefers-reduced-motion: reduce)').matches)packet.append(svg('animateMotion',{path:d,dur:`${1.1/speed}s`,repeatCount:'indefinite'}));else{const p=points[24];packet.setAttribute('cx',p.x);packet.setAttribute('cy',p.y);}this.svg.append(packet);}
    const nodes=anchors.map((p,i)=>({i,p:project({...p,y:p.y??0})})).sort((a,b)=>b.p.depth-a.p.depth);
    for(const {i,p} of nodes){const group=svg('g',{transform:`translate(${p.x.toFixed(2)},${p.y.toFixed(2)})`,'data-agent':i,role:'button',tabindex:0,'aria-label':`${members[i].name} · drag to move trajectory; Alt + drag to lift`,'aria-pressed':String(i===selected),class:`dome-agent ${i===selected||members[i].name===activity?.agent?'selected':''}`});group.style.setProperty('--agent-color',colors[i%colors.length]);group.append(svg('circle',{r:large?9:15,class:'dome-agent-ring'}));const letter=svg('text',{'text-anchor':'middle',y:4,class:'dome-letter'});letter.textContent=agentCode(i);group.append(letter);if(!large||i===selected){const label=svg('text',{'text-anchor':'middle',y:large?24:32,class:'dome-label'});label.textContent=members[i].name;group.append(label);}this.svg.append(group);}
    const note=svg('text',{x:450,y:457,'text-anchor':'middle',class:'dome-instruction'});note.textContent=this.data.connect?'Connect mode · select a source agent, then a destination':!this.data.activities?.length?'Drag space to rotate · drag agents to arrange · run to record trajectories':'Drag space to rotate · drag agents to arrange · Alt + drag to lift';this.svg.append(note);
  }
}
