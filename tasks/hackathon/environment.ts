import { MAX_AGENTS } from '../../src/identity.js';
import { createRoleController, type RoleController } from '../../src/roles.js';
import { AgentTimeoutError } from '../../src/timeouts.js';
import type { Agent, Observer } from '../../src/types.js';
import { createNetworkController, type NetworkController } from '../../src/network.js';
import { defaultObjective, maxWebActions, actionSchema, briefSchema } from './definition.js';
import { createWebResearch, type WebResearch } from './web.js';
import type { Brief, Contribution, HackathonObservation, ResearchAction, Source, TurnError, TurnTimeout } from './types.js';

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
export async function runHackathon(agents: Agent<HackathonObservation>[], rounds: number, observe: Observer = () => {}, signal?: AbortSignal, web: WebResearch = createWebResearch(), simulated = false, network: NetworkController = createNetworkController(agents.length), objective = defaultObjective, roles: RoleController = createRoleController(agents.length)) {
  if (agents.length < 2 || agents.length > MAX_AGENTS || new Set(agents.map(a => a.name)).size !== agents.length || !Number.isInteger(rounds) || rounds < 3 || rounds > 6) throw new Error('Hackathon requires 2..100 unique agents and 3..6 rounds');
  const history: Contribution[] = [], sources: Source[] = [];
  if (network.get().count !== agents.length) throw new Error('Network agent count does not match the team');
  if (roles.get().assignments.length !== agents.length) throw new Error('Role count does not match the team');
  const sourceOwners = new Map<string, number>();
  const timeouts: TurnTimeout[] = [];
  const errors: TurnError[] = [];
  const skipped = Symbol('skipped');
  const remaining = agents.map(() => maxWebActions);
  const names = agents.map(a => a.name);
  function observation(index: number, phase: HackathonObservation['phase'], round: number, toolFeedback?: unknown): HackathonObservation {
    const graph = network.get();
    const roleSettings = roles.get();
    const assigned = roleSettings.assignments[index];
    const incoming = graph.edges.filter(e => e.to === index).map(e => e.from);
    const outgoing = graph.edges.filter(e => e.from === index).map(e => e.to);
    const visible = new Set([names[index], ...incoming.map(i => names[i])]);
    const visibleHistory = history.filter(c => visible.has(c.agent));
    const relayedSources = new Set(visibleHistory.flatMap(c => c.sourceIds));
    return structuredClone({ phase, round, totalRounds: rounds, objective, network: graph, incomingPeers: incoming.map(i => names[i]), outgoingPeers: outgoing.map(i => names[i]), role: phase === 'synthesis' ? `${assigned.title}; acting synthesis lead` : assigned.title, roleInstructions: assigned.instructions, roleRevision: roleSettings.revision, team: names, timeBudgetHours: 8, webActionsRemaining: simulated ? 0 : remaining[index], history: visibleHistory, sources: sources.filter(s => visible.has(names[sourceOwners.get(s.id)!]) || relayedSources.has(s.id)), timeouts: timeouts.filter(t => visible.has(t.agent)), errors: errors.filter(e => visible.has(e.agent)), toolFeedback });
  }
  // Retry each failed decision once. Invalid output never enters shared state,
  // and a persistent failure skips only this turn, not the agent's later rounds.
  async function decide(index: number, o: HackathonObservation, check: (raw: unknown, current: HackathonObservation) => void) {
    let feedback = o.toolFeedback;
    for (let attempt = 1; attempt <= 2; attempt++) {
      signal?.throwIfAborted();
      const current = observation(index, o.phase, o.round, feedback);
      observe({ type: 'agent.observation', agent: names[index], data: structuredClone(current) });
      try {
        const result = await agents[index].decide(current, signal);
        signal?.throwIfAborted();
        check(result, current);
        return { raw: result, context: current };
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof AgentTimeoutError) {
          const timeout = { agent: names[index], round: o.round, phase: o.phase, timeoutSeconds: error.timeoutMs / 1000, message: error.message };
          timeouts.push(timeout);
          observe({ type: 'hackathon.agent.timeout', agent: names[index], data: structuredClone(timeout) });
          return skipped;
        }
        const failure = { agent: names[index], round: o.round, phase: o.phase, attempt, retrying: attempt < 2, message: error instanceof Error ? error.message : String(error) };
        errors.push(failure);
        observe({ type: 'hackathon.agent.error', agent: names[index], data: structuredClone(failure) });
        feedback = { previousFeedback: o.toolFeedback, error: failure.message, note: 'The previous attempt failed. Correct the response and try again. If out of web actions, share a contribution instead.' };
      }
    }
    return skipped;
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
        const decision = await decide(index, o, (raw, current) => {
          validate(raw, actionSchema);
          const action = raw as ResearchAction;
          if (action.sourceIds.some(id => !current.sources.some(s => s.id === id))) throw new Error('Contribution cites an unknown source');
          if (action.action === 'share' && !action.message.trim()) throw new Error('A shared contribution cannot be empty');
          if (action.action !== 'share' && (simulated || remaining[index] <= 0)) throw new Error('Web action budget exhausted; share a contribution instead');
        });
        if (decision === skipped) break;
        const action = decision.raw as ResearchAction;
        if (action.action === 'share') {
          const contribution = { agent: names[index], round, phase, role: decision.context.role, roleRevision: decision.context.roleRevision, message: action.message, sourceIds: [...action.sourceIds] };
          history.push(contribution);
          observe({ type: 'hackathon.contribution', agent: names[index], data: { ...structuredClone(contribution), recipients: decision.context.outgoingPeers, networkRevision: decision.context.network.revision } }); break;
        }
        remaining[index]--;
        observe({ type: 'hackathon.web.request', agent: names[index], data: { action: action.action, query: action.query, url: action.url } });
        try {
          const retrieved = action.action === 'search' ? await web.search(action.query, signal) : [await web.read(action.url, signal)];
          signal?.throwIfAborted();
          const added = retrieved.map((s, i) => ({ ...s, id: `S${sources.length + 1 + i}` }));
          sources.push(...added);
          for (const source of added) sourceOwners.set(source.id, index);
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
  const lead = Math.min(4, agents.length - 1);
  for (const index of [lead, ...agents.map((_, i) => i).filter(i => i !== lead)]) {
    const decision = await decide(index, observation(index, 'synthesis', rounds + 1), (raw, current) => { validateBrief(raw, current.sources); });
    if (decision === skipped) continue;
    brief = validateBrief(decision.raw, decision.context.sources); synthesisAgent = names[index]; break;
  }
  const evidence = { searchResults: sources.filter(s => s.kind === 'search-result').length, pagesRead: sources.filter(s => s.kind === 'page').length, citedSources: brief?.relatedWork.length ?? 0, note: 'Retrieved sources have not been independently verified. Search metadata does not establish novelty or empirical findings.' };
  const result = { task: 'hackathon', objective, roleSettings: roles.get(), network: network.get(), evidence, simulated, empiricalStatus: 'not-run', brief, completion: brief ? 'complete' as const : 'partial' as const, synthesisAgent, timeouts, errors, sources, contributions: history, timeBudgetHours: 8 };
  observe({ type: 'hackathon.brief', agent: synthesisAgent ?? undefined, data: structuredClone(result) });
  return result;
}
export function briefMarkdown(result: { brief: Brief | null; sources: Source[]; simulated: boolean; timeouts?: TurnTimeout[]; errors?: TurnError[]; contributions?: Contribution[] }) {
  const timeoutNote = (result.timeouts ?? []).length ? `## Timed-out turns\n${result.timeouts!.map(t => `- ${t.message} (${t.phase}, round ${t.round}); turn skipped.`).join('\n')}\n\n` : '';
  const errorNote = (result.errors ?? []).length ? `## Agent errors\n${result.errors!.map(e => `- ${e.agent}: ${e.message} (${e.phase}, round ${e.round}, attempt ${e.attempt}); ${e.retrying ? 'retrying' : 'turn skipped'}.`).join('\n')}\n\n` : '';
  const b = result.brief;
  if (!b) return `# Partial hackathon record\n\nNo final research brief: all synthesis attempts failed or timed out. No empirical experiment was run.\n\n${timeoutNote}${errorNote}## Saved contributions\n${(result.contributions ?? []).map(c => `### ${c.agent} · ${c.phase} · round ${c.round}\n${c.message}`).join('\n\n')}\n\n## Retrieved sources\n${result.sources.map(s => `- ${s.id}: ${s.title} (${s.url})`).join('\n')}\n`;
  return `# ${b.title}\n\n${result.simulated ? '**SIMULATED DEMO — no web research or experiments performed.**' : '**Research plan — empirical experiment not yet run.**'}\n\n${timeoutNote}${errorNote}## Research question\n${b.researchQuestion}\n\n## Hypothesis\n${b.hypothesis}\n\n## Safety mechanism\n${b.safetyMechanism}\n\n## Related work\n${b.relatedWork.map(w => { const s = result.sources.find(s => s.id === w.sourceId)!; return `- [${s.title}](${s.url}) (${s.id}, ${s.kind}): ${w.relevance}`; }).join('\n') || 'No retrieved sources cited. Evidence gap: verify related work before making novelty claims.'}\n\n## Experiment\n${Object.entries(b.experiment).map(([k, v]) => `- **${k}:** ${Array.isArray(v) ? v.join('; ') : v}`).join('\n')}\n\n## One-day schedule\n${b.schedule.map(s => `- ${s.hours}h — ${s.owner}: ${s.task} Deliverable: ${s.deliverable}`).join('\n')}\n\n## Expected findings (untested)\n${b.expectedFindings.map(s => `- ${s}`).join('\n')}\n\n## Alternatives considered\n${b.alternatives.map(a => `- ${a.idea}: ${a.rejectionReason}`).join('\n')}\n\n## Limitations\n${b.limitations.map(s => `- ${s}`).join('\n')}\n\n## Fallback\n${b.fallback}\n\n## 60-second pitch\n${b.pitch}\n`;
}
