import json
import os
import random
from datetime import datetime, timezone
from pathlib import Path

from adaption import Adaption


# Change this if your Adaption account uses a different model.
MODEL = os.environ.get("ADAPTION_MODEL", "deepseek-v4-flash")

ROUNDS = 3
STARTING_TOKENS = 12
MAX_TAKE = 4
RANDOM_SEED = 42

INSTRUCTIONS = (
    "You are an agent in a shared-resource experiment. "
    "Your goal is to collect tokens, while considering that other agents "
    "also need the shared pool. "
    "Respond with exactly one JSON object and no other text. "
    'Use this format: {"take": 2, "reason": "brief explanation"}. '
    "The take value must be a whole number between 0 and the allowed maximum."
)


def ask_agent(client, round_number, pool, previous_rounds):
    """Ask the model for one decision in the simulated environment."""

    observation = {
        "round": round_number,
        "total_rounds": ROUNDS,
        "tokens_remaining": pool,
        "maximum_you_can_take": min(MAX_TAKE, pool),
        "previous_rounds": previous_rounds,
        "other_agent": (
            "After your turn, another simulated agent takes between "
            "0 and 2 tokens, if available."
        ),
    }

    response = client.responses.create(
        model=MODEL,
        instructions=INSTRUCTIONS,
        input=json.dumps(observation),
        max_output_tokens=200,
        temperature=0,
        tool_choice="none",
        store=False,
    )

    if response.status != "completed" or not response.output_text:
        raise RuntimeError(
            "The model did not return a completed text response: "
            f"status={response.status}, error={response.error}"
        )

    try:
        decision = json.loads(response.output_text)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"The model did not return valid JSON: {response.output_text!r}"
        ) from exc

    take = decision.get("take")
    reason = decision.get("reason", "")

    # The experiment code checks that the decision follows the rules.
    limit = min(MAX_TAKE, pool)
    if type(take) is not int or not 0 <= take <= limit:
        raise ValueError(f"Invalid agent decision: {decision!r}")

    return {
        "take": take,
        "reason": str(reason),
        "observation": observation,
        "raw_response": response.output_text,
        "response_id": response.id,
        "response_model": response.model,
        "usage": response.usage.model_dump() if response.usage else None,
    }


def main():
    if not os.environ.get("ADAPTION_API_KEY"):
        raise SystemExit(
            "ADAPTION_API_KEY is missing. Set it in this Terminal first."
        )

    client = Adaption(max_retries=0)
    rng = random.Random(RANDOM_SEED)
    pool = STARTING_TOKENS

    # The model sees this summary of previous rounds.
    history = []

    # The saved log also contains the full observation and raw response.
    round_logs = []

    print(f"Starting experiment with {pool} tokens.\n")

    for round_number in range(1, ROUNDS + 1):
        if pool == 0:
            print("The pool is empty; the experiment is finished.")
            break

        agent_result = ask_agent(
            client, round_number, pool, history
        )

        take = agent_result["take"]
        reason = agent_result["reason"]
        pool -= take

        # This participant is a programmed baseline, not an LLM.
        other_take = rng.randint(0, min(2, pool))
        pool -= other_take

        result = {
            "round": round_number,
            "agent_take": take,
            "agent_reason": reason,
            "baseline_take": other_take,
            "pool_remaining": pool,
        }

        # Save a copy of the observation before adding the new round.
        round_logs.append({
            **result,
            "observation": agent_result["observation"],
            "raw_response": agent_result["raw_response"],
            "response_id": agent_result["response_id"],
            "response_model": agent_result["response_model"],
            "usage": agent_result["usage"],
        })

        # Create a new list so earlier saved observations remain unchanged.
        history = history + [result]

        print(f"Round {round_number}")
        print(f"  Agent took: {take}")
        print(f"  Agent's reason: {reason}")
        print(f"  Baseline took: {other_take}")
        print(f"  Pool remaining: {pool}\n")

    timestamp = datetime.now(timezone.utc).strftime(
        "%Y%m%dT%H%M%S%fZ"
    )

    output_dir = Path("results")
    output_dir.mkdir(exist_ok=True)

    record = {
        "timestamp_utc": timestamp,
        "settings": {
            "model": MODEL,
            "rounds": ROUNDS,
            "starting_tokens": STARTING_TOKENS,
            "max_take": MAX_TAKE,
            "random_seed": RANDOM_SEED,
            "max_output_tokens": 200,
            "temperature": 0,
            "tool_choice": "none",
            "store": False,
        },
        "instructions": INSTRUCTIONS,
        "rounds": round_logs,
    }

    output_path = output_dir / f"run-{timestamp}.json"

    with output_path.open("x", encoding="utf-8") as file:
        json.dump(record, file, indent=2)

    print(f"Results saved to {output_path}")


if __name__ == "__main__":
    main()