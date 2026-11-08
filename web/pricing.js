function el(tag, text, cls) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; }
export function pricingPanel(setup, target, onChange) {
  target.replaceChildren();
  const quote = setup.pricing;
  if (!quote) { target.append(el('p', 'This older run has no recorded price estimate.', 'trace-note')); return; }
  const top = el('div', undefined, 'cost-headline');
  top.append(el('strong', `${quote.expectedCharge.toFixed(6)} credits`), el('span', quote.mode === 'demo' ? `Demo charge: zero. Comparable live estimate: ${quote.totalCredits.toFixed(6)} credits.` : `${quote.calls} planned calls · illustrative range ${quote.range.low.toFixed(6)}–${quote.range.high.toFixed(6)} credits`)); target.append(top);
  const table = el('table'); const head = el('tr');
  for (const name of ['Agent / role','Model','Input / output credits per 1M','Est. input / output tokens','Est. credits']) head.append(el('th',name)); const thead=el('thead');thead.append(head);table.append(thead);const body=el('tbody');
  setup.assignments.forEach((agent,i)=>{
    const estimate=quote.perAgent[i];const row=el('tr'); row.append(el('td',`${agent.name} · ${agent.label}`));const cell=el('td');
    if(onChange) { const select=el('select');select.setAttribute('aria-label',`${agent.name} model`);select.dataset.modelIndex=String(i);for(const model of setup.catalog.models)select.add(new Option(model.id,model.id));select.value=agent.model;select.onchange=()=>onChange(i,select.value);cell.append(select); } else cell.append(el('span',agent.model??'Not recorded'));
    row.append(cell,el('td',`${estimate.inputRate} / ${estimate.outputRate}`),el('td',`${estimate.inputTokens.toLocaleString()} / ${estimate.outputTokens.toLocaleString()}`),el('td',estimate.expectedCharge.toFixed(6)));body.append(row);
  }); table.append(body);const scroll=el('div',undefined,'table-wrap');scroll.append(table);target.append(scroll);
  if (onChange) target.append(el('p','Choose a model for each agent using the dropdowns above. Selecting a model already assigned to another agent swaps the two assignments, keeping all agents on different models. Estimates refresh automatically before the next run.','price-assumptions'));
  target.append(el('p',quote.assumptions,'price-assumptions'));
  const source=el('p',undefined,'price-assumptions');const link=el('a','Adaption model pricing');link.href=quote.source;link.target='_blank';link.rel='noreferrer';source.append(link,document.createTextNode(` · verified ${new Date(quote.verifiedAt).toLocaleString()}. Model availability and harness compatibility need live verification.`));target.append(source);
  if (setup.task !== 'hackathon') target.append(el('p','Different models can affect behavior as well as roles. A single mixed-model run cannot isolate the effect of the planted role; rotate model assignments across repeated comparisons.','price-assumptions'));
}
export function citizenshipPanel(score,target) {
  target.replaceChildren();
  target.append(el('p',`${score.project.name}: ${score.projectPoints} / ${score.projectTarget} project points · Team grade ${score.teamGrade.toFixed(1)} / 100`,'citizenship-summary'));
  target.append(el('p','Citizenship adjustment = individual peer average ÷ team peer average, capped at 1.05. Individual project grade = team grade × adjustment. Simulated earnings are unchanged.','price-assumptions'));
  const table=el('table');const head=el('tr');for(const label of ['Agent','Peer average','Adjustment','Project grade'])head.append(el('th',label));table.append(head);
  for(const agent of score.agents){const row=el('tr');for(const value of [agent.agent,agent.peerAverage.toFixed(2),agent.adjustmentFactor.toFixed(3),agent.individualGrade.toFixed(2)])row.append(el('td',value));table.append(row);}const scroll=el('div',undefined,'table-wrap');scroll.append(table);target.append(scroll);
  for(const agent of score.agents){const detail=el('details',undefined,'peer-evidence');detail.append(el('summary',`${agent.agent} · peer feedback`));for(const rating of agent.received)detail.append(el('p',`${rating.from}: ${rating.rating} (${rating.score}) — ${rating.reason}`));target.append(detail);}
}
