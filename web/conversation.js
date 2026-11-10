// Render untrusted agent content using textContent; raw payloads stay collapsed.
const colors = ['#b6dfa0','#a4c4ea','#d8bae8','#e6c18b','#88cfc3','#db9d9d','#bfc98b','#a8abd9'];
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function rawDetails(data, label = 'Technical details') {
  const details = element('details', undefined, 'raw-details');
  details.append(element('summary', label), element('pre', JSON.stringify(data, null, 2)));
  return details;
}
export function setupPanel(setup, target, caption = 'Current experiment') {
  target.replaceChildren();
  target.append(element('p', caption, 'setup-caption'), element('h3', setup.title, 'setup-title'));
  target.append(element('p', `${setup.rounds} rounds · ${setup.assignments.length} agents`, 'setup-summary'));
  const rules = element('ul', undefined, 'setup-rules');
  for (const rule of setup.rules) rules.append(element('li', rule)); target.append(rules);
  if (setup.network) {
    target.append(element('h3', `Communication network · ${setup.network.edges.length} directed channels`));
    const routing = element('ul', undefined, 'setup-rules');
    setup.assignments.forEach((agent, i) => {
      const incoming = setup.network.edges.filter(e => e.to === i).map(e => setup.assignments[e.from]?.name);
      routing.append(element('li', `${agent.name} receives from ${incoming.join(', ') || 'no one (independent)'}.`));
    });
    target.append(routing);
  }
  const assignments = element('div', undefined, 'role-grid');
  setup.assignments.forEach((agent, index) => {
    const card = element('div', undefined, 'role-card');
    card.style.setProperty('--agent-color', colors[index % colors.length]);
    card.append(element('b', agent.name), element('span', agent.label, 'role-tag'), element('p', agent.instruction));
    if (agent.model) card.append(element('p', agent.model, 'model-label'));
    assignments.append(card);
  });
  target.append(assignments);
}
function roleLabel(name, setup) { return setup?.assignments?.find(a => a.name === name)?.label; }
function bubble(name, text, facts, setup, recordedRole) {
  const node = element('div', undefined, 'conversation-bubble'); node.dataset.speaker = name;
  const header = element('div', undefined, 'speaker');
  const index = setup?.assignments?.findIndex(a => a.name === name) ?? -1;
  node.style.setProperty('--agent-color', colors[(index >= 0 ? index : 0) % colors.length]);
  header.append(element('b', name));
  const role = recordedRole ?? roleLabel(name, setup); if (role) header.append(element('span', role, 'speaker-role'));
  node.append(header);
  if (text) node.append(element('p', text, 'spoken-message'));
  if (facts) node.append(element('div', facts, 'decision-facts'));
  return node;
}
function parsedMessage(text) {
  try { const value = JSON.parse(text); return value && typeof value === 'object' ? value : null; } catch { return null; }
}
export function conversationEvent(event, setup) {
  const d = event.data ?? {};
  const item = d.item;
  const node = element('article', undefined, 'event readable-event');
  node.dataset.agent = event.agent || '';
  node.dataset.agents = JSON.stringify(d.outcomes?.map(o => o.agent) ?? []);
  node.dataset.visibility = event.visibility ?? 'private';
  const header = element('div', undefined, 'meta');
  const isPublic = event.visibility === 'public';
  header.append(element('span', isPublic ? 'Operator view · team activity' : 'Private · operator view', 'visibility-label'));
  if (event.time) header.append(element('time', new Date(event.time).toLocaleTimeString()));
  node.append(header);
  switch (event.type) {
    case 'hackathon.roles':
      node.append(element('h3', 'Agent roles updated'), element('p', `${d.changedAgents.join(', ') || 'Team roles'} · revision ${d.roles.revision}. New assignments apply to subsequent decisions.`, 'event-description')); break;
    case 'hackathon.network':
      node.append(element('h3', 'Communication network updated'), element('p', `Revision ${d.network.revision} · ${d.network.edges.length} directed channels. Applied to subsequent decisions.`, 'event-description')); break;
    case 'hackathon.agent.error':
      node.append(element('h3', `${event.agent} · ${d.retrying ? 'retrying after error' : 'turn skipped after error'}`), element('p', `${d.message} (${d.phase}, round ${d.round}, attempt ${d.attempt}). ${d.retrying ? 'Retrying with error feedback.' : 'The team continues; this agent can return next round.'}`, 'event-description')); break;
    case 'hackathon.agent.timeout':
      node.append(element('h3', `${event.agent} · turn timed out`), element('p', `${d.message} (${d.phase}, round ${d.round}). Turn skipped; the team continues.`, 'event-description')); break;
    case 'hackathon.phase':
      node.append(element('h3', `Swarm · ${d.phase}`)); break;
    case 'hackathon.contribution':
      node.append(bubble(event.agent, d.message, `${d.phase} · Round ${d.round} · Sources: ${d.sourceIds.join(', ') || 'none'}${d.recipients ? ' · Sent to: ' + (d.recipients.join(', ') || 'no neighbors') : ''}`, setup, d.role)); break;
    case 'hackathon.web.request':
      node.append(element('h3', `${event.agent} · ${d.action === 'search' ? 'searching' : 'reading'} the web`), element('p', d.query || d.url)); break;
    case 'hackathon.web.result':
      node.append(element('h3', `${event.agent} · web research`), element('p', d.error || `Retrieved ${d.results.length} source(s)`));
      for (const source of d.results ?? []) node.append(element('p', `${source.id} · ${source.title} · ${source.url} (${source.kind})`)); break;
    case 'hackathon.brief':
      node.append(element('h3', d.brief?.title ?? 'Partial research saved'), element('p', d.brief?.researchQuestion ?? 'The discussion and sources were saved without a final synthesis.', 'event-description'));
      { const link = element('a', 'Read the research brief ↓'); link.href = '#research'; node.append(link); }
      node.dataset.agents = JSON.stringify(setup?.assignments.map(a => a.name) ?? []); break;
    case 'run.started':
      node.append(element('h3', 'Experiment started'), element('p', `${d.agents?.length ?? 'All'} agents are participating${d.mode === 'demo' ? ' in a simulated demonstration' : ' using Adaption inference'}.`, 'event-description')); break;
    case 'run.completed':
      node.append(element('h3', 'Experiment completed'), element('p', d.completion === 'partial' ? 'Partial research saved. All synthesis attempts failed or timed out; no final brief was produced.' : d.brief ? 'The one-day research plan is ready. Proposed empirical work has not been run.' : 'All committed decisions have been saved.', 'event-description')); break;
    case 'run.stopped': case 'run.failed': case 'sdk.error': case 'sdk.turn.failed':
      node.classList.add('error'); node.append(element('h3', event.type.includes('stopped') ? 'Experiment stopped' : 'A problem interrupted the run'), element('p', d.message ?? d.error?.message ?? 'See technical details for the error.', 'event-description')); break;
    case 'agent.usage':
      node.append(element('h3', `${event.agent} · model usage`), element('p', `${d.model} · ${d.credits.toFixed(6)} credits from reported usage`, 'event-description')); break;
    case 'operator.billing':
      node.append(element('h3', 'Run usage cost'), element('p', `${d.credits.toFixed(6)} credits${d.simulated ? ' · simulated run' : ' · computed from reported usage, not an invoice'}`, 'event-description')); break;
    case 'agent.observation':
      node.append(element('h3', `${event.agent} · ${d.phase}`), element('p', `${d.history?.length ?? 0} contributions and ${d.sources?.length ?? 0} retrieved sources available. Web actions remaining: ${d.webActionsRemaining}.`, 'event-description')); break;
    case 'agent.prompt':
      node.append(element('h3', `${event.agent} · private instructions`), element('p', 'Task instructions and the agent’s own role/context were sent privately.', 'event-description')); break;
    case 'operator.setup':
      node.append(element('h3', 'Role assignments recorded'), element('p', 'The experiment setup above shows the operator’s view of private assignments.', 'event-description')); break;
    case 'sdk.turn.started':
      node.append(element('h3', `${event.agent} is working`), element('p', 'Preparing a response using its own context.', 'event-description')); break;
    case 'sdk.turn.completed':
      node.append(element('h3', `${event.agent} finished responding`), element('p', d.usage ? `${d.usage.input_tokens.toLocaleString()} input tokens · ${d.usage.output_tokens.toLocaleString()} output tokens` : 'Response ready for task validation.', 'event-description')); break;
    default:
      if (item?.type === 'agent_message') {
        if (event.type !== 'sdk.item.completed') {
          node.append(element('h3', `${event.agent} is drafting a private response`), element('p', 'The final response will appear when complete.', 'event-description'));
        } else {
          const parsed = parsedMessage(item.text);
          const facts = 'Private model response';
          node.append(bubble(event.agent, parsed ? parsed.message || parsed.query || parsed.url || parsed.title || parsed.reason || 'No message supplied.' : item.text, facts, setup));
        }
      } else if (item?.type === 'command_execution') {
        node.append(element('h3', `${event.agent} · tool activity`), element('p', item.command, 'tool-command'));
        if (item.aggregated_output) node.append(element('p', item.aggregated_output, 'event-description'));
      } else if (item?.type === 'mcp_tool_call') {
        node.append(element('h3', `${event.agent} · called ${item.tool ?? 'a tool'}`), element('p', item.status ?? 'Tool activity', 'event-description'));
      } else {
        node.append(element('h3', `${event.agent || 'Environment'} · ${item?.type?.replaceAll('_', ' ') ?? 'activity update'}`), element('p', item?.text ?? 'An internal activity was recorded. Expand technical details to inspect it.', 'event-description'));
      }
  }
  node.append(rawDetails(event));
  return node;
}
