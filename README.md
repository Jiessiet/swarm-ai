# swarm-ai

A collaborative **one-day swarm AI safety research hackathon**. Five agents by default search
online sources, discuss research ideas, challenge each other's assumptions, and
converge on a small empirical project a team can implement and evaluate in eight
hours. The output is a cited research brief with a hypothesis, baseline,
intervention, metrics, analysis plan, schedule, limitations, fallback and pitch.

The hackathon is now the default CLI and dashboard task. The original
shared-resource and shared-fund experiments remain selectable alternatives.

## Run the hackathon

Requires Node.js 20.18.1+ and npm:

```bash
npm ci
npm run demo        # deterministic demo; no credentials or internet calls
npm run dashboard   # http://127.0.0.1:3333
```

In the dashboard choose **Swarm AI safety · hackathon**, inspect the five research
roles and model assignments, then start **Demo** or **Live · Adaption inference**.
Live mode requires `ADAPTION_API_KEY` in the server environment. Credentials are
never entered in the browser. For the CLI:

```bash
# Configure ADAPTION_API_KEY in your shell/secret manager first.
npm start
# Optional additional critique rounds (3–6 collaboration rounds in total):
TASK=hackathon ROUNDS=4 npm start
```

`.env.example` documents settings; it is not loaded automatically. Configure
variables in your shell or use your runtime's environment-file support.

## How the team works

The agents have five complementary roles: literature scout, safety analyst,
experiment designer, skeptical reviewer and synthesis lead. Each has a persistent
Codex SDK thread and its own selected Adaption model. Defaults use five different
low-cost catalog models; dashboard dropdowns swap assignments when needed.
`AGENT_MODELS` accepts five distinct catalog model IDs.

1. **Research:** discover and inspect relevant work on swarm / multi-agent AI safety.
2. **Propose:** formulate narrow questions with a falsifiable hypothesis and controls.
3. **Critique:** challenge novelty, confounds, cost, feasibility and evaluation design.
4. **Synthesize:** the lead receives the entire shared discussion and produces one
   research brief, including rejected alternatives and a schedule capped at eight hours.

Extra rounds repeat critique. Speakers rotate, and every validated contribution
is shared before the next agent responds. Research roles have a common goal;
there are no simulated fund contributions, allocations, earnings or peer grades
in this task. Expected findings are hypotheses, **not measured results**. This
runner plans the research project; it does not automatically execute the proposed
empirical experiment or train models.

## Timeouts and continuing a run

Each model turn now has a **10-minute** deadline (previously two minutes). Set
`AGENT_TIMEOUT_SECONDS` to an integer from 1 to 3600 before starting the CLI or
server, for example:

```bash
AGENT_TIMEOUT_SECONDS=900 npm run dashboard
```

In the hackathon, a timed-out turn is recorded and skipped so teammates can
continue. The agent can participate again in the next round. Already retrieved
sources and completed contributions are kept, and later agents see which turns
were missed. The dashboard, saved traces, JSON and Markdown show skipped turns.

Provider errors and invalid responses are recorded and retried once with error
feedback. If the retry also fails, only that turn is skipped; the agent returns
in later rounds. Invalid citations, malformed briefs and exhausted web budgets
follow the same bounded recovery, without admitting invalid output or exceeding
research budgets. Errors appear in team observations, the dashboard and exports.
Retries can add model calls and cost.

If the synthesis lead fails or times out, another agent is asked to write the brief. If
all five synthesizers fail or time out, the run saves a clearly labeled **partial
record** with contributions and sources, and marks the saved run `partial`.
Stop still cancels the whole run immediately. Invalid run settings still fail
before the hackathon starts.
The retained resource/fund tasks keep their strict participant-failure behavior.

## Editable communication network

The dashboard is a dark research observatory inspired by [AI Safety HOT](https://aisafetyhot.com/en), with an animated swarm and a functional network editor.

- Start with five agents; select **2–100 agents** before a run. Models may repeat across any number of agents. Default roles cycle through the research specialties, and every agent has a unique name (A–Z, AA–CV).
- Choose **Mesh**, **Hub**, **Ring**, **Pipeline →**, or **Clusters**. Mesh/ring/hub/cluster links are bidirectional; the pipeline is directed.
- Select a node to inspect its role, model, incoming channels and outgoing recipients. Toggle **Receives from** checkboxes to edit incoming channels.
- Use **Connect nodes**, then select a source and a destination to toggle a channel. **Two-way** toggles both directions. Select a link and choose **Remove this link** to disconnect it.
- Drag nodes to arrange the diagram, or focus a node and use arrow keys. Positions change the layout; channels change communication.
- During a run, graph edits apply to the **next decision**. The in-flight response uses the network snapshot it started with. Agent count and models are fixed until the run ends. Roles remain editable.
- Contributions and retrieved sources are visible only to the agent itself and its incoming neighbors. Cited sources can be explicitly relayed through a neighbor's validated contribution. Synthesis has no global visibility bypass; disconnected groups may produce an incomplete perspective.
- In an agent's inspector, edit **Role title** and **Role instructions**, then choose **Apply role**. This works before and during a run. Live changes apply to the next decision (including retries); a response in progress keeps the role snapshot it started with. Role edits do not change its model, network links, turn order, or the synthesis output schema.
- Role changes are validated, revisioned and recorded as `hackathon.roles` events. Contributions record the role used at decision time; final JSON includes the final role assignments. Unsaved edits survive incoming status updates.
- Research decisions use fresh SDK threads so network-restricted context does not remain in a persistent model conversation. Own validated contributions remain visible as the agent's work history.
- The operator retains the full archive. Initial topology, live changes, revisions and final topology are recorded. Operator visibility does not imply agent visibility.
- Ambient particles are decoration. Brighter traveling pulses correspond to actual validated contributions and their recipients. **Pause motion** and the system reduced-motion preference stop ambient animation.
- Edit the research objective above the graph before starting a live run. Demo mode uses deterministic example research and performs no browsing or model calls.

`GET /network` returns the active research run's graph. `POST /network` accepts `{runId, revision, network: {count, edges: [{from, to}]}}`; indices are zero-based. Stale revisions, invalid edges and changes to team size are rejected. This API retains the dashboard's local host and origin checks.

## Internet research

Agents explicitly request `search` and `read` actions in their structured replies.
The environment performs the request and returns evidence or an explicit error
on their next turn. Each agent has up to **four web actions per run** (20 for the
team), separate from its discussion turns. Sources receive IDs, titles, URLs,
retrieval times and a `search-result` or `page` label. All teammates receive the
source registry. Contributions and the final brief may cite only registered IDs.
This verifies citation IDs, not the truth or relevance of every model claim.

- **Without another key:** search queries go to Crossref's public scholarly API.
  Results may be metadata/abstracts only and are labeled as discovery results.
- **General web search:** configure `BRAVE_SEARCH_API_KEY` on the server to use
  Brave Search instead. Search API fees are not included in model-cost estimates.
- **Read:** agents can request public HTTPS HTML/text pages, including abstract
  pages. Reads follow at most four redirects, limit downloads to 1 MB, and return
  at most 12,000 readable characters. PDFs are unsupported; use their abstract
  page. Paywalls, bot checks and truncated pages remain evidence gaps.

Research requests honor standard HTTP(S) proxy variables. Destination checks
reject private/local addresses and check redirects. When local DNS cannot resolve
an external host, a fixed Google DNS-over-HTTPS lookup validates its public IPv4
addresses. Network policy must allow the chosen search service, `dns.google` when
needed, and the pages being read. These checks are not adversarial OS isolation.

Webpage text is untrusted evidence, never agent instructions. Tool results, errors
and contributions appear in the public trace. Browsing is mediated by the task,
so it does not depend on Adaption implementing a native web-search tool. Existing
Codex command sandboxing and native web-search settings remain unchanged.

## Results and dashboard

The dashboard shows research roles, model assignments, estimated costs, live
conversation, searches, sources, phase progress and the final readable brief.
**Download research brief (.md)** exports the report. Completed CLI/dashboard
runs also write JSON and Markdown to ignored `results/`.

Every run persists `traces/<run-id>/run.json`, public `events.jsonl`, per-agent
private SDK/prompt logs, and an operator log. Saved trajectories survive server
restarts. The trusted local operator can inspect private traces; agents receive
shared validated contributions and retrieved sources through task observations.
This separation is at application level, not an OS security boundary. Codex
processes running as the same user may still read workspace files.

The server binds to loopback (`127.0.0.1`, default port 3333). One run can be active
at a time. Stop cancels agent turns and in-progress web requests. The live event
buffer holds 2,000 events and the browser holds 400 feed entries; complete saved
traces remain on disk. Trace storage is unbounded and can contain model-visible
source/tool output. The viewer shows SDK-visible events, not hidden chain-of-thought.

## Architecture and validation

```text
CLI / local dashboard → tasks/hackathon/environment.ts
                       ↔ shared discussion + source registry
                       ↔ Codex SDK threads → Adaption Responses API
                       ↔ Crossref / Brave search + public-page reader
                       → JSON traces + Markdown research brief
```

Task instructions, schemas, deterministic demo and rules live in `tasks/hackathon/`.
`src/experiments.ts` selects tasks; `src/providers.ts` configures Codex/Adaption;
`src/server.ts` serves the local observatory; `web/` renders conversations and briefs.

```bash
npm run check
npm test
```

Tests cover collaboration/context isolation, research-action budgets, web errors,
cancellation, registered citations, the eight-hour schedule limit, demo behavior,
public traces, existing games and dashboard endpoints.

**Live Adaption/Codex compatibility remains unverified without credentials.**
Codex sends structured outputs, tool definitions, conversation history and streaming
requests. A shared Responses endpoint format does not prove full compatibility.
`ADAPTION_BASE_URL` must be an HTTPS API base including `/api/v1`, without
`/responses`. No OpenAI API key or ChatGPT login is used by this runner.

Model pricing in `config/models.json` is in Adaption credits per million tokens.
Hackathon estimates allow for research-action turns and synthesis but are planning
figures, not spending caps or provider invoices. Live reported SDK usage is
converted to credits separately; demos cost zero and their conversations are scripted.

## Original tasks

```bash
TASK=shared-resource npm run demo
TASK=shared-fund CONDITION=both ROUNDS=3 npm run demo
```

The original Python `experiment.py` is a separate standalone experiment requiring
its pinned Python dependencies and `ADAPTION_API_KEY`. See
[tasks/README.md](tasks/README.md) and
[tasks/shared-fund/README.md](tasks/shared-fund/README.md) for the retained games.


`GET /roles` returns the active run's role settings. `POST /roles` accepts
`{runId, revision, roles: [{title, instructions}, ...]}`. Titles are required
(1–80 characters); instructions may contain up to 2,000 characters. Exactly one
assignment per agent is required. Stale revisions and mismatched run IDs are rejected.


## What the agents actually did

The dashboard's **Activity & analysis** section explains each research run using
its saved trace. It updates during a run and also works for completed, partial,
stopped and failed runs selected in the archive. It makes no extra model calls.

- A run-wide summary covers participation, research evidence, context exposure,
  network/role edits, retries, timeouts and the final outcome. Evidence buttons
  jump to the supporting recorded actions.
- A timeline shows actions by agent and elapsed time. Filter by agent involvement
  or action type; scrub, step, or replay to inspect the whole run.
- The read-only swarm replay shows the topology at each decision, routes for a
  contribution, and peer work appearing in a decision context. Selecting an action
  highlights its actual agent in the live graph when it belongs to that run.
  Selecting a live node filters the report, and agent cards connect back to nodes.
- Details show the complete contribution or tool request/result, the role used,
  source links, recorded recipients, and agents whose later contexts included
  that work. Contributions present in the final synthesis context and sources
  cited in the brief are explicitly linked to that outcome.
- **Open recorded event** jumps to its saved archive entry; **Read final research
  brief** opens the matching run's brief. Archive replay never changes a live
  communication graph or role assignment.
- Per-agent cards summarize actual contribution counts, searches/reads, distinct
  citations, peer context, role history, failures, retries, timeouts, reported
  tokens and median recorded decision latency. Unknown metrics remain unknown.
- The report distinguishes availability from observed context exposure. Neither
  proves agreement, private intent or causal influence. The research task plans
  an experiment; it does not run the proposed empirical experiment. Demo activity
  remains explicitly labeled simulated.

`GET /runs/:id/analysis` returns the sanitized computed report.
`GET /runs/:id/analysis.md` downloads the complete report and action history.
The analysis combines public records, each agent's context/usage metadata and
operator terminal errors. It does not include private prompts, raw SDK messages
or reasoning text, and preserves the existing public/private trace endpoints.
Older runs with no recorded topology show that gap instead of invented edges.


The behavior section uses a compact trajectory layout inspired by
[SwarmHarm's trajectory explorer](https://swarmharm.com/?case=r136&phase=1):
a selected-record panel beside a read-only swarm view, one timeline and playback
bar below, and an always-visible short run summary. Detailed behavior analysis,
per-agent metrics, complete history and interpretation limits are expandable.
The replay supports **Orbit** and **Flow** layouts; **Outcome** opens the final
brief or selects the recorded failure/partial outcome when no brief exists.


## Shared models, larger swarms and saved roles

- In **Models & experiment setup**, each model dropdown is independent. Selecting
  the same model for another agent no longer swaps the first agent's assignment.
  **Model for all agents → Apply to all** sets a single model for the whole team.
- The research task accepts **2–100 agents**. Agent count and model changes still
  happen between runs. CLI users can set `AGENT_COUNT=100`; `AGENT_MODELS` may
  contain repeated catalog model IDs, one per agent.
- Teams of more than ten agents start with a bidirectional ring to keep the
  default network sparse. All existing topology presets, including a full
  100-agent mesh (9,900 directed channels), remain available.
- For more than twenty agents, the graph uses a grid and shows the selected
  agent's channels. All nodes remain selectable, and **Inspect agent** provides
  direct access to every role and connection. The replay uses the same approach;
  its timeline scrolls, and large graph snapshots are deduplicated in reports.
- To reuse roles, enter a **Preset name** above the graph and choose **Save current
  roles**. This saves the applied role titles and instructions for the entire
  team. Saving the same name updates that preset.
- Choose a **Saved role team → Load roles** to restore its team size and roles
  before a run. Loading preserves model choices and the research objective.
  During a run, a preset with the same agent count can be applied live; it follows
  the existing next-decision rule. A different team size must wait until the run ends.
- Presets persist in `data/role-presets.json` in the sandbox folder, across browser
  refreshes and server restarts. This local library is ignored by Git. Set
  `ROLE_PRESET_FILE` if a different storage path is needed. Browser origin/port
  changes do not lose presets when servers use the same library file.

The local role library API is `GET /role-presets`, `GET /role-presets/:id`, and
`POST /role-presets` with `{name, roles: [{title, instructions}, ...]}`. It uses the
same localhost/origin checks as the rest of the dashboard, validates every role,
and writes the library atomically.
