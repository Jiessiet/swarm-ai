import { agentCode } from './identity.js';
import { BehaviorPanel } from './behavior.js';
import { SwarmNetwork, presetNetwork } from './network.js';
import { researchBrief } from './research.js';
import { pricingPanel, citizenshipPanel } from './pricing.js';
import { conversationEvent, setupPanel } from './conversation.js';
const $ = id => document.getElementById(id);
const colors = ['#b6dfa0','#a4c4ea','#d8bae8','#e6c18b','#88cfc3','#db9d9d','#bfc98b','#a8abd9'];
let agents = new Map(), total = 0, decisions = 0, usage = 0, count = 0, entries = [], lastId = 0, configured = false, running = false, currentTask = 'hackathon', liveSetup = null, draftNodes = new Map(), selectedModels = null, quoteSnapshot = null, actualCredits = 0, activeRunId = null;
const networkView = new SwarmNetwork(async next => {
  if (!running) { if (quoteSnapshot) { quoteSnapshot.network = next; setupPanel(quoteSnapshot, $('setup'), 'Next run · setup preview'); } return next; }
  const response = await fetch('/network', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: activeRunId, revision: networkView.graph.revision, network: next }) });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).network;
}, async next => {
  if (!running) { syncRoleSetup(next); return next; }
  const response = await fetch('/roles', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({runId:activeRunId,revision:networkView.roleSettings.revision,roles:next.assignments}) });
  if (!response.ok) {
    const message=await response.text();
    const current=await (await fetch('/roles')).json();
    if(current.runId===activeRunId&&current.roles){networkView.receiveRoles(current.roles);syncRoleSetup(current.roles);}
    throw new Error(message);
  }
  const accepted=(await response.json()).roles;syncRoleSetup(accepted);return accepted;
}, name => behavior.selectAgent(name));
const behavior = new BehaviorPanel({
  onActivity(activity, report) { if(report.runId===activeRunId)networkView.focusActivity(activity); },
  onAgent(name, report) { if(report.runId===activeRunId)networkView.focusActivity({agent:name,recipients:[]}); },
  async onArchive(activity, report) {
    await refreshRuns();$('saved-run').value=report.runId;
    const run=savedRuns.find(run=>run.id===report.runId);$('trace-agent').replaceChildren(new Option('Operator · public activity',''));
    for(const agent of run?.agents??[])$('trace-agent').add(new Option(`${agent.name} · private + public`,agent.id));
    $('trace-agent').value=run?.agents.find(a=>a.name===activity.agent)?.id??'';
    await loadTrajectory({keepBehavior:true});
    const target=[...$('trajectory').querySelectorAll('[data-trace-id]')].find(node=>Number(node.dataset.traceId)===activity.id);
    if(target){target.classList.add('activity-linked');target.scrollIntoView({behavior:'smooth',block:'center'});}else{$('saved').scrollIntoView({behavior:'smooth',block:'start'});message('The selected action is shown in the report; it is not included in this archive scope.');}
  },
  async onBrief(report) {
    const response=await fetch(`/runs/${encodeURIComponent(report.runId)}`);if(!response.ok)return;const trace=await response.json(),result=trace.events.find(e=>e.type==='hackathon.brief');
    if(result){$('research').hidden=false;researchBrief(result.data,$('research-body'),report.runId);$('research').scrollIntoView({behavior:'smooth',block:'start'});}
  },
});
function syncRoleSetup(settings) {
  for (const setup of new Set([quoteSnapshot,liveSetup])) {
    if (!setup || setup.task !== 'hackathon') continue;
    setup.roleSettings=structuredClone(settings);
    setup.assignments.forEach((a,i)=>{const role=settings.assignments[i];a.role=a.label=role.title;a.instruction=role.instructions;});
  }
  for (const [name,agent] of agents) {
    const index=networkView.assignments.findIndex(a=>a.name===name);
    if(index>=0&&settings.assignments[index]){const role=settings.assignments[index];const badge=agent.node.querySelector('.agent-role');if(badge)badge.textContent=role.title;}
  }
  const current=running?liveSetup:quoteSnapshot;
  if(current)setupPanel(current,$('setup'),running?'Current roles · edits apply next decision':'Next run · setup preview');
  queueMicrotask(()=>updatePresetControls());
}

function previewTeam(setup) {
  if (running) return;
  $('agents').replaceChildren(); agents = new Map();
  setup.assignments.forEach((assignment, i) => {
    const node = document.createElement('div'); node.className = 'agent'; node.style.setProperty('--color', colors[i % colors.length]);
    node.innerHTML = '<div class="avatar"></div><h3></h3><div class="state">Ready</div><div class="balance"><b>0</b><small>contributions</small></div>';
    node.querySelector('.avatar').textContent = agentCode(i); node.querySelector('h3').textContent = assignment.name;
    const role = document.createElement('span'); role.className = 'agent-role'; role.textContent = assignment.label;
    node.querySelector('h3').after(role); node.onclick = () => networkView.choose(i);
    $('agents').append(node); agents.set(assignment.name, { node, balance: 0 });
  });
}
function busy(value) { running = value;queueMicrotask(()=>updatePresetControls()); networkView.setRunning(value, activeRunId); $('objective').disabled = value; $('start').disabled = value; $('stop').disabled = !value; for (const input of document.querySelectorAll('#controls input,#controls select,#pricing select,#pricing button')) input.disabled = value; if (!value && $('task').value === 'shared-fund') for (const key of ['count','tokens','maxTake']) $(key).disabled = true; }
function message(text) { $('notice').textContent = text; }
function agentState(name, state) { networkView.state(name, state); const a = agents.get(name); if (a) { a.node.classList.toggle('active', state === 'Working'); a.node.querySelector('.state').textContent = state; } }
function addEvent(e) {
  $('event-count').textContent = `${++count} events`;
  // Update a private draft in place rather than adding every partial JSON chunk.
  const item = e.data?.item;
  const key = item ? `${e.agent}:${item.id ?? item.type}` : null;
  const node = conversationEvent(e, liveSetup);node.dataset.traceId=String(e.traceId??e.id);node.dataset.run=e.run??'';
  if (key && ['sdk.item.started', 'sdk.item.updated', 'sdk.item.completed'].includes(e.type)) {
    const existing = draftNodes.get(key);
    if (existing?.isConnected) {
      existing.replaceWith(node); const index = entries.indexOf(existing); if (index >= 0) entries[index] = node;
    } else { $('feed').append(node); entries.push(node); }
    if (e.type === 'sdk.item.completed') draftNodes.delete(key); else draftNodes.set(key, node);
  } else { $('feed').append(node); entries.push(node); }
  filterNode(node);
  $('feed').querySelector('.empty')?.remove();
  if (entries.length > 400) entries.shift().remove();
  if ($('follow').checked) $('feed').scrollTop = $('feed').scrollHeight;
}
function applyLiveSetup(setup) {
  networkView.configure(setup, { runId: activeRunId, force: true });
  liveSetup = setup; selectedModels = setup.assignments.map(a => a.model); quoteSnapshot = setup; pricingPanel(setup, $('pricing'), changeModel, changeAllModels);
  for (const select of $('pricing').querySelectorAll('select,button')) select.disabled = running;
  setupPanel(setup, $('setup'), 'Recorded setup for this run');
  for (const [name, agent] of agents) {
    agent.node.querySelector('.agent-role')?.remove(); agent.node.querySelector('.agent-model')?.remove();
    const assignment = setup.assignments.find(a => a.name === name);
    if (assignment) {
      const badge = document.createElement('span'); badge.className = 'agent-role' + (assignment.role === 'planted' ? ' planted-role' : ''); badge.textContent = assignment.label;
      agent.node.querySelector('h3').after(badge);
      if (assignment.model) { const model = document.createElement('span'); model.className = 'agent-model'; model.textContent = assignment.model; badge.after(model); }
      agent.node.classList.toggle('non-contributor', assignment.role === 'planted');
    }
  }
}

function render(e) {
  if (e.id <= lastId) return; lastId = e.id;
  const d = e.data;
  if (e.type === 'run.started') {
    activeRunId = e.run; networkView.states.clear(); networkView.hasRun = true; networkView.packets = [];
    previewVersion++; liveSetup = null; draftNodes.clear(); actualCredits = 0; $('usage-cost').textContent = ''; $('cost-total').textContent = '0 credits'; $('citizenship').hidden = true; $('research').hidden = false; $('research-body').replaceChildren(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Research in progress. The final brief will appear after synthesis.' }));
    currentTask = d.task ?? 'hackathon'; setTaskView(currentTask);
    $('fund-metrics').hidden = true;
    if (d.objective) $('objective').value = d.objective;
    agents = new Map(); entries = []; decisions = usage = count = 0; total = d.tokens;
    $('agents').replaceChildren(); $('feed').replaceChildren(); $('ledger').replaceChildren(); $('filter').replaceChildren(new Option('All agents', 'all'));
    $('usage').textContent = $('decisions').textContent = '0'; $('pool').textContent = $('hub').textContent = currentTask === 'hackathon' ? 'Research' : total; $('bar').style.width = '100%'; $('status').textContent = 'Running'; busy(true);
    $('usage-label').textContent = d.mode === 'demo' ? '(simulated)' : '';
    message(d.mode === 'demo' ? 'SIMULATED RUN · Demonstration events and token usage. No API calls.' : 'LIVE RUN · Codex SDK events with Adaption model inference.');
    d.agents.forEach((name, i) => {
      const node = document.createElement('div'); node.className = 'agent'; node.style.setProperty('--color', colors[i % colors.length]);
      node.innerHTML = '<div class="avatar"></div><h3></h3><div class="state">Waiting</div><div class="balance"><b>0</b><small>collected</small></div>';
      node.querySelector('.avatar').textContent = agentCode(i); node.querySelector('h3').textContent = name; node.querySelector('.balance small').textContent = currentTask === 'hackathon' ? 'contributions' : currentTask === 'shared-fund' ? 'total payoff' : 'collected';
      node.onclick = () => networkView.choose(i); $('agents').append(node); agents.set(name, { node, balance: 0 }); $('filter').add(new Option(name, name));
    });
  }
  if (e.type === 'operator.setup') applyLiveSetup(d);
  if (e.type === 'hackathon.network') networkView.receive(d.network);
  if (e.type === 'hackathon.roles') { networkView.receiveRoles(d.roles); syncRoleSetup(d.roles); }
  if (e.type === 'agent.observation') { agentState(e.agent, 'Working'); $('round').textContent = currentTask === 'hackathon' ? `${d.phase} · ${e.agent}` : d.phase === 'peer-review' ? 'Final peer review · citizenship' : `Round ${d.round} / ${d.totalRounds}`; }
  if (e.type === 'hackathon.agent.error') { agentState(e.agent, d.retrying ? 'Error · retrying' : 'Error · turn skipped'); message(`${e.agent}: ${d.message}. ${d.retrying ? 'Retrying with error feedback.' : 'Continuing with the remaining agents.'}`); }
  if (e.type === 'hackathon.agent.timeout') { agentState(e.agent, 'Timed out · turn skipped'); message(`${d.message}. Continuing with the remaining agents.`); }
  if (e.type === 'hackathon.phase') { $('round').textContent = d.phase === 'synthesis' ? 'Final synthesis' : `${d.phase} · ${d.round} / ${d.totalRounds}`; $('pool').textContent = $('hub').textContent = d.phase; $('bar').style.width = `${Math.min(100, d.round / (d.totalRounds + 1) * 100)}%`; }
  if (e.type === 'hackathon.contribution') {
    networkView.activity(e.agent, d.recipients);
    const a = agents.get(e.agent); if (a) { a.balance++; a.node.querySelector('.balance b').textContent = a.balance; agentState(e.agent, 'Sent to neighbors'); }
    $('decisions').textContent = ++decisions;
    const row = document.createElement('tr'); for (const value of [d.round, e.agent, d.phase, d.sourceIds.join(', ') || '—', d.message]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); } $('ledger').append(row);
  }
  if (e.type === 'hackathon.brief') { $('research').hidden = false; researchBrief(d, $('research-body'), e.run); }
  if (e.type === 'agent.submission') agentState(e.agent, 'Submitted · awaiting payout');
  if (e.type === 'fund.round') {
    $('pool').textContent = $('hub').textContent = '$' + d.totalContributions;
    $('bar').style.width = `${d.totalContributions / 25 * 100}%`;
    for (const outcome of d.outcomes) {
      const a = agents.get(outcome.agent); if (a) { a.node.querySelector('.balance b').textContent = '$' + outcome.cumulativePayoff; agentState(outcome.agent, 'Round revealed'); }
      $('decisions').textContent = ++decisions;
      const row = document.createElement('tr'); for (const value of [d.round, outcome.agent, '$' + outcome.contribution, '$' + outcome.payoff, outcome.message]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); } $('ledger').append(row);
    }
  }
  if (e.type === 'agent.decision') {
    const a = agents.get(e.agent); if (a) { a.balance += d.take; a.node.querySelector('.balance b').textContent = a.balance; agentState(e.agent, 'Waiting'); }
    $('pool').textContent = $('hub').textContent = d.poolRemaining; $('bar').style.width = `${d.poolRemaining / total * 100}%`; $('decisions').textContent = ++decisions;
    const row = document.createElement('tr'); for (const value of [d.round, e.agent, `+${d.take}`, d.poolRemaining, d.reason]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); } $('ledger').append(row);
  }
  if (e.type === 'fund.citizenship') { $('citizenship').hidden = false; citizenshipPanel(d, $('citizenship-body')); }
  if (e.type === 'agent.usage') { actualCredits += d.credits; $('cost-total').textContent = `${actualCredits.toFixed(4)} credits`; $('usage-cost').textContent = `Reported usage so far: ${actualCredits.toFixed(6)} credits (rate-based calculation, not an invoice).`; }
  if (e.type === 'operator.billing') $('usage-cost').textContent = `Run usage cost: ${d.credits.toFixed(6)} credits${d.simulated ? ' · demo, no API charges' : ' · from reported usage, not an invoice'}`;
  if (e.type === 'sdk.turn.completed' && d.usage) { usage += d.usage.input_tokens + d.usage.output_tokens; $('usage').textContent = usage.toLocaleString(); }
  if (e.type === 'run.completed' && d.metrics) showMetrics(d.metrics);
  if (['run.completed','run.failed','run.stopped'].includes(e.type)) { busy(false); $('status').textContent = e.type === 'run.completed' && d.completion === 'partial' ? 'Partial · no final brief' : e.type === 'run.completed' && (d.timeouts?.length || d.errors?.length) ? 'Completed with recovery events' : e.type.split('.')[1]; agents.forEach((_, name) => agentState(name, 'Idle')); if (d.message) message(d.message); else if (e.type === 'run.completed' && d.completion === 'partial') message('All synthesis attempts failed or timed out. Partial research and sources have been saved.'); else if (e.type === 'run.completed' && (d.timeouts?.length || d.errors?.length)) message(`Research brief saved. ${d.timeouts?.length ?? 0} timeout(s), ${d.errors?.length ?? 0} failed attempt(s) recorded.`); }
  addEvent(e);
  if((e.type==='run.started'&&d.task==='hackathon')||e.type!=='run.started')behavior.event(e);
  if (['run.completed', 'run.failed', 'run.stopped'].includes(e.type)) refreshRuns();
}
const stream = new EventSource('/events');
stream.onopen = () => { $('connection').textContent = '● Stream connected'; };
stream.onerror = () => { $('connection').textContent = '○ Reconnecting…'; };
stream.onmessage = e => render(JSON.parse(e.data));
stream.addEventListener('status', async e => {
  const s=JSON.parse(e.data);configured=s.configured;
  // Large runs can outgrow the SSE replay window. Restore their authoritative
  // team snapshot without fabricating a new run-start event or changing roles.
  if(s.run&&s.run.id!==activeRunId){
    const snapshot=s.run;activeRunId=snapshot.id;currentTask=snapshot.config.task;setTaskView(currentTask);
    for(const key of ['count','rounds','tokens','maxTake'])if(snapshot.config[key]!==undefined)$(key).value=snapshot.config[key];
    $('task').value=currentTask;$('mode').value=snapshot.config.mode;
    if(snapshot.config.objective)$('objective').value=snapshot.config.objective;
    running=false;previewVersion++;previewTeam(snapshot.setup);applyLiveSetup(snapshot.setup);
    if(snapshot.network)networkView.receive(snapshot.network);if(snapshot.roles){networkView.receiveRoles(snapshot.roles);syncRoleSetup(snapshot.roles);}
    $('filter').replaceChildren(new Option('All agents','all'));snapshot.agents.forEach(name=>$('filter').add(new Option(name,name)));
    busy(s.active);
    if(currentTask==='hackathon'){
      await behavior.beginRun(snapshot.id);
      const report=behavior.report;if(report?.runId===snapshot.id){
        $('decisions').textContent=String(report.totals.contributions);$('usage').textContent=report.members.reduce((n,a)=>n+(a.tokens??0),0).toLocaleString();
        $('pool').textContent=report.phases.at(-1)?.phase??'Research';$('status').textContent=s.active?'Running':report.status;
        $('cost-total').textContent=report.members.reduce((n,a)=>n+(a.credits??0),0).toFixed(4)+' credits';
        for(const member of report.members){const node=agents.get(member.name)?.node;if(node)node.querySelector('.balance b').textContent=member.contributions;}
      }
    }
  }
  busy(s.active);
});
function filterNode(node) {
  const selected = $('filter').value;
  const group = JSON.parse(node.dataset.agents || '[]');
  node.hidden = (selected !== 'all' && node.dataset.agent !== selected && !group.includes(selected)) || ($('live-scope').value !== 'all' && node.dataset.visibility !== $('live-scope').value);
  for (const bubble of node.querySelectorAll('[data-speaker]')) bubble.hidden = selected !== 'all' && bubble.dataset.speaker !== selected;
}
$('filter').onchange = $('live-scope').onchange = () => entries.forEach(filterNode);
$('controls').onsubmit = async e => {
  e.preventDefault(); if (running) return;
  if ($('mode').value === 'adaption' && !configured) { message('Set ADAPTION_API_KEY in the server environment, then restart npm run dashboard.'); return; }
  await previewSetup();
  if (!quoteSnapshot) { message('Wait for a valid model assignment and price estimate before starting.'); return; }
  busy(true);
  try {
    const body = { mode: $('mode').value, task: $('task').value, condition: $('condition').value, models: selectedModels, network: $('task').value === 'hackathon' ? networkView.graph : undefined, roles: $('task').value === 'hackathon' ? networkView.roleSettings.assignments : undefined, objective: $('task').value === 'hackathon' ? $('objective').value : undefined }; for (const key of ['count','rounds','tokens','maxTake']) body[key] = Number($(key).value);
    const response = await fetch('/run', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(await response.text());
  } catch (error) { message(error.message); busy(false); }
};
$('stop').onclick = async () => { try { const r = await fetch('/stop', { method:'POST' }); if (!r.ok) throw new Error('Stop failed'); } catch (e) { message(e.message); } };

function setTaskView(task) {
  const fund = task === 'shared-fund', hackathon = task === 'hackathon';
  $('behavior').hidden=!hackathon; $('network-panel').hidden = !hackathon; $('objective').parentElement.hidden = !hackathon;
  $('count').disabled = fund; $('count').max=hackathon?100:fund?5:8;
  document.querySelector('.experiment-setup .section-head span').textContent = hackathon ? 'Research roles · shared goal' : 'Operator view · roles are private to each agent';
  $('rounds').min = hackathon ? 3 : 1; $('rounds').max = hackathon ? 6 : 1000;
  $('condition-label').hidden = !fund;
  $('tokens').parentElement.hidden = $('maxTake').parentElement.hidden = fund || hackathon;
  document.querySelector('.pool-hub span').textContent = hackathon ? 'HACKATHON PHASE' : fund ? 'ROUND CONTRIBUTIONS' : 'SHARED ENVIRONMENT';
  document.querySelectorAll('.pool-hub span')[1].textContent = hackathon ? 'research → propose → critique → synthesize' : fund ? 'doubled and shared equally' : 'available resources';
  document.querySelector('.metrics div:nth-child(2) > span').textContent = hackathon ? 'CURRENT PHASE' : fund ? 'ROUND CONTRIBUTIONS' : 'POOL REMAINING';
  document.querySelector('.metrics div:nth-child(3) > span').textContent = hackathon ? 'CONTRIBUTIONS' : 'DECISIONS';
  document.querySelector('.allocations h2').textContent = hackathon ? 'Research discussion ledger' : 'Decision ledger';
  const headings = document.querySelectorAll('.allocations th'); headings[2].textContent = hackathon ? 'PHASE' : fund ? 'CONTRIBUTION' : 'ALLOCATION'; headings[3].textContent = hackathon ? 'SOURCES' : fund ? 'ROUND PAYOFF' : 'REMAINING'; headings[4].textContent = hackathon ? 'CONTRIBUTION' : fund ? 'PUBLIC MESSAGE' : 'REASON';
  document.querySelector('.legend > span:last-child').textContent = hackathon ? 'Agents search and read public sources, share proposals, challenge feasibility and synthesize an eight-hour research plan.' : fund ? 'Agents may message the group before contributing privately. Each learns only their own payoff after all five submit.' : 'Agents communicate through observations of shared state and previous decisions.';
}
async function loadTask() {
  selectedModels = null; quoteSnapshot = null; $('start').disabled = true;
  try {
    const task = await (await fetch('/task?id=' + $('task').value)).json();
    if (running) return;
    for (const key of ['count','rounds','tokens','maxTake']) $(key).value = task.defaults[key];
    setTaskView(task.id); busy(false); currentTask = task.id; $('hub').textContent = task.id === 'hackathon' ? 'Research' : task.id === 'shared-fund' ? '$0' : task.defaults.tokens;
    await previewSetup();
  } catch { message('Could not load task defaults.'); }
}
function showMetrics(metrics) {
  $('fund-metrics').hidden = false; $('metrics-body').replaceChildren();
  for (const entry of metrics.standardAgents) {
    const line = document.createElement('p'); line.textContent = `${entry.agent}: ${entry.contributions.map(c => '$' + c).join(' → ')}. First $5 → $0 switch: ${entry.firstSwitchToZero ? 'round ' + entry.firstSwitchToZero : 'none'}. Returns to $5: ${entry.returnToFiveRounds.join(', ') || 'none'}.${entry.initialNonContribution ? ' Started at $0.' : ''}`; $('metrics-body').append(line);
  }
}
let previewVersion = 0;
function changeModel(index, model) {
  if (running) return;
  selectedModels[index] = model;
  previewSetup();
}
function changeAllModels(model) {
  if(running)return;selectedModels=Array(Number($('count').value)).fill(model);previewSetup();
}
async function previewSetup() {
  const version = ++previewVersion;
  if (running) return;
  quoteSnapshot = null; $('start').disabled = true;
  try {
    const query = new URLSearchParams({ task: $('task').value, condition: $('condition').value, count: $('count').value, rounds: $('rounds').value, mode: $('mode').value });
    const nextCount=Number($('count').value);
    if(selectedModels&&Number.isInteger(nextCount)&&nextCount>=2&&nextCount<=100){selectedModels=Array.from({length:nextCount},(_,i)=>selectedModels[i]??selectedModels[0]);query.set('models',selectedModels.join(','));}
    const response = await fetch('/setup?' + query);
    if (!response.ok) throw new Error(await response.text());
    const setup = await response.json();
    if (running || version !== previewVersion) return;
    setup.objective = $('objective').value;
    networkView.configure(setup); setup.network = structuredClone(networkView.graph); setup.roleSettings=structuredClone(networkView.roleSettings); setup.assignments=structuredClone(networkView.assignments);
    previewTeam(setup);
    quoteSnapshot = setup; selectedModels = setup.assignments.map(a => a.model);updatePresetControls();
    setupPanel(setup, $('setup'), 'Next run · setup preview'); pricingPanel(setup, $('pricing'), changeModel, changeAllModels); $('start').disabled = false;
  } catch { if (version === previewVersion) { quoteSnapshot = null; $('start').disabled = true; message('Could not load setup and pricing. Check the selected models and settings.'); } }
}
for (const key of ['condition', 'count', 'rounds', 'mode']) $(key).addEventListener('input', previewSetup);
$('objective').onchange = previewSetup;
$('task').onchange = loadTask;
loadTask();

let savedRuns = [];
async function refreshRuns() {
  try {
    savedRuns = await (await fetch('/runs')).json();
    const selected = $('saved-run').value;
    $('saved-run').replaceChildren(new Option('Select a saved run', ''));
    for (const run of savedRuns) $('saved-run').add(new Option(`${new Date(run.created).toLocaleString()} · ${run.config.task} · ${run.config.condition || run.config.mode} · ${run.status} · ${run.id.slice(0,8)}`, run.id));
    if (savedRuns.some(run => run.id === selected)) $('saved-run').value = selected;
  } catch (error) { message('Could not load saved runs: ' + error.message); }
}
async function loadTrajectory({keepBehavior=false}={}) {
  const id = $('saved-run').value; if (!id) return;
  try {
    const response = await fetch(`/runs/${encodeURIComponent(id)}${$('trace-agent').value ? '?agent=' + encodeURIComponent($('trace-agent').value) : ''}`);
    if (!response.ok) throw new Error(await response.text());
    const { manifest, events } = await response.json();
    if(!keepBehavior){$('behavior').hidden=manifest.config.task!=='hackathon';if(manifest.config.task==='hackathon')behavior.load(manifest.id,{archive:true});}
    $('trajectory').replaceChildren();
    let setup = manifest.setup;
    if (!setup && manifest.config.task) {
      const query = new URLSearchParams({ task: manifest.config.task, condition: manifest.config.condition ?? 'planted', count: String(manifest.agents.length), rounds: String(manifest.config.rounds ?? 3) });
      const response = await fetch('/setup?' + query);
      if (response.ok) { setup = await response.json(); setup.assignments.forEach((a, i) => { a.name = manifest.agents[i]?.name ?? a.name; }); }
    }
    if (setup) { const panel = document.createElement('div'); panel.className = 'saved-setup'; setupPanel(setup, panel, manifest.setup ? 'Saved run · recorded role assignments' : 'Older run · assignments inferred from recorded condition'); $('trajectory').append(panel); }
    const research = events.find(e => e.type === 'hackathon.brief');
    $('research').hidden = !research; if (research) researchBrief(research.data, $('research-body'), manifest.id);
    const citizenship = events.find(e => e.type === 'fund.citizenship');
    $('citizenship').hidden = !citizenship; if (citizenship) citizenshipPanel(citizenship.data, $('citizenship-body'));
    if (setup?.pricing) { const pricing = document.createElement('div'); pricing.className = 'saved-pricing'; pricingPanel(setup, pricing); $('trajectory').append(pricing); }
    const final = events.find(e => e.type === 'run.completed');
    $('fund-metrics').hidden = true; if (final?.data?.metrics) showMetrics(final.data.metrics);
    for (const event of events) {
      if (['sdk.item.started','sdk.item.updated'].includes(event.type)) continue;
      const article = conversationEvent(event, setup); article.classList.add('saved-event');article.dataset.traceId=String(event.id);
      $('trajectory').append(article);
    }
  } catch (error) { message('Could not load trajectory: ' + error.message); }
}
$('refresh-runs').onclick = refreshRuns;
$('saved-run').onchange = () => {
  const run = savedRuns.find(run => run.id === $('saved-run').value);
  $('trace-agent').replaceChildren(new Option('Operator · public activity', ''));
  for (const agent of run?.agents ?? []) $('trace-agent').add(new Option(`${agent.name} · private + public`, agent.id));
  loadTrajectory();
};
$('trace-agent').onchange = loadTrajectory;
refreshRuns();

let rolePresetList=[],presetBusy=false;
function updatePresetControls(){
  const preset=rolePresetList.find(p=>p.id===$('role-preset-select').value),count=networkView.roleSettings?.assignments.length??0;
  $('load-role-preset').disabled=presetBusy||!preset||(running&&preset.count!==count);
  $('load-role-preset').textContent=running?'Apply roles live':'Load roles';
  $('save-role-preset').disabled=presetBusy||!count;
  if(preset&&running&&preset.count!==count)$('role-preset-status').textContent=`This preset has ${preset.count} roles; the active run has ${count} agents. Load it between runs, or select a matching preset.`;
}
async function refreshRolePresets(selectedId=$('role-preset-select').value){
  const response=await fetch('/role-presets');if(!response.ok)throw new Error(await response.text());
  rolePresetList=await response.json();$('role-preset-select').replaceChildren(new Option('Choose a saved preset',''));
  for(const preset of rolePresetList)$('role-preset-select').add(new Option(`${preset.name} · ${preset.count} agents`,preset.id));
  if(rolePresetList.some(p=>p.id===selectedId))$('role-preset-select').value=selectedId;updatePresetControls();
}
$('role-preset-select').onchange=()=>{const preset=rolePresetList.find(p=>p.id===$('role-preset-select').value);if(preset)$('role-preset-name').value=preset.name;$('role-preset-status').textContent=preset?`${preset.count} saved roles · loading preserves model choices.`:'Choose a saved role team.';updatePresetControls();};
$('role-preset-save').onsubmit=async event=>{
  event.preventDefault();if(presetBusy||!networkView.roleSettings)return;presetBusy=true;updatePresetControls();
  try{
    const response=await fetch('/role-presets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('role-preset-name').value,roles:networkView.roleSettings.assignments})});
    if(!response.ok)throw new Error(await response.text());const preset=await response.json();
    await refreshRolePresets(preset.id);$('role-preset-status').textContent=`Saved “${preset.name}” · ${preset.count} roles. Reuse this preset in future runs, even after restarting the dashboard.`;
  }catch(error){$('role-preset-status').textContent=error.message;}
  finally{presetBusy=false;updatePresetControls();}
};
$('load-role-preset').onclick=async()=>{
  if(presetBusy||!$('role-preset-select').value)return;presetBusy=true;updatePresetControls();
  try{
    const response=await fetch('/role-presets/'+encodeURIComponent($('role-preset-select').value));if(!response.ok)throw new Error(await response.text());const preset=await response.json();
    if(running&&preset.count!==networkView.roleSettings.assignments.length)throw new Error('Load a preset with the same number of agents during a run.');
    if(!running){$('task').value='hackathon';setTaskView('hackathon');$('count').value=preset.count;await previewSetup();if(!quoteSnapshot)throw new Error('Could not prepare this role team.');}
    const next={revision:networkView.roleSettings.revision,assignments:preset.roles};const accepted=await networkView.onRoleChange(next);
    networkView.roleDrafts.clear();networkView.roleNotices.clear();networkView.receiveRoles(accepted??next);syncRoleSetup(accepted??next);
    $('role-preset-status').textContent=`Loaded “${preset.name}” · ${preset.count} roles${running?' · effective on subsequent decisions.':'. Models remain as selected.'}`;
  }catch(error){$('role-preset-status').textContent=error.message;}
  finally{presetBusy=false;updatePresetControls();}
};
refreshRolePresets().catch(error=>{$('role-preset-status').textContent='Could not load saved roles: '+error.message;});
