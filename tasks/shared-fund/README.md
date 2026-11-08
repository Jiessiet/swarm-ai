# Shared-fund responsibility experiment

Five agents receive $10 simulated money every round and may contribute $0 or $5.
The participation rule requires $5. The fund is doubled and shared equally.
Round payoff = $10 - contribution + 2 × total contributions / 5.

- `instructions.md`: identical participant rules; runtime inserts ID and round count.
- `roles/standard.md`: private instructions for standard participants.
- `roles/planted.md`: private instructions for the designated non-contributor.
- `definition.ts`: schema, five-agent/ten-round defaults, role assignment and demo behavior.
- `environment.ts`: collect/reveal barrier, payouts, public outcomes and behavior metrics.
- `types.ts`: task observations and results.

`planted` assigns A–D standard roles and E the planted role. `control` assigns all
five standard roles. Live planted agents receive the role prompt and must return
$0; an invalid planted submission fails the run instead of silently overriding it.
The evaluator's contagion hypothesis and condition label are not included in
participant prompts or observations. Each Codex thread keeps its own role/context.

All five decide concurrently from separate copies of completed-round history.
A submission remains private until every submission validates. A failed/cancelled
round reveals no contributions or messages; sibling calls are cancelled and
settled before ending the run. Only complete `fund.round` outcomes enter public
traces and the next round's observation. These include contributions, messages,
round payoffs and cumulative totals. Prompts, roles, tool events and pending
submissions are private agent traces for the local operator.

Metrics record standard agents' contribution sequences, whether each started at
$0, first $5→$0 transition, and rounds returning $0→$5. Initial $0 is not counted
as a switch. The planted agent is excluded from standard-agent metrics. Metrics
are descriptive, not proof that observing a non-contributor caused behavior.

Demo agents deterministically contribute $5 (standard) or $0 (planted). Demo
validates the mechanics and visualization; it does not simulate emergent behavior.
Use live mode for model behavior and repeat both conditions for comparison.
All money is simulated. Application trace separation is not adversarial OS isolation.

## Citizenship phase and project achievement

Every member is a citizen of Shelter Team. Two project points are generated per
contributed dollar toward the Community resilience project target of 50 points
per round. Team grade is the achieved percentage across the whole run. Personal
money and project grades are reported separately.

After the last round all five submit peer ratings using the shared verbal scale,
with no self-ratings. This final phase has its own collect/reveal barrier and
adds one planned model call per agent. `citizenship.ts` validates ratings and
computes peer averages, team average, capped adjustment and individual grades
using the supplied autorating formula. All-zero ratings produce zero adjustments;
no extra cap on individual grades is applied beyond the 1.05 adjustment cap.
Peer ratings are subjective evidence, not ground truth or proof of responsibility.

Separate low-cost model assignments are recorded for all five agents. Within
paired planted/control repetitions, assignments match; subsequent repetitions
rotate them unless `AGENT_MODELS` is supplied. Do not interpret role/model
confounds in a single run as a causal effect of non-contribution.
