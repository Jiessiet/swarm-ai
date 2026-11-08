import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptionHarnessOptions } from '../src/providers.js';
test('routes Codex inference to Adaption without OpenAI authentication', () => {
  const options = adaptionHarnessOptions({ ADAPTION_API_KEY: 'test-secret', ADAPTION_MODEL: 'stack:my-model' });
  assert.equal(options.client.config?.model_provider, 'adaption');
  const provider = (options.client.config as any).model_providers.adaption;
  assert.equal(provider.base_url, 'https://api.prod.adaptionlabs.ai/api/v1');
  assert.equal(provider.env_key, 'ADAPTION_API_KEY');
  assert.equal(provider.wire_api, 'responses');
  assert.equal(provider.requires_openai_auth, false);
  assert.equal(options.thread.model, 'stack:my-model');
  assert.ok(!JSON.stringify(options).includes('test-secret'));
});
test('fails before spawning Codex when credentials or endpoint are invalid', () => {
  assert.throws(() => adaptionHarnessOptions({}), /ADAPTION_API_KEY/);
  for (const url of ['http://example.com', 'https://example.com/responses', 'https://example.com?key=secret'])
    assert.throws(() => adaptionHarnessOptions({ ADAPTION_API_KEY: 'test', ADAPTION_BASE_URL: url }));
});
