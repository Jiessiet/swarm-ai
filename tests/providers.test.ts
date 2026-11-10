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

test('fresh research contexts start a new SDK thread for every decision', async t => {
  const { Codex } = await import('@openai/codex-sdk');
  const { modelAgent } = await import('../src/providers.js');
  const priorKey=process.env.ADAPTION_API_KEY;
  process.env.ADAPTION_API_KEY='offline-test';
  let threads=0;
  const prompts:string[]=[];
  t.mock.method(Codex.prototype,'startThread',()=>{
    threads++;
    return {async runStreamed(prompt:string){prompts.push(prompt);return {events:(async function*(){yield {type:'item.completed',item:{type:'agent_message',text:'{"ok":true}'}};})()};}};
  });
  try {
    const researcher=modelAgent('Researcher','Research safely',()=>({}),()=>{},'deepseek-v4-flash',true);
    await researcher.decide({history:['Peer A evidence']});
    await researcher.decide({history:[]});
    assert.equal(threads,2);
    assert.match(prompts[0],/Peer A evidence/);assert.ok(!prompts[1].includes('Peer A evidence'));
  } finally {if(priorKey===undefined)delete process.env.ADAPTION_API_KEY;else process.env.ADAPTION_API_KEY=priorKey;}
});
