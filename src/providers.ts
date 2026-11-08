import { Codex } from '@openai/codex-sdk';
import type { CodexOptions, ThreadOptions } from '@openai/codex-sdk';
import type { Agent, Observer } from './environment.js';
import { instructions, decisionSchema, baselineDecision } from '../tasks/shared-resource/definition.js';
export function baseline(name: string): Agent {
  return { name, async decide(o) { return baselineDecision(o); } };
}
// Codex owns threads, tools, and the agent loop; Adaption supplies inference.
export function adaptionHarnessOptions(env: NodeJS.ProcessEnv = process.env): { client: CodexOptions; thread: ThreadOptions } {
  if (!env.ADAPTION_API_KEY?.trim()) throw new Error('Set ADAPTION_API_KEY before starting the Codex harness');
  const baseUrl = new URL(env.ADAPTION_BASE_URL ?? 'https://api.prod.adaptionlabs.ai/api/v1');
  if (baseUrl.protocol !== 'https:') throw new Error('ADAPTION_BASE_URL must use HTTPS');
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || /\/responses\/?$/.test(baseUrl.pathname))
    throw new Error('ADAPTION_BASE_URL must be an API base URL without credentials, query, fragment, or /responses');
  return {
    client: { config: {
      model_provider: 'adaption',
      model_providers: { adaption: {
        name: 'Adaption', base_url: baseUrl.toString().replace(/\/$/, ''),
        env_key: 'ADAPTION_API_KEY', wire_api: 'responses', requires_openai_auth: false,
        supports_websockets: false, request_max_retries: 0, stream_max_retries: 0,
      } },
      model_supports_reasoning_summaries: false,
    } },
    thread: { model: env.ADAPTION_MODEL ?? 'qwen3.5-397b', sandboxMode: 'read-only', approvalPolicy: 'never', networkAccessEnabled: false, webSearchMode: 'disabled' },
  };
}
export function adaptionAgent(name: string, observe: Observer = () => {}): Agent {
  const options = adaptionHarnessOptions();
  const thread = new Codex(options.client).startThread(options.thread);
  return { name, async decide(o, signal) {
    const prompt = `${instructions}\nAgent: ${name}\n${JSON.stringify(o)}`;
    observe({ type: 'agent.prompt', agent: name, data: { prompt } });
    const { events } = await thread.runStreamed(prompt, {
      signal: AbortSignal.any([AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]),
      outputSchema: decisionSchema(o),
    });
    let response = '';
    for await (const event of events) {
      observe({ type: 'sdk.' + event.type, agent: name, data: event });
      if (event.type === 'item.completed' && event.item.type === 'agent_message') response = event.item.text;
      if (event.type === 'turn.failed') throw new Error(event.error.message);
      if (event.type === 'error') throw new Error(event.message);
    }
    return JSON.parse(response);
  } };
}
