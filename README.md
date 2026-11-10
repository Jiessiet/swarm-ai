# Swarm Chamber

A local workbench for configuring AI agent networks and following their work.
Start with five agents, set a research objective, assign roles and models, and
edit the communication graph. Live role and connection changes apply to the next
decision. The trajectory connects recorded contributions to their actual nodes,
recipients, contexts and final synthesis.

## Start

Requires Node.js 20.18.1 or later.

```bash
npm ci
npm run dashboard  # http://127.0.0.1:3333
npm run demo       # scripted CLI run, no model or web calls
```

The dashboard opens in **Demo** with five agents, three rounds and a mesh. The
**Swarm** graph is visible immediately. **Spiral** adds an interactive 3D
half-dome view; **Network** provides a simple
view of the same editable graph. Detailed models, role presets and agent
settings are expandable. Starting a fresh page opens a new setup; an active run
reconnects, and completed runs remain available in the archive.

Choose **Live · Adaption** to use model inference. Set `ADAPTION_API_KEY` in the
server shell before launching. Credentials are not entered in the browser.
The CLI uses live inference with `npm start`. For example:

```bash
AGENT_COUNT=5 ROUNDS=4 OBJECTIVE='Investigate a coordination hypothesis and propose a controlled study.' npm start
```

`.env.example` documents settings; it is not loaded automatically. Model pricing
in `config/models.json` is in Adaption credits. Estimates are planning figures,
not spending caps or invoices. The recorded SDK usage is priced separately.
Repeated model IDs are supported; **Apply to all** assigns one model to the team.

## Configure a network

- Team size is **2–100**, chosen before running. Larger teams default to a sparse
  bidirectional ring above ten agents. Names remain unique through Agent CV.
- **Mesh, Hub, Ring, Pipeline and Clusters** supply starting topologies. A full
  100-agent mesh has 9,900 directed channels. Above twenty agents, all nodes stay
  selectable while only the selected node's channels are displayed.
- Select a node or use **Inspect agent**. Expand **Edit role** to change its title
  and instructions. Expand **Connections** to edit incoming channels.
- **Connect nodes** toggles a channel by selecting its source and destination.
  **Two-way** toggles both directions. A selected edge can also be removed.
- Drag nodes to arrange the graph, or focus a node and use arrow keys. Layout is
  cosmetic; edges govern communication. **Spiral** adds a perspective 3D half
  dome: drag empty space to rotate and tilt, drag an agent to reposition its
  action spiral, Alt + drag to raise it, or use the camera buttons to zoom and reset.
  Hub networks place the hub above its peers. Shift + arrow
  keys move a focused agent, and Alt + Up/Down changes its elevation; arrow keys rotate the view. Camera and position
  changes preserve the communication edges; **Connect nodes** edits them.
- **Saved role teams** stores applied titles and instructions across browser
  refreshes and server restarts. Loading preserves models and the objective.
  A matching-size preset can be applied live; resizing waits until the run ends.

Roles and edges are revisioned. An in-flight response retains its original
snapshot; subsequent decisions and retries use the updated configuration. Team
size and models remain fixed during a run. Fresh SDK threads at each research
decision prevent inaccessible peer history from surviving graph changes.

**Swarm** and **Network** retain the 2D editor without a particle backdrop.
**Spiral** is also available in the linked trajectory panel alongside Orbit
and Straight. Agent action markers come from recorded events; selecting one
updates the timeline and record detail. Published and context routes rise as
3D arcs, and replay uses the network snapshot at the selected event. Empty
spiral guides indicate where a future run will record actions. Network presets
change both the real communication graph and its initial spatial arrangement.
For large teams, markers are sampled and selected events are always retained;
all events remain available through the timeline and record list. Playback
honors reduced motion, and camera movement is controlled by the user.

## Research workflow

The single built-in workflow is **research → proposal → critique → synthesis**.
Additional rounds repeat critique. The objective and roles are configurable;
the output remains a structured research plan with evidence, a hypothesis,
controls, evaluation criteria and an eight-hour schedule. Proposed experiments
are not executed automatically. Different tools or output formats require a
compatible task module. The scripted demo illustrates the workflow with example
research; it does not reason about the edited objective or browse the web.

Each live agent can request up to four mediated search/page-read actions per
run. Search uses Crossref scholarly metadata by default, or Brave when
`BRAVE_SEARCH_API_KEY` is set. Public HTTPS HTML/text pages can be read with
bounded redirects, download size and returned text. PDFs, inaccessible pages and
search metadata remain evidence limitations. Source IDs are validated, but that
is not independent verification of each cited claim.

Incoming directed edges determine visible peer contributions and sources.
Validated citations can relay source records through a visible contribution.
Synthesis follows the same routing rules; it has no global context bypass.
Disconnected groups may therefore have different information available.

Model turns default to a 600-second deadline, configurable from 1 to 3600 with
`AGENT_TIMEOUT_SECONDS`. Provider and validation errors retry once, then skip the
turn so other agents can continue. Timed-out agents may return in later rounds.
Synthesis can fall back to another agent; if no valid brief can be produced,
partial research is retained. Stop cancels the run and in-progress retrieval.
`DEMO_STREAM_DELAY_MS` controls scripted pacing only, not inference latency.

## Inspect and save

**What the agents actually did** combines a selected record, historical swarm
view, timeline and playback controls. Select a node, filter contributions, and
inspect which later contexts included them. The report links role/network edits,
source use and synthesis to original events. It is computed from the trace and
makes no extra model calls. Context exposure does not establish agreement,
understanding, private intent or causal influence.

Runs write JSON and Markdown to `results/` and traces under `traces/<run-id>/`.
The local operator can inspect public records and per-agent private SDK events;
agents only receive filtered task observations. The local role library defaults
to `data/role-presets.json`, with `ROLE_PRESET_FILE` available as an override.
These data folders are not changed by the removal of the retired experiment
runners. Older records remain available through the archive.

The server binds to `127.0.0.1` (port 3333 by default), validates Host/Origin,
and allows one active run. This is application-level mediation, not a proven OS
isolation boundary. Logs can contain sensitive prompts and tool output; review
before sharing. Traces are not automatically pruned.

## Development

```bash
npm run check
npm test
```

- `src/experiments.ts` configures the single research workflow.
- `src/providers.ts` connects the Codex harness to Adaption.
- `tasks/hackathon/` contains research instructions, schemas, demo and retrieval.
- `src/server.ts`, `src/traces.ts` and `src/analysis.ts` handle APIs and records.
- `web/network.js` handles graph editing; `web/dome-scene.js` renders the shared
  interactive 3D view using the projection in `web/dome-geometry.js`.
- `web/behavior.js` links the historical trajectory to recorded agent activity.

The internal `hackathon` task ID and event prefix are retained for saved-record
compatibility. They are not a task selector. The retired shared-fund/resource
runners and standalone Python experiment have been removed; their task IDs are
rejected rather than silently launching a different experiment.

Local APIs include `/setup`, `/run`, `/stop`, `/network`, `/roles`, `/role-presets`,
`/runs/:id`, `/runs/:id/analysis` and Markdown exports. Graph and role edits require
the active run ID and expected revision. Stale changes and team-size mismatches
are rejected. Public and private trace scopes remain separate.

The visual design is inspired by [AI Safety HOT](https://aisafetyhot.com/en) and
[SwarmHarm](https://swarmharm.com/?case=r136&phase=1). The 3D implementation uses local SVG projection code and adds no external
graphics dependency.
