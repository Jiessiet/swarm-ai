function el(tag, text) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }
function section(target, title, text) { target.append(el('h3', title), el('p', text)); }
function list(target, title, items) { target.append(el('h3', title)); const ul = el('ul'); for (const item of items) ul.append(el('li', item)); target.append(ul); }
export function researchBrief(result, target, runId) {
  const b = result.brief; target.replaceChildren();
  target.append(el('p', result.simulated ? 'SIMULATED DEMO · No browsing or empirical trials performed.' : 'RESEARCH PLAN · Empirical experiment not yet run.'), el('h2', b.title));
  if (result.evidence) target.append(el('p', `${result.evidence.searchResults} search results · ${result.evidence.pagesRead} pages read · ${result.evidence.citedSources} cited sources. ${result.evidence.note}`));
  if (runId) { const download = el('a', 'Download research brief (.md)'); download.href = `/runs/${encodeURIComponent(runId)}/brief.md`; download.download = 'research-brief.md'; target.append(download); }
  section(target, 'Research question', b.researchQuestion); section(target, 'Hypothesis · untested', b.hypothesis); section(target, 'Safety mechanism', b.safetyMechanism);
  target.append(el('h3', 'Related work'));
  if (!b.relatedWork.length) target.append(el('p', 'No retrieved sources cited. Verify related work before claiming novelty.'));
  for (const work of b.relatedWork) {
    const source = result.sources.find(s => s.id === work.sourceId); if (!source) continue;
    const line = el('p'), link = el('a', `${source.id} · ${source.title}`);
    try { const url = new URL(source.url); if (url.protocol === 'https:') { link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; } } catch {}
    line.append(link, el('span', ` (${source.kind}) — ${work.relevance}`)); target.append(line);
  }
  for (const [label, key] of [['Treatment','treatment'], ['Baseline','baseline'], ['Sample size','sampleSize'], ['Analysis','analysis'], ['Success criterion','successCriterion']]) section(target, label, b.experiment[key]);
  list(target, 'Metrics', b.experiment.metrics);
  list(target, `One-day schedule · ${b.schedule.reduce((n, s) => n + s.hours, 0)} hours`, b.schedule.map(s => `${s.hours}h · ${s.owner}: ${s.task} Deliverable: ${s.deliverable}`));
  list(target, 'Expected findings · hypotheses only', b.expectedFindings);
  list(target, 'Alternatives considered', b.alternatives.map(a => `${a.idea} — ${a.rejectionReason}`));
  list(target, 'Limitations', b.limitations); section(target, 'Fallback', b.fallback); section(target, '60-second pitch', b.pitch);
}
