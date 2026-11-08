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
  const condition = setup.condition === 'planted' ? 'Planted condition · four standard agents + one assigned non-contributor' : setup.condition === 'control' ? 'Control condition · five standard agents, no planted participant' : 'Shared-resource experiment';
  target.append(element('p', `${setup.rounds} rounds · ${setup.assignments.length} agents · ${condition}`, 'setup-summary'));
  const rules = element('ul', undefined, 'setup-rules');
  for (const rule of setup.rules) rules.append(element('li', rule)); target.append(rules);
  if (setup.citizenship) { target.append(element('p', `${setup.citizenship.team}: ${setup.citizenship.objective}`, 'team-goal'), element('p', setup.citizenship.scoring, 'setup-summary')); }
  const assignments = element('div', undefined, 'role-grid');
  setup.assignments.forEach((agent, index) => {
    const card = element('div', undefined, `role-card ${agent.role === 'planted' ? 'planted' : ''}`);
    card.style.setProperty('--agent-color', colors[index % colors.length]);
    card.append(element('b', agent.name), element('span', agent.label, 'role-tag'), element('p', agent.instruction));
    if (agent.model) card.append(element('p', agent.model, 'model-label'));
    assignments.append(card);
  });
  target.append(assignments);
}
function roleLabel(name, setup) { return setup?.assignments?.find(a => a.name === name)?.label; }
function bubble(name, text, facts, setup) {
  const node = element('div', undefined, 'conversation-bubble'); node.dataset.speaker = name;
  const header = element('div', undefined, 'speaker');
  const index = setup?.assignments?.findIndex(a => a.name === name) ?? -1;
  node.style.setProperty('--agent-color', colors[(index >= 0 ? index : 0) % colors.length]);
  header.append(element('b', name));
  const role = roleLabel(name, setup); if (role) header.append(element('span', role, 'speaker-role'));
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
  header.append(element('span', isPublic ? 'Shared with all agents' : 'Private · operator view', 'visibility-label'));
  if (event.time) header.append(element('time', new Date(event.time).toLocaleTimeString()));
  node.append(header);
  switch (event.type) {
    case 'fund.citizenship':
      node.append(element('h3', 'Team citizenship · final peer review'), element('p', `${d.project.name}: ${d.projectPoints}/${d.projectTarget} points. Team grade ${d.teamGrade.toFixed(1)}.`, 'round-summary'));
      for (const agent of d.agents) node.append(bubble(agent.agent, `Peer average ${agent.peerAverage.toFixed(1)} · adjustment ${agent.adjustmentFactor.toFixed(3)} · individual project grade ${agent.individualGrade.toFixed(1)}`, 'Earnings are unchanged by citizenship grades.', setup));
      break;
    case 'fund.round':
      node.classList.add('round-conversation');
      node.append(element('h3', `Round ${d.round} · decisions revealed`), element('p', `$${d.totalContributions} contributed → $${d.doubledFund} after doubling → $${d.share} paid to each agent`, 'round-summary'));
      for (const outcome of d.outcomes) node.append(bubble(outcome.agent, outcome.message, `Contributed $${outcome.contribution} · Round payoff $${outcome.payoff} · Total earned $${outcome.cumulativePayoff}`, setup));
      break;
    case 'agent.message':
      node.append(bubble(event.agent, d.text, `Round ${d.round} · Public message`, setup)); break;
    case 'agent.decision':
      node.append(bubble(event.agent, d.reason, `Round ${d.round} · Took ${d.take} · ${d.poolRemaining} resources remain`, setup)); break;
    case 'run.started':
      node.append(element('h3', 'Experiment started'), element('p', `${d.agents?.length ?? 'All'} agents are participating${d.mode === 'demo' ? ' in a simulated demonstration' : ' using Adaption inference'}.`, 'event-description')); break;
    case 'run.completed':
      node.append(element('h3', 'Experiment completed'), element('p', d.rounds ? `${d.rounds.length} rounds finished. Review each agent’s contribution history below.` : 'All committed decisions have been saved.', 'event-description')); break;
    case 'run.stopped': case 'run.failed': case 'sdk.error': case 'sdk.turn.failed':
      node.classList.add('error'); node.append(element('h3', event.type.includes('stopped') ? 'Experiment stopped' : 'A problem interrupted the run'), element('p', d.message ?? d.error?.message ?? 'See technical details for the error.', 'event-description')); break;
    case 'agent.peer_submission':
      node.append(element('h3', `${event.agent} submitted private peer ratings`), element('p', 'Ratings will be revealed only after all five reviews validate.', 'event-description')); break;
    case 'agent.usage':
      node.append(element('h3', `${event.agent} · model usage`), element('p', `${d.model} · ${d.credits.toFixed(6)} credits from reported usage`, 'event-description')); break;
    case 'operator.billing':
      node.append(element('h3', 'Run usage cost'), element('p', `${d.credits.toFixed(6)} credits${d.simulated ? ' · simulated run' : ' · computed from reported usage, not an invoice'}`, 'event-description')); break;
    case 'agent.observation':
      node.append(element('h3', d.phase === 'peer-review' ? `${event.agent} · reviewing team citizenship` : `${event.agent} · preparing for round ${d.round}`), element('p', `Received outcomes from ${d.history?.length ?? 0} earlier ${setup?.task === 'shared-fund' ? 'rounds' : 'decisions'}. Current submissions from other agents are not included.`, 'event-description')); break;
    case 'agent.prompt':
      node.append(element('h3', `${event.agent} · private instructions`), element('p', 'Task instructions and the agent’s own role/context were sent privately.', 'event-description')); break;
    case 'agent.submission':
      node.append(bubble(event.agent, d.message, `Round ${d.round} · Submitted $${d.contribution} privately · Awaiting joint reveal`, setup)); break;
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
          const facts = parsed?.ratings ? 'Final peer review · private until all reviewers submit' : parsed?.contribution !== undefined ? `Proposed contribution: $${parsed.contribution} · Not public until round reveal` : parsed?.take !== undefined ? `Proposed allocation: ${parsed.take} · Awaiting validation` : 'Private model response';
          node.append(bubble(event.agent, parsed ? parsed.ratings ? parsed.ratings.map(r => `${r.agent}: ${r.rating} — ${r.reason}`).join('\n') : parsed.message || parsed.reason || 'No message supplied.' : item.text, facts, setup));
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
