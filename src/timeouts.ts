export class AgentTimeoutError extends Error {
  readonly code = 'AGENT_TIMEOUT';
  constructor(readonly agent: string, readonly timeoutMs: number) {
    super(`${agent} timed out after ${timeoutMs / 1000} seconds`);
    this.name = 'AgentTimeoutError';
  }
}
export function agentTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
  const seconds = Number(env.AGENT_TIMEOUT_SECONDS ?? 600);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error('AGENT_TIMEOUT_SECONDS must be an integer from 1 to 3600');
  return seconds * 1000;
}
// Race against cancellation as well as forwarding the signal to the SDK. This
// bounds the wait even if a provider does not promptly finish its event stream.
export async function withAgentTimeout<T>(agent: string, timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  parent?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new AgentTimeoutError(agent, timeoutMs)), timeoutMs);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([aborted, operation(controller.signal)]);
  } catch (error) {
    // An operator stop must always stop the run, even alongside a deadline.
    parent?.throwIfAborted();
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
