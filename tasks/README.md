# Task definitions

The default task is `hackathon/`: five agents collaborate on a one-day swarm AI safety research idea. Its `instructions.md` supplies the brief, `definition.ts` defines roles/schemas/demo, `environment.ts` runs research/discussion/synthesis, `web.ts` executes internet research, and `types.ts` defines shared state. See the root README for search-provider setup and outputs.

The original resource task lives in `shared-resource/`:

- `instructions.md`: agent-facing task prompt.
- `definition.ts`: task ID, default settings, response schema, baseline/demo decisions.
- `environment.ts`: turn ordering, observations, resource transitions, decision validation and termination rules.
- `types.ts`: task-specific observations, decisions and turn records.

Edit these files to change the experiment. Restart the CLI or dashboard after
editing. Both entrypoints use this definition; dashboard inputs and CLI environment
variables can override defaults for a run. The dashboard loads defaults through
`GET /task`. Logs include the task ID.

The Codex/Adaption adapter and event transport remain in `src/`; visual rendering
remains in `web/`. The dashboard understands hackathon research briefs, shared-resource decisions
and shared-fund rounds. Adding a different task shape also requires updating its renderer
and selecting that task in the entrypoints; there is no dynamic task plugin loader.

Shared-resource responses have a public `message` field. Only validated messages
and decisions enter shared history. Agents receive `sharedMessages` alongside
`history`; raw prompts and SDK/tool output stay in private traces. Trace storage
and operator retrieval are implemented in `src/traces.ts`, independent of the
task's prompt and rules.

## Shared-fund task

`shared-fund/` adds the five-agent contribution experiment with separate common
and private role prompts. Select it in the dashboard or set `TASK=shared-fund`.
`src/experiments.ts` selects among the built-in tasks and creates fresh
Codex threads or deterministic demo agents. See `shared-fund/README.md` for the
round barrier, planted/control conditions, payout rules and behavioral metrics.
