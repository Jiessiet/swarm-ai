import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignModels, estimatePricing, usageCost, catalog } from '../src/pricing.js';
import { adaptionHarnessOptions } from '../src/providers.js';
test('uses five different cheaper models and honors an explicit model per thread', () => {
  const models = assignModels(5); assert.equal(new Set(models).size, 5);
  assert.ok(!models.includes('qwen3.5-397b')); assert.ok(!models.includes('glm-5.2'));
  for (const model of models) assert.equal(adaptionHarnessOptions({ ADAPTION_API_KEY:'test', ADAPTION_MODEL:model }).thread.model,model);
  assert.deepEqual(assignModels(2,['deepseek-v4-flash','deepseek-v4-flash']),['deepseek-v4-flash','deepseek-v4-flash']);
  assert.throws(()=>assignModels(1,['unknown']));
});
test('quotes all discussion, decision and review calls, uses credits and zero demo billing', () => {
  const models=assignModels(5); const live=estimatePricing('shared-fund',10,models,'adaption');
  assert.equal(live.calls,105);assert.equal(live.perAgent.length,5);
  for(const agent of live.perAgent)assert.equal(agent.credits,(agent.inputTokens*agent.inputRate+agent.outputTokens*agent.outputRate)/1e6);
  assert.equal(live.totalCredits,live.perAgent.reduce((sum,a)=>sum+a.credits,0));
  assert.ok(estimatePricing('shared-fund',11,models,'adaption').totalCredits>live.totalCredits);
  assert.equal(estimatePricing('shared-fund',10,models,'demo').expectedCharge,0);
  assert.ok(catalog.unit.includes('credits'));assert.ok(live.assumptions.includes('not a cap'));
});
test('reported usage cost applies cached rates only to cached input tokens',()=>{
  const rate=catalog.models[0];
  assert.equal(usageCost(rate.id,{input_tokens:1000000,cached_input_tokens:250000,output_tokens:1000000}),.75*rate.input+.25*rate.cachedInput+rate.output);
});
