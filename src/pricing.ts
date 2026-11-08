import { readFileSync } from 'node:fs';
export const catalog: { source: string; verifiedAt: string; unit: string; models: { id: string; input: number; cachedInput: number; output: number }[] } = JSON.parse(readFileSync(new URL('../config/models.json', import.meta.url), 'utf8'));
export function assignModels(count: number, requested?: string[]) {
  const models = requested ?? Array.from({ length: count }, (_, i) => catalog.models[i]?.id);
  if (models.length !== count || new Set(models).size !== count || models.some(id => !catalog.models.some(m => m.id === id))) throw new Error('Assign a different catalog model to each agent');
  return models;
}
export function estimatePricing(task: string, rounds: number, models: string[], mode = 'adaption') {
  const isHackathon = task === 'hackathon';
  const isFund = task === 'shared-fund';
  const turnsPerRound = isFund ? 2 : 1;
  const base = 2500, historyPerRound = isHackathon ? 6000 : isFund ? 1600 : 1000, outputPerTurn = isHackathon ? 1200 : 350;
  const roundTurns = rounds * turnsPerRound;
  const perAgent = models.map((model, index) => {
    // Four research actions add four turns; only the synthesis lead gets the final brief turn.
    const synthesis = isHackathon && index === 4;
    const turns = roundTurns + Number(isFund) + (isHackathon ? 4 + Number(synthesis) : 0);
    let inputTokens = 0, priorInput = 0;
    for (let turn = 0; turn < turns; turn++) {
      priorInput += base + historyPerRound * Math.floor(turn / turnsPerRound);
      inputTokens += priorInput + outputPerTurn * turn;
    }
    const outputTokens = isHackathon ? (turns - Number(synthesis)) * outputPerTurn + (synthesis ? 4000 : 0) : roundTurns * outputPerTurn + (isFund ? 900 : 0);
    const rate = catalog.models.find(m => m.id === model); if (!rate) throw new Error('Unknown pricing model');
    const credits = (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
    return { index, model, inputTokens, outputTokens, inputRate: rate.input, outputRate: rate.output, credits, expectedCharge: mode === 'demo' ? 0 : credits, calls: turns };
  });
  const totalCredits = perAgent.reduce((sum, a) => sum + a.credits, 0);
  return { source: catalog.source, verifiedAt: catalog.verifiedAt, mode, perAgent, totalCredits, expectedCharge: mode === 'demo' ? 0 : totalCredits, calls: perAgent.reduce((sum, agent) => sum + agent.calls, 0),
    range: { low: totalCredits * 0.5, high: totalCredits * 2 },
    assumptions: isHackathon ? 'Planning allowance: four web-action turns per agent plus collaboration rounds and one final synthesis. Assumes 6,000 additional context tokens per round, accumulated thread history, 1,200 output tokens per turn and a larger final brief. Search-provider fees are excluded. Synthesis failover can add up to four extra model turns beyond this quote. Actual usage varies; this is not a cap. Demo performs no web or model calls.' : 'Planning estimate: 2,500 base input tokens per turn, accumulated thread history, 350 output tokens per discussion or decision turn, and 900 for final peer review. Assumes no cached-input discount. The 0.5–2× range is illustrative, not a cap; tool calls, reasoning, retries and longer responses can exceed it. Credits are not converted to USD.' };
}
export function usageCost(model: string, usage: { input_tokens: number; output_tokens: number; cached_input_tokens?: number }) {
  const rate = catalog.models.find(m => m.id === model); if (!rate) throw new Error('Unknown pricing model');
  const cached = Math.max(0, Math.min(usage.input_tokens, usage.cached_input_tokens ?? 0));
  return ((usage.input_tokens - cached) * rate.input + cached * rate.cachedInput + usage.output_tokens * rate.output) / 1_000_000;
}
