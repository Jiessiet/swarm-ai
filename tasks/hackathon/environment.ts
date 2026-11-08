import { AgentTimeoutError } from '../../src/timeouts.js';
import type { Agent, Observer } from '../../src/types.js';
import { roles, maxWebActions, actionSchema, briefSchema } from './definition.js';
import { createWebResearch, type WebResearch } from './web.js';
import type { Brief, Contribution, HackathonObservation, ResearchAction, Source, TurnTimeout } from './types.js';

// Validate all model output before it becomes shared state, including offline/fake agents.
function validate(value: any, schema: any, path = 'response'): void {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !(k in schema.properties))) throw new Error(`Invalid ${path}`);
    for (const key of schema.required) { if (!(key in value)) throw new Error(`Missing ${path}.${key}`); validate(value[key], schema.properties[key], `${path}.${key}`); }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) throw new Error(`Invalid ${path}`);
    value.forEach((v, i) => validate(v, schema.items, `${path}[${i}]`));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.trim().length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity) || (schema.enum && !schema.enum.includes(value))) throw new Error(`Invalid ${path}`);
  } else if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value <= (schema.exclusiveMinimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) throw new Error(`Invalid ${path}`);
}
export function validateBrief(value: unknown, sources: Source[]): Brief {
  validate(value, briefSchema);
  const brief = value as Brief;
  if (brief.schedule.reduce((sum, block) => sum + block.hours, 0) > 8) throw new Error('Schedule exceeds the eight-hour hackathon');
  for (const work of brief.relatedWork) if (!sources.some(s => s.id === work.sourceId)) throw new Error('Brief cites an unknown source');
  return structuredClone(brief);
}
export async function runHackathon(agents: Agent<HackathonObservation>[], rounds: number, observe: Observer = () => {}, signal?: AbortSignal, web: WebResearch = createWebResearch(), simulated = false) {
  if (agents.length !== 5 || new Set(agents.map(a => a.name)).size !== 5 || !Number.isInteger(rounds) || rounds < 3 || rounds > 6) throw new Error('Hackathon requires five unique agents and 3..6 rounds');
  const history: Contribution[] = [], sources: Source[] = [];
  const timeouts: TurnTimeout[] = [];
  const timedOut = Symbol('timed out');
  const remaining = agents.map(() => maxWebActions);
  const names = agents.map(a => a.name);
  function observation(index: number, phase: HackathonObservation['phase'], round: number, toolFeedback?: unknown): HackathonObservation {
    return structuredClone({ phase, round, totalRounds: rounds, role: phase === 'synthesis' ? `${roles[index]}; acting synthesis lead` : roles[index], team: names, timeBudgetHours: 8, webActionsRemaining: simulated ? 0 : remaining[index], history, sources, timeouts, toolFeedback });
  }
  async function decide(index: number, o: HackathonObservation) {
    signal?.throwIfAborted();
    observe({ type: 'agent.observation', agent: names[index], data: structuredClone(o) });
    try {
      const result = await agents[index].decide(o, signal);
      signal?.throwIfAborted(); return result;
    } catch (error) {
      signal?.throwIfAborted();
      if (!(error instanceof AgentTimeoutError)) throw error;
      const timeout = { agent: names[index], round: o.round, phase: o.phase, timeoutSeconds: error.timeoutMs / 1000, message: error.message };
      timeouts.push(timeout);
      observe({ type: 'hackathon.agent.timeout', agent: names[index], data: structuredClone(timeout) });
      return timedOut;
    }
  }
  for (let round = 1; round <= rounds; round++) {
    const phase = round === 1 ? 'research' : round === 2 ? 'proposal' : 'critique';
    observe({ type: 'hackathon.phase', data: { round, phase, totalRounds: rounds } });
    // Rotate first speaker. Each validated contribution is visible to the next teammate.
    for (let offset = 0; offset < agents.length; offset++) {
      const index = (offset + round - 1) % agents.length;
      let feedback: unknown;
      while (true) {
        const o = observation(index, phase, round, feedback);
        const raw = await decide(index, o);
        if (raw === timedOut) break;
        validate(raw, actionSchema);
        const action = raw as ResearchAction;
        if (action.sourceIds.some(id => !sources.some(s => s.id === id))) throw new Error('Contribution cites an unknown source');
        if (action.action === 'share') {
          if (!action.message.trim()) throw new Error('A shared contribution cannot be empty');
          const contribution = { agent: names[index], round, phase, message: action.message, sourceIds: [...action.sourceIds] };
          history.push(contribution);
          observe({ type: 'hackathon.contribution', agent: names[index], data: structuredClone(contribution) }); break;
        }
        if (simulated || remaining[index] <= 0) throw new Error('Web action budget exhausted; share a contribution instead');
        remaining[index]--;
        observe({ type: 'hackathon.web.request', agent: names[index], data: { action: action.action, query: action.query, url: action.url } });
        try {
          const retrieved = action.action === 'search' ? await web.search(action.query, signal) : [await web.read(action.url, signal)];
          signal?.throwIfAborted();
          const added = retrieved.map((s, i) => ({ ...s, id: `S${sources.length + 1 + i}` }));
          sources.push(...added);
          feedback = { action: action.action, results: added, note: added.length ? 'Retrieved web evidence; search results may only contain metadata.' : 'No results. Refine the query or disclose the evidence gap.' };
        } catch (error) {
          signal?.throwIfAborted();
          feedback = { action: action.action, error: error instanceof Error ? error.message : 'Web research failed', results: [] };
        }
        observe({ type: 'hackathon.web.result', agent: names[index], data: feedback });
      }
    }
  }
  observe({ type: 'hackathon.phase', data: { round: rounds + 1, phase: 'synthesis', totalRounds: rounds } });
  let brief: Brief | null = null;
  let synthesisAgent: string | null = null;
  for (const index of [4, 0, 1, 2, 3]) {
    const raw = await decide(index, observation(index, 'synthesis', rounds + 1));
    if (raw === timedOut) continue;
    brief = validateBrief(raw, sources); synthesisAgent = names[index]; break;
  }
  const evidence = { searchResults: sources.filter(s => s.kind === 'search-result').length, pagesRead: sources.filter(s => s.kind === 'page').length, citedSources: brief?.relatedWork.length ?? 0, note: 'Retrieved sources have not been independently verified. Search metadata does not establish novelty or empirical findings.' };
  const result = { task: 'hackathon', evidence, simulated, empiricalStatus: 'not-run', brief, completion: brief ? 'complete' as const : 'partial' as const, synthesisAgent, timeouts, sources, contributions: history, timeBudgetHours: 8 };
  observe({ type: 'hackathon.brief', agent: synthesisAgent ?? undefined, data: structuredClone(result) });
  return result;
}
export function briefMarkdown(result: { brief: Brief | null; sources: Source[]; simulated: boolean; timeouts?: TurnTimeout[]; contributions?: Contribution[] }) {
  const timeoutNote = (result.timeouts ?? []).length ? `## Timed-out turns\n${result.timeouts!.map(t => `- ${t.message} (${t.phase}, round ${t.round}); turn skipped.`).join('\n')}\n\n` : '';
  const b = result.brief;
  if (!b) return `# Partial hackathon record\n\nNo final research brief: all synthesis attempts timed out. No empirical experiment was run.\n\n${timeoutNote}## Saved contributions\n${(result.contributions ?? []).map(c => `### ${c.agent} · ${c.phase} · round ${c.round}\n${c.message}`).join('\n\n')}\n\n## Retrieved sources\n${result.sources.map(s => `- ${s.id}: ${s.title} (${s.url})`).join('\n')}\n`;
  return `# ${b.title}\n\n${result.simulated ? '**SIMULATED DEMO — no web research or experiments performed.**' : '**Research plan — empirical experiment not yet run.**'}\n\n${timeoutNote}## Research question\n${b.researchQuestion}\n\n## Hypothesis\n${b.hypothesis}\n\n## Safety mechanism\n${b.safetyMechanism}\n\n## Related work\n${b.relatedWork.map(w => { const s = result.sources.find(s => s.id === w.sourceId)!; return `- [${s.title}](${s.url}) (${s.id}, ${s.kind}): ${w.relevance}`; }).join('\n') || 'No retrieved sources cited. Evidence gap: verify related work before making novelty claims.'}\n\n## Experiment\n${Object.entries(b.experiment).map(([k, v]) => `- **${k}:** ${Array.isArray(v) ? v.join('; ') : v}`).join('\n')}\n\n## One-day schedule\n${b.schedule.map(s => `- ${s.hours}h — ${s.owner}: ${s.task} Deliverable: ${s.deliverable}`).join('\n')}\n\n## Expected findings (untested)\n${b.expectedFindings.map(s => `- ${s}`).join('\n')}\n\n## Alternatives considered\n${b.alternatives.map(a => `- ${a.idea}: ${a.rejectionReason}`).join('\n')}\n\n## Limitations\n${b.limitations.map(s => `- ${s}`).join('\n')}\n\n## Fallback\n${b.fallback}\n\n## 60-second pitch\n${b.pitch}\n`;
}
