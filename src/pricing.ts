import { readFileSync } from 'node:fs';
export const catalog: { source: string; verifiedAt: string; unit: string; models: { id: string; input: number; cachedInput: number; output: number }[] } = JSON.parse(readFileSync(new URL('../config/models.json', import.meta.url), 'utf8'));
export function assignModels(count: number, requested?: string[]) {
  const models = requested ?? Array.from({ length: count }, (_, i) => catalog.models[i]?.id);
  if (models.length !== count || new Set(models).size !== count || models.some(id => !catalog.models.some(m => m.id === id))) throw new Error('Assign a different catalog model to each agent');
  return models;
}
export function estimatePricing(task: string, rounds: number, models: string[], mode = 'adaption') {
  let inputTokens = 0;
  // Estimate repeated observations and prior responses in each persistent thread.
  const isFund = task === 'shared-fund';
  const turnsPerRound = isFund ? 2 : 1;
  const base = 2500, historyPerRound = isFund ? 1600 : 1000, outputPerTurn = 350;
  const roundTurns = rounds * turnsPerRound;
  const turns = roundTurns + Number(isFund);
  let priorInput = 0;
  for (let turn = 0; turn < turns; turn++) {
    priorInput += base + historyPerRound * Math.floor(turn / turnsPerRound);
    inputTokens += priorInput + outputPerTurn * turn;
  }
  const outputTokens = roundTurns * outputPerTurn + (isFund ? 900 : 0);
  const perAgent = models.map((model, index) => {
    const rate = catalog.models.find(m => m.id === model); if (!rate) throw new Error('Unknown pricing model');
    const credits = (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
    return { index, model, inputTokens, outputTokens, inputRate: rate.input, outputRate: rate.output, credits, expectedCharge: mode === 'demo' ? 0 : credits };
  });
  const totalCredits = perAgent.reduce((sum, a) => sum + a.credits, 0);
  return { source: catalog.source, verifiedAt: catalog.verifiedAt, mode, perAgent, totalCredits, expectedCharge: mode === 'demo' ? 0 : totalCredits, calls: models.length * turns,
    range: { low: totalCredits * 0.5, high: totalCredits * 2 },
    assumptions: 'Planning estimate: 2,500 base input tokens per turn, accumulated thread history, 350 output tokens per discussion or decision turn, and 900 for final peer review. Assumes no cached-input discount. The 0.5–2× range is illustrative, not a cap; tool calls, reasoning, retries and longer responses can exceed it. Credits are not converted to USD.' };
}
export function usageCost(model: string, usage: { input_tokens: number; output_tokens: number; cached_input_tokens?: number }) {
  const rate = catalog.models.find(m => m.id === model); if (!rate) throw new Error('Unknown pricing model');
  const cached = Math.max(0, Math.min(usage.input_tokens, usage.cached_input_tokens ?? 0));
  return ((usage.input_tokens - cached) * rate.input + cached * rate.cachedInput + usage.output_tokens * rate.output) / 1_000_000;
}
