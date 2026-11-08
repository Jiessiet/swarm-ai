# swarm-ai

A shared-resource agent environment using the OpenAI Codex TypeScript SDK and
Adaption's Python API. Each agent observes the pool and prior decisions, chooses
an allocation, and receives another turn while resources remain. The original
`experiment.py` remains available.

## Quick start

Requires Node.js 20+ and npm. Python is needed only for Adaption.

```bash
npm ci
npm run demo
npm run check
npm test
```

The default demo runs three deterministic agents without API calls. Results are
written to ignored `results/run-*.json` files. Each round rotates the first mover;
turns are sequential so every participant sees the current pool. Invalid decisions
or provider failures stop the run. Completed runs record settings, decisions,
reasons, allocations and remaining resources.

## Codex agents

Authenticate the Codex CLI using `codex login`, or set `CODEX_API_KEY` through
your environment's secret settings. Then run:

```bash
AGENT_BACKEND=codex npm start
```

Each agent has its own persistent SDK thread for the duration of the run.
Threads use read-only sandboxing, disabled network and web search, and no approval
prompts. Codex remains a tool-capable coding agent; read-only mode is not a
confidentiality boundary. Run against an appropriate workspace. Turns time out
after two minutes. Optionally set `CODEX_MODEL` to an available Codex model.

## Adaption agents

Use Python compatible with the repository's pinned dependencies:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# Configure ADAPTION_API_KEY securely before starting.
PYTHON=.venv/bin/python AGENT_BACKEND=adaption npm start
```

`ADAPTION_MODEL` defaults to `qwen3.5-397b`, matching the existing experiment.
Adaption calls use the official Python client via a JSON stdin/stdout worker;
credentials stay in environment variables. Set `AGENT_BACKEND=mixed` for one
Codex agent and one Adaption agent, with both providers authenticated.

These are separate backends sharing one environment. This implementation does
not assume Adaption is a compatible Codex Responses endpoint, and does not route
Codex through Adaption. Live provider compatibility must be verified with your
account and model access. No live API calls are required by the tests.

## Configuration and extension

See `.env.example`; it is a template, not automatically loaded. Set shell variables
or use your runtime's environment-file support. `ROUNDS`, `STARTING_TOKENS`, and
`MAX_TAKE` must be positive safe integers. `PYTHON` selects the Adaption worker's
Python executable. Never commit keys or `.env` files.

Implement the `Agent` interface in `src/environment.ts` to add a participant.
`src/providers.ts` contains the provider adapters and `src/cli.ts` assembles the
group. Tests cover resource conservation, turn rotation, decision validation,
history isolation, exhaustion and provider errors.

Current scope is an experiment harness: no training/adaptation feedback loop,
parallel coding worktrees, deployment service, or dashboard is included.
