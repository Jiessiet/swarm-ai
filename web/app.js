const $ = id => document.getElementById(id);
const colors = ['#b6dfa0','#a4c4ea','#d8bae8','#e6c18b','#88cfc3','#db9d9d','#bfc98b','#a8abd9'];
let agents = new Map(), total = 0, decisions = 0, usage = 0, count = 0, entries = [], lastId = 0, configured = false, running = false;
function busy(value) { running = value; $('start').disabled = value; $('stop').disabled = !value; for (const input of $('controls').querySelectorAll('input,select')) input.disabled = value; }
function message(text) { $('notice').textContent = text; }
function agentState(name, state) { const a = agents.get(name); if (a) { a.node.classList.toggle('active', state === 'Working'); a.node.querySelector('.state').textContent = state; } }
function addEvent(e) {
  const node = document.createElement('article'); node.className = 'event' + (e.type.includes('failed') || e.type === 'sdk.error' ? ' error' : ''); node.dataset.agent = e.agent || '';
  const meta = document.createElement('div'); meta.className = 'meta';
  const who = document.createElement('b'); who.textContent = e.agent || 'Environment';
  const type = document.createElement('span'); type.textContent = e.type.replace('sdk.', '');
  const time = document.createElement('time'); time.textContent = new Date(e.time).toLocaleTimeString();
  meta.append(who, type, time); const content = document.createElement('pre');
  const d = e.data; content.textContent = d?.item ? d.item.text ?? d.item.command ?? JSON.stringify(d.item, null, 2) : JSON.stringify(d, null, 2);
  node.append(meta, content); node.hidden = $('filter').value !== 'all' && e.agent !== $('filter').value;
  $('feed').querySelector('.empty')?.remove(); $('feed').append(node); entries.push(node);
  if (entries.length > 400) entries.shift().remove();
  $('event-count').textContent = `${++count} events`;
  if ($('follow').checked) $('feed').scrollTop = $('feed').scrollHeight;
}
function render(e) {
  if (e.id <= lastId) return; lastId = e.id;
  const d = e.data;
  if (e.type === 'run.started') {
    agents = new Map(); entries = []; decisions = usage = count = 0; total = d.tokens;
    $('agents').replaceChildren(); $('feed').replaceChildren(); $('ledger').replaceChildren(); $('filter').replaceChildren(new Option('All agents', 'all'));
    $('usage').textContent = $('decisions').textContent = '0'; $('pool').textContent = $('hub').textContent = total; $('bar').style.width = '100%'; $('status').textContent = 'Running'; busy(true);
    $('usage-label').textContent = d.mode === 'demo' ? '(simulated)' : '';
    message(d.mode === 'demo' ? 'SIMULATED RUN · Demonstration events and token usage. No API calls.' : 'LIVE RUN · Codex SDK events with Adaption model inference.');
    d.agents.forEach((name, i) => {
      const node = document.createElement('div'); node.className = 'agent'; node.style.setProperty('--color', colors[i % colors.length]);
      node.innerHTML = '<div class="avatar"></div><h3></h3><div class="state">Waiting</div><div class="balance"><b>0</b><small>collected</small></div>';
      node.querySelector('.avatar').textContent = String(i + 1).padStart(2,'0'); node.querySelector('h3').textContent = name;
      $('agents').append(node); agents.set(name, { node, balance: 0 }); $('filter').add(new Option(name, name));
    });
  }
  if (e.type === 'agent.observation') { agentState(e.agent, 'Working'); $('round').textContent = `Round ${d.round} / ${d.totalRounds}`; }
  if (e.type === 'agent.decision') {
    const a = agents.get(e.agent); if (a) { a.balance += d.take; a.node.querySelector('.balance b').textContent = a.balance; agentState(e.agent, 'Waiting'); }
    $('pool').textContent = $('hub').textContent = d.poolRemaining; $('bar').style.width = `${d.poolRemaining / total * 100}%`; $('decisions').textContent = ++decisions;
    const row = document.createElement('tr'); for (const value of [d.round, e.agent, `+${d.take}`, d.poolRemaining, d.reason]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); } $('ledger').append(row);
  }
  if (e.type === 'sdk.turn.completed' && d.usage) { usage += d.usage.input_tokens + d.usage.output_tokens; $('usage').textContent = usage.toLocaleString(); }
  if (['run.completed','run.failed','run.stopped'].includes(e.type)) { busy(false); $('status').textContent = e.type.split('.')[1]; agents.forEach((_, name) => agentState(name, 'Idle')); if (d.message) message(d.message); }
  addEvent(e);
}
const stream = new EventSource('/events');
stream.onopen = () => { $('connection').textContent = '● Stream connected'; };
stream.onerror = () => { $('connection').textContent = '○ Reconnecting…'; };
stream.onmessage = e => render(JSON.parse(e.data));
stream.addEventListener('status', e => { const s = JSON.parse(e.data); configured = s.configured; busy(s.active); });
$('filter').onchange = () => entries.forEach(node => { node.hidden = $('filter').value !== 'all' && node.dataset.agent !== $('filter').value; });
$('controls').onsubmit = async e => {
  e.preventDefault(); if (running) return;
  if ($('mode').value === 'adaption' && !configured) { message('Set ADAPTION_API_KEY in the server environment, then restart npm run dashboard.'); return; }
  busy(true);
  try {
    const body = { mode: $('mode').value }; for (const key of ['count','rounds','tokens','maxTake']) body[key] = Number($(key).value);
    const response = await fetch('/run', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(await response.text());
  } catch (error) { message(error.message); busy(false); }
};
$('stop').onclick = async () => { try { const r = await fetch('/stop', { method:'POST' }); if (!r.ok) throw new Error('Stop failed'); } catch (e) { message(e.message); } };

// Load initial form values from the task definition; never override an active run.
fetch('/task').then(response => response.json()).then(task => {
  if (running) return;
  for (const key of ['count', 'rounds', 'tokens', 'maxTake']) $(key).value = task.defaults[key];
  $('hub').textContent = task.defaults.tokens;
}).catch(() => message('Could not load task defaults. Reload to try again.'));
