import { readFileSync } from 'node:fs';
import type { HackathonObservation } from './types.js';
export const defaults = { count: 5, rounds: 3, tokens: 1, maxTake: 1 };
export const roles = ['Literature scout', 'Safety analyst', 'Experiment designer', 'Skeptical reviewer', 'Synthesis lead'];
export const roleFor = (index: number) => [...roles, 'Replication analyst', 'Red-team researcher', 'Methods reviewer'][index % 8];
export const defaultObjective = 'Propose a small, source-grounded swarm AI safety experiment that a team can implement and evaluate in eight hours.';
export const maxWebActions = 4;
export const instructions = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8');
const string = { type: 'string', minLength: 1, maxLength: 6000 };
const list = { type: 'array', minItems: 1, maxItems: 8, items: string };
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const actionSchema = object({ action: { type: 'string', enum: ['search', 'read', 'share'] }, query: { type: 'string', maxLength: 300 }, url: { type: 'string', maxLength: 2048 }, message: { type: 'string', maxLength: 10000 }, sourceIds: { type: 'array', maxItems: 30, items: { type: 'string' } } });
export const briefSchema = object({
  title: string, researchQuestion: string, hypothesis: string, safetyMechanism: string,
  relatedWork: { type: 'array', maxItems: 20, items: object({ sourceId: string, relevance: string }) },
  alternatives: { type: 'array', minItems: 1, maxItems: 5, items: object({ idea: string, rejectionReason: string }) },
  experiment: object({ treatment: string, baseline: string, sampleSize: string, metrics: list, analysis: string, successCriterion: string }),
  schedule: { type: 'array', minItems: 1, maxItems: 12, items: object({ hours: { type: 'number', exclusiveMinimum: 0, maximum: 8 }, owner: string, task: string, deliverable: string }) },
  expectedFindings: list, limitations: list, fallback: string, pitch: string,
});
export const schemaFor = (o: HackathonObservation) => o.phase === 'synthesis' ? briefSchema : actionSchema;
export function demoDecision(o: HackathonObservation) {
  if (o.phase === 'synthesis') return {
    title: 'Can source provenance stop false safety claims spreading through an AI team?',
    researchQuestion: 'Does requiring evidence IDs reduce adoption of a planted unsupported claim in a research team?',
    hypothesis: 'Provenance requirements reduce unsupported-claim adoption relative to free discussion; this is untested.',
    safetyMechanism: 'Measure evidence laundering: a claim becomes accepted because peers repeat it, rather than verify it.',
    relatedWork: [], alternatives: [{ idea: 'Train a new swarm alignment policy', rejectionReason: 'Training and evaluation exceed a one-day budget.' }],
    experiment: { treatment: 'Require every factual assertion to cite a provided evidence ID; reject nonexistent IDs.', baseline: 'Same agents, tasks, supplied documents and planted claim, without the evidence-ID requirement.', sampleSize: '20 synthetic question sets × two conditions × two role rotations = 80 team trials; five agents per trial, fixed two-message budget. Pilot two sets first and reduce sets if latency exceeds budget.', metrics: ['Fraction of final answers adopting the unsupported claim', 'Accuracy on grounded questions', 'Tokens and latency per trial'], analysis: 'Pair trials by question set and rotation; report adoption-rate difference, task accuracy and a paired bootstrap interval clustered by question set. Keep model-role assignments identical within each pair.', successCriterion: 'Predeclare at least a 20 percentage-point reduction in unsupported adoption with no more than a 5-point accuracy loss; otherwise report a null result.' },
    schedule: [
      { hours: 1, owner: 'Literature scout + Safety analyst', task: 'Verify related work and finalize a narrow protocol.', deliverable: 'Cited motivation, hypothesis and frozen metrics.' },
      { hours: 2, owner: 'Experiment designer', task: 'Build synthetic fixtures and two-condition runner.', deliverable: 'Reproducible scripts and two-set pilot.' },
      { hours: 2, owner: 'Experiment designer + Skeptical reviewer', task: 'Run paired trials and validate logs.', deliverable: 'Raw outputs, model assignments, usage and failure counts.' },
      { hours: 1.5, owner: 'Safety analyst', task: 'Analyze paired differences and confounds.', deliverable: 'One plot, uncertainty intervals and failure examples.' },
      { hours: 1.5, owner: 'Synthesis lead', task: 'Prepare a reproducible demo and report.', deliverable: 'Short research brief and 60-second pitch.' },
    ],
    expectedFindings: ['Hypothesis only: provenance may reduce unsupported consensus.', 'A null effect could reveal that valid-looking citations substitute for evidence checking.'],
    limitations: ['Offline demo: no web search or papers were read and no empirical trials were run.', 'Synthetic evidence and a small model sample limit generalization.', 'Model identity and role can confound effects; rotate roles within matched pairs.'],
    fallback: 'Use five deterministic toy participants to verify scoring, then pilot five question sets with one hosted model; report it as a pilot.',
    pitch: 'We test whether AI teams repeat unsupported safety claims, and whether evidence provenance helps. In one day we can build matched synthetic cases, run a small paired study, and show either a useful mitigation or a concrete failure mode.',
  };
  return { action: 'share', query: '', url: '', sourceIds: [], message: `[SIMULATED · ${o.role}] ${o.phase === 'research' ? 'No browsing in demo. Candidate safety risk: evidence laundering when agents repeat an unsupported claim.' : o.phase === 'proposal' ? 'Building on the team discussion, compare free discussion against mandatory evidence IDs on matched synthetic tasks; measure false-claim adoption, accuracy and cost.' : 'Challenge: citation presence is not citation validity. Freeze scoring before trials, rotate model roles, include null results, and scope to an eight-hour pilot.'}` };
}
