# Task definitions

The current task lives in `shared-resource/`:

- `instructions.md`: agent-facing task prompt.
- `definition.ts`: task ID, default settings, response schema, baseline/demo decisions.
- `environment.ts`: turn ordering, observations, resource transitions, decision validation and termination rules.
- `types.ts`: task-specific observations, decisions and turn records.

Edit these files to change the experiment. Restart the CLI or dashboard after
editing. Both entrypoints use this definition; dashboard inputs and CLI environment
variables can override defaults for a run. The dashboard loads defaults through
`GET /task`. Logs include the task ID.

The Codex/Adaption adapter and event transport remain in `src/`; visual rendering
remains in `web/`. The dashboard currently understands shared-resource observations
and decisions. Adding a different task shape also requires updating its renderer
and selecting that task in the entrypoints; there is no dynamic task plugin loader.

Shared-resource responses have a public `message` field. Only validated messages
and decisions enter shared history. Agents receive `sharedMessages` alongside
`history`; raw prompts and SDK/tool output stay in private traces. Trace storage
and operator retrieval are implemented in `src/traces.ts`, independent of the
task's prompt and rules.
