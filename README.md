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

## Local agent observatory

```bash
npm run dashboard
```

Open **http://127.0.0.1:3333** in your local browser. To use this on your own
machine, check out `feat/agent-environment`, run `npm ci`, then start the dashboard.
The server binds to loopback only. Set `PORT` to change the default port.

Choose **Demo** to see simulated activity without credentials, or **Live · Adaption
inference** to run Codex threads against Adaption. Configure `ADAPTION_API_KEY`
in the server environment before starting live mode; credentials are never
entered into the browser. The same `ADAPTION_MODEL` and `ADAPTION_BASE_URL` settings
used by the CLI apply. Live inference compatibility remains unverified.

The dashboard shows active agents, observations, streamed SDK messages, tool
activity when emitted, usage, allocations, remaining resources, and a decision
ledger. Filter the activity feed by agent or turn off follow mode to inspect
older events. Stop cancels the active turn and environment run. Completed runs
save results to `results/`. One run can be active at a time.

Events use server-sent events with reconnect and a bounded in-memory replay
buffer of 2,000 events; the browser retains up to 400 feed entries. Reload restores
recent events while the server remains running. Restarting the server clears the
live buffer. This is a local development viewer, not a hosted multi-user service.

The live feed exposes events the Codex SDK actually emits, including item updates
and completed items; it does not promise a per-token text delta or expose hidden
chain-of-thought. Demo text chunks and usage are simulated and labeled. Agents
interact through shared observations and prior decisions, not direct chat with
one another. Execution remains sequential to preserve resource consistency.

## Editing the task

Task definitions live in **`tasks/shared-resource/`**. Edit `instructions.md` for
the prompt, `definition.ts` for defaults and output schema, and `environment.ts`
for the simulation rules. The CLI and dashboard load the same task definition;
restart after changes. See [tasks/README.md](tasks/README.md) for the folder map.

## Private and public traces

Every CLI and dashboard run writes an append-only local trajectory:

```text
traces/<run-uuid>/
  run.json                         # settings, agent IDs, run status
  public/events.jsonl              # shared messages and validated decisions
  agents/agent-1/private.jsonl      # only this agent's prompts/SDK/tool events
  agents/agent-2/private.jsonl
  operator.jsonl                   # run-level errors for the local operator
```

Set `TRACE_DIR` before starting to choose another storage directory. Traces are
ignored by Git, and files/directories use owner-only permissions where supported.
Events include run ID, sequence ID, timestamp, visibility, type, agent and data.
Each event is appended before live broadcast, including during stopped or failed
runs. Completed result summaries also remain in `results/`. The manifest status
is the last recorded lifecycle event; an abrupt process kill can leave `running`
in a saved manifest. Trace storage is not bounded; remove old run folders when
no longer needed. Trace files can contain model-visible source and tool output.

Agents publish conversation through the `message` field of their validated
response; an empty message stays silent. Other agents receive those messages in
`sharedMessages`, plus public decision history. Raw model output, observations,
prompts and tool events are private by default and are never copied into another
agent's observation. A decision's `reason` is deliberately public. Invalid model
responses are not published to the shared channel.

In the dashboard, use **Saved trajectories**, select a run, then choose **Public
shared trace** or one agent's **private + public** view. Messages and decisions
appear as readable steps; raw events are collapsed for inspection. The live feed
has separate public/private/operator filters. Saved runs are read from disk and
remain available after restarting the dashboard. `GET /runs` lists manifests;
`GET /runs/<uuid>` returns public events; `?agent=agent-1` adds only that agent's
private events. These endpoints are for the trusted local operator, not agents.

This is application-level visibility separation, not an OS security boundary.
The local operator can inspect all logs. Tool-enabled Codex processes running as
the same local user may be able to read trace files directly; do not treat this
as adversarial agent isolation. Use separately sandboxed processes/filesystems
before running agents that must be prevented from reading one another's files.
Private traces contain SDK-visible events, not hidden chain-of-thought.
