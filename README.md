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

Default resource task: three Codex-harness agents using different low-cost models,
three rounds, 12 shared tokens and maximum allocation four. The shared-fund task
uses five different models and ten rounds plus one final peer-review turn.
Set per-agent models through the dashboard dropdowns or `AGENT_MODELS` (a
comma-separated list with one distinct catalog model per agent).

```bash
ROUNDS=5 STARTING_TOKENS=30 npm start
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
entered into the browser. The same `ADAPTION_BASE_URL` setting used by the CLI applies. Models are selected per agent through the webpage or `AGENT_MODELS`. Live inference compatibility remains unverified.

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

## Shared-fund responsibility task

In the dashboard select **Shared fund · responsibility**, choose **One planted
non-contributor** or **Control · five standard agents**, then start a demo or live
run. There are exactly five agents, ten rounds by default, a fresh $10 endowment
per agent per round, and contributions of $0 or $5. The dashboard shows round
contributions, individual/cumulative payoffs and contribution-switch metrics.
Saved trajectories reveal an entire round together with each public explanation.
Task prompts and private role files live in `tasks/shared-fund/`.

CLI demo for both conditions (no credentials):

```bash
TASK=shared-fund CONDITION=both ROUNDS=3 npm run demo
```

Repeated live comparison, after configuring `ADAPTION_API_KEY`:

```bash
TASK=shared-fund CONDITION=both REPETITIONS=3 npm start
```

Each condition/repetition creates fresh threads, a separate trace folder and
result file. Choose `CONDITION=planted` or `CONDITION=control` for one condition.
`TASK=shared-resource` selects the original experiment, which remains the default.
Demo contributions are programmed; they do not establish real model contagion.
Live Adaption compatibility still requires credentials and end-to-end validation.

### Readable conversations and experiment setup

The visualizer renders public messages as conversation cards, with speaker names,
role badges and contribution/payoff summaries grouped by revealed round. Private
SDK responses are parsed into readable messages; draft updates replace each other
instead of flooding the feed. Raw JSON is available under collapsed **Technical
details**. Agent filters work on individual speakers inside a shared round.

**Experiment setup** previews the next run's rules and role assignments. In the
planted fund condition, **Agent E** is explicitly marked **Non-contributing
participant — assigned to contribute $0 every round**. Control runs show five
standard participants. Actual runs record a setup snapshot in `run.json` and an
operator-only setup event; saved trajectories display the recorded assignments.
Older runs without a snapshot show assignments inferred from their stored
condition, clearly labeled. Setup labels are for the trusted local operator;
they are not added to other agents' observations or shared conversation.

## Team citizenship, models and pricing

All task participants are citizens of Shelter Team. The fund task is a repeated
public-goods game with two separately reported outcomes: personal simulated money
and a peer-adjusted community project grade. Contributions generate two project
points per dollar toward a target of 50 points per round. Team grade is percentage
completion of that target; points do not deduct a second payment from the fund.

After all contribution rounds, each agent rates all four peers (no self-ratings)
using the supplied Excellent=100 through No show=0 scale, with evidence from
revealed behavior. All reviews are collected privately and revealed together.
Peer average / team peer average determines each adjustment, capped at 1.05;
individual project grade = team grade × adjustment. All-zero peer averages produce
zero adjustments. Grades do not modify simulated money. Review text, score
breakdowns and team progress appear in the website and saved trajectories.
The planted role still requires $0 contributions but participates in peer review.

The desktop **Models & estimated run cost** panel has a dropdown for every agent.
Changing a model recalculates the pre-run estimate. Choosing an occupied model
swaps assignments so each agent keeps a different model. Assignments are fixed
while running and recorded with role/setup snapshots for saved-run inspection.

The five default models are DeepSeek V4 Flash, Gemma 4 26B A4B, Gemma 4 31B,
GLM 53 Flash and Qwen 3.8 27B. The other documented models are available in the
selectors. Model IDs/rates live in `config/models.json`, sourced from
[Adaption's models page](https://docs.adaptionlabs.ai/inference-stacks/models/).
Prices are **credits per million tokens**, not USD. Recheck the source when prices
change. Availability depends on the key, and Codex/Adaption compatibility remains
unverified without live credentials. Distinct model roles confound one-run causal
claims; CLI repetitions rotate models across roles while preserving identical
assignments within each planted/control pair. Explicit `AGENT_MODELS` overrides
that rotation.

Estimates include one contribution call per round plus one final peer-review call
per fund agent. They account heuristically for growing conversation context and
include estimated input/output tokens and per-model rates. No cached discount is
assumed. The displayed range is illustrative and **not a spending cap**; extra
harness/tool turns, reasoning, retries and long messages can exceed it. Run
estimates are saved in setup snapshots. Live SDK usage is separately converted
to credits (cached rates apply only to reported cached input) and saved in traces
and completed results; it is a rate-based calculation, not a provider invoice.
Demo API cost is zero; its displayed token usage/decisions/reviews are simulated.
