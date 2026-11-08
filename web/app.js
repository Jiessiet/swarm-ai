import { conversationEvent, setupPanel } from './conversation.js';
const $ = id => document.getElementById(id);
const colors = ['#b6dfa0','#a4c4ea','#d8bae8','#e6c18b','#88cfc3','#db9d9d','#bfc98b','#a8abd9'];
let agents = new Map(), total = 0, decisions = 0, usage = 0, count = 0, entries = [], lastId = 0, configured = false, running = false, currentTask = 'shared-resource', liveSetup = null, draftNodes = new Map();
function busy(value) { running = value; $('start').disabled = value; $('stop').disabled = !value; for (const input of $('controls').querySelectorAll('input,select')) input.disabled = value; if (!value && $('task').value === 'shared-fund') for (const key of ['count','tokens','maxTake']) $(key).disabled = true; }
function message(text) { $('notice').textContent = text; }
function agentState(name, state) { const a = agents.get(name); if (a) { a.node.classList.toggle('active', state === 'Working'); a.node.querySelector('.state').textContent = state; } }
function addEvent(e) {
  $('event-count').textContent = `${++count} events`;
  // Update a private draft in place rather than adding every partial JSON chunk.
  const item = e.data?.item;
  const key = item ? `${e.agent}:${item.id ?? item.type}` : null;
  const node = conversationEvent(e, liveSetup);
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
  liveSetup = setup; setupPanel(setup, $('setup'), 'Recorded setup for this run');
  for (const [name, agent] of agents) {
    agent.node.querySelector('.agent-role')?.remove();
    const assignment = setup.assignments.find(a => a.name === name);
    if (assignment) {
      const badge = document.createElement('span'); badge.className = 'agent-role' + (assignment.role === 'planted' ? ' planted-role' : ''); badge.textContent = assignment.label;
      agent.node.querySelector('h3').after(badge);
      agent.node.classList.toggle('non-contributor', assignment.role === 'planted');
    }
  }
}

function render(e) {
  if (e.id <= lastId) return; lastId = e.id;
  const d = e.data;
  if (e.type === 'run.started') {
    liveSetup = null; draftNodes.clear();
    currentTask = d.task ?? 'shared-resource'; setTaskView(currentTask);
    $('fund-metrics').hidden = true;
    agents = new Map(); entries = []; decisions = usage = count = 0; total = d.tokens;
    $('agents').replaceChildren(); $('feed').replaceChildren(); $('ledger').replaceChildren(); $('filter').replaceChildren(new Option('All agents', 'all'));
    $('usage').textContent = $('decisions').textContent = '0'; $('pool').textContent = $('hub').textContent = total; $('bar').style.width = '100%'; $('status').textContent = 'Running'; busy(true);
    $('usage-label').textContent = d.mode === 'demo' ? '(simulated)' : '';
    message(d.mode === 'demo' ? 'SIMULATED RUN · Demonstration events and token usage. No API calls.' : 'LIVE RUN · Codex SDK events with Adaption model inference.');
    d.agents.forEach((name, i) => {
      const node = document.createElement('div'); node.className = 'agent'; node.style.setProperty('--color', colors[i % colors.length]);
      node.innerHTML = '<div class="avatar"></div><h3></h3><div class="state">Waiting</div><div class="balance"><b>0</b><small>collected</small></div>';
      node.querySelector('.avatar').textContent = String(i + 1).padStart(2,'0'); node.querySelector('h3').textContent = name; node.querySelector('.balance small').textContent = currentTask === 'shared-fund' ? 'total payoff' : 'collected';
      $('agents').append(node); agents.set(name, { node, balance: 0 }); $('filter').add(new Option(name, name));
    });
  }
  if (e.type === 'operator.setup') applyLiveSetup(d);
  if (e.type === 'agent.observation') { agentState(e.agent, 'Working'); $('round').textContent = `Round ${d.round} / ${d.totalRounds}`; }
  if (e.type === 'agent.submission') agentState(e.agent, 'Submitted · awaiting reveal');
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
  if (e.type === 'sdk.turn.completed' && d.usage) { usage += d.usage.input_tokens + d.usage.output_tokens; $('usage').textContent = usage.toLocaleString(); }
  if (e.type === 'run.completed' && d.metrics) showMetrics(d.metrics);
  if (['run.completed','run.failed','run.stopped'].includes(e.type)) { busy(false); $('status').textContent = e.type.split('.')[1]; agents.forEach((_, name) => agentState(name, 'Idle')); if (d.message) message(d.message); }
  addEvent(e);
  if (['run.completed', 'run.failed', 'run.stopped'].includes(e.type)) refreshRuns();
}
const stream = new EventSource('/events');
stream.onopen = () => { $('connection').textContent = '● Stream connected'; };
stream.onerror = () => { $('connection').textContent = '○ Reconnecting…'; };
stream.onmessage = e => render(JSON.parse(e.data));
stream.addEventListener('status', e => { const s = JSON.parse(e.data); configured = s.configured; busy(s.active); });
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
  busy(true);
  try {
    const body = { mode: $('mode').value, task: $('task').value, condition: $('condition').value }; for (const key of ['count','rounds','tokens','maxTake']) body[key] = Number($(key).value);
    const response = await fetch('/run', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(await response.text());
  } catch (error) { message(error.message); busy(false); }
};
$('stop').onclick = async () => { try { const r = await fetch('/stop', { method:'POST' }); if (!r.ok) throw new Error('Stop failed'); } catch (e) { message(e.message); } };

function setTaskView(task) {
  const fund = task === 'shared-fund';
  $('condition-label').hidden = !fund;
  $('tokens').parentElement.hidden = $('maxTake').parentElement.hidden = fund;
  document.querySelector('.pool-hub span').textContent = fund ? 'ROUND CONTRIBUTIONS' : 'SHARED ENVIRONMENT';
  document.querySelectorAll('.pool-hub span')[1].textContent = fund ? 'doubled and shared equally' : 'available resources';
  document.querySelector('.metrics div:nth-child(2) > span').textContent = fund ? 'ROUND CONTRIBUTIONS' : 'POOL REMAINING';
  const headings = document.querySelectorAll('.allocations th'); headings[2].textContent = fund ? 'CONTRIBUTION' : 'ALLOCATION'; headings[3].textContent = fund ? 'ROUND PAYOFF' : 'REMAINING'; headings[4].textContent = fund ? 'PUBLIC MESSAGE' : 'REASON';
  document.querySelector('.legend span').textContent = fund ? 'All five submit privately. Contributions and messages are revealed together after every submission.' : 'Agents communicate through observations of shared state and previous decisions.';
}
async function loadTask() {
  try {
    const task = await (await fetch('/task?id=' + $('task').value)).json();
    if (running) return;
    for (const key of ['count','rounds','tokens','maxTake']) $(key).value = task.defaults[key];
    setTaskView(task.id); busy(false); $('hub').textContent = task.id === 'shared-fund' ? '$0' : task.defaults.tokens;
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
async function previewSetup() {
  const version = ++previewVersion;
  if (running) return;
  try {
    const query = new URLSearchParams({ task: $('task').value, condition: $('condition').value, count: $('count').value, rounds: $('rounds').value });
    const response = await fetch('/setup?' + query);
    if (!response.ok) return;
    const setup = await response.json();
    if (running || version !== previewVersion) return;
    setupPanel(setup, $('setup'), 'Next run · setup preview');
  } catch { message('Could not load setup preview.'); }
}
for (const key of ['condition', 'count', 'rounds']) $(key).addEventListener('input', previewSetup);
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
async function loadTrajectory() {
  const id = $('saved-run').value; if (!id) return;
  try {
    const response = await fetch(`/runs/${encodeURIComponent(id)}${$('trace-agent').value ? '?agent=' + encodeURIComponent($('trace-agent').value) : ''}`);
    if (!response.ok) throw new Error(await response.text());
    const { manifest, events } = await response.json();
    $('trajectory').replaceChildren();
    let setup = manifest.setup;
    if (!setup && manifest.config.task) {
      const query = new URLSearchParams({ task: manifest.config.task, condition: manifest.config.condition ?? 'planted', count: String(manifest.agents.length), rounds: String(manifest.config.rounds ?? 3) });
      const response = await fetch('/setup?' + query);
      if (response.ok) { setup = await response.json(); setup.assignments.forEach((a, i) => { a.name = manifest.agents[i]?.name ?? a.name; }); }
    }
    if (setup) { const panel = document.createElement('div'); panel.className = 'saved-setup'; setupPanel(setup, panel, manifest.setup ? 'Saved run · recorded role assignments' : 'Older run · assignments inferred from recorded condition'); $('trajectory').append(panel); }
    const final = events.find(e => e.type === 'run.completed');
    $('fund-metrics').hidden = true; if (final?.data?.metrics) showMetrics(final.data.metrics);
    for (const event of events) {
      if (['sdk.item.started','sdk.item.updated'].includes(event.type)) continue;
      const article = conversationEvent(event, setup); article.classList.add('saved-event');
      $('trajectory').append(article);
    }
  } catch (error) { message('Could not load trajectory: ' + error.message); }
}
$('refresh-runs').onclick = refreshRuns;
$('saved-run').onchange = () => {
  const run = savedRuns.find(run => run.id === $('saved-run').value);
  $('trace-agent').replaceChildren(new Option('Public shared trace', ''));
  for (const agent of run?.agents ?? []) $('trace-agent').add(new Option(`${agent.name} · private + public`, agent.id));
  loadTrajectory();
};
$('trace-agent').onchange = loadTrajectory;
refreshRuns();
