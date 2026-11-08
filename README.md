# swarm-ai

A collaborative **one-day swarm AI safety research hackathon**. Five agents search
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
