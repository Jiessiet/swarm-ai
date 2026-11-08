# swarm-ai

Multiple agents using the **Codex harness / TypeScript SDK**, with **Adaption
providing model inference**:

```text
Shared-resource environment → Codex SDK threads → Adaption Responses API → model
                              tools + agent loop
```

Codex manages each agent's thread and tool loop. The configured custom provider
sends inference to `https://api.prod.adaptionlabs.ai/api/v1/responses`, using
`ADAPTION_API_KEY` as bearer authentication. No OpenAI model key or ChatGPT login
is required. There is no separate direct-Adaption agent or Python bridge in this
runner. The original Python `experiment.py` remains as a standalone experiment.

## Setup and run

Requires Node.js 20+ and npm:

```bash
npm ci
# Configure ADAPTION_API_KEY in your shell or environment secret settings.
npm start
```

Default: three Codex-harness agents, Adaption model `qwen3.5-397b`, three rounds,
12 shared tokens, maximum allocation four tokens. Set `ADAPTION_MODEL` to another
model you can access, or an Adaption inference stack such as `stack:your-slug`.

For example, after configuring the key:

```bash
ADAPTION_MODEL=qwen3.5-397b ROUNDS=5 STARTING_TOKENS=30 npm start
```

`.env.example` lists settings; it is not loaded automatically. Set variables in
your shell or use your runtime's environment-file support. Do not commit keys.
`ADAPTION_BASE_URL` optionally overrides the HTTPS API base (include `/api/v1`,
not `/responses`). Codex appends `/responses` itself. Provider selection is
explicit, so the runner does not fall back to OpenAI inference.

## Offline verification

```bash
npm run demo
npm run check
npm test
```

The demo uses deterministic baseline participants and makes no API calls.
Tests cover resource conservation, turn order, invalid decisions, history
isolation, exhaustion, provider errors, provider routing and configuration checks.

## Environment behavior

Each agent has its own Codex thread, reused across turns. Turns run sequentially
against the current resource pool, with the first mover rotating each round.
Decisions must match the allowed integer allocation and include a reason.
Invalid decisions or provider errors stop the run. Completed runs save JSON
settings, allocations, reasons and remaining resources in ignored `results/`.

Threads use read-only sandboxing, disabled tool network/web search and no approval
prompts. The inference connection to Adaption is independent of tool network
access. Codex remains tool capable; use an appropriate workspace because read-only
access can still expose files to the model. Turns have a two-minute deadline.

## Compatibility status

Configured against Codex's documented custom-provider `wire_api = "responses"`
and Adaption's documented Responses endpoint. Type checking, six tests and the
offline demo pass. **Live Adaption inference has not been verified** because this
workspace has no configured API key. Codex sends tool definitions, structured
output requirements, conversation items and streaming requests; the selected
Adaption model/stack must support those request shapes and return compatible SSE
events and tool calls. A shared endpoint format alone does not prove complete
harness compatibility. A rejected field or tool shape needs compatibility work;
it should not be silently removed if doing so breaks the Codex tool loop.

References:
- [Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript)
- [Codex custom provider configuration](https://developers.openai.com/codex/config-reference)
- [Adaption Responses API](https://docs.adaptionlabs.ai/api/resources/responses/methods/create)

`src/providers.ts` configures Codex with Adaption; `src/environment.ts` owns the
simulation; `src/cli.ts` assembles the agents. This is a shared-resource experiment
harness, with no training or model adaptation feedback loop yet.
