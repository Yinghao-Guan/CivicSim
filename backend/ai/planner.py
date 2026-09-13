"""The AI boundary.

The model is given the deterministic simulation's own results and asked one
question: given this person's stated priorities, which of the three candidate
sites fits best, and what is the tradeoff?

It cannot do anything else. Its reply is constrained by a schema with no
numeric fields, so it has no way to return a metric, and the two enums mean it
cannot name a site or an action the simulation does not already support
(AGENTS.md §8). Everything the interface displays as a number is attached
afterwards, from the simulation, by the caller.

Uses the Responses API with Structured Outputs:
`client.responses.parse(..., text_format=<pydantic model>)` →
`response.output_parsed`, per the official guide.
"""

import os
import re
import threading
from typing import Literal, Sequence

from pydantic import BaseModel, Field

#: The only sites the model may choose between.
SITE_IDS = ("site_a", "site_b", "site_c")

#: The only interventions it may propose. `add_site_b_shade` is the shade
#: already implemented deterministically; the model cannot invent another.
ACTIONS = ("none", "add_site_b_shade")

#: Default model.
#:
#: Benchmarked over the four demo prompts, three runs each: `gpt-6-astra`,
#: `gpt-5.6-terra` and `gpt-5.6-luna` all scored 12/12 on site choice, action
#: choice and structured-output validity. `gpt-5.6-terra` was the fastest by a
#: clear margin (median ~1.95 s against 2.31 s and 3.29 s) and the most
#: consistent, so it is the default. Override with OPENAI_MODEL.
DEFAULT_MODEL = "gpt-5.6-terra"

#: Kept short: this runs live on stage, and a slow answer is a failed answer.
DEFAULT_TIMEOUT_SECONDS = 20.0

#: Any digit in the model's prose. The simulation owns every number the
#: interface shows, so prose that carries a figure is refused rather than
#: displayed — even a correct figure would blur where numbers come from.
_DIGIT = re.compile(r"\d")

#: One retry when the model slips a number in. Beyond that, refuse.
_MAX_ATTEMPTS = 2


class PlannerUnavailable(RuntimeError):
    """The assistant could not answer. Never raised for a valid refusal."""


class Recommendation(BaseModel):
    """Exactly what the model is allowed to say.

    No metric fields by design — the model is never asked for a number, so it
    cannot supply a wrong one.
    """

    recommended_site: Literal["site_a", "site_b", "site_c"]
    summary: str = Field(description="Two sentences at most, plain language.")
    tradeoff: str = Field(description="What this choice gives up, in one sentence.")
    suggested_action: Literal["none", "add_site_b_shade"]


INSTRUCTIONS = """\
You advise on cooling-center placement for CivicSim.

A deterministic simulation has already routed synthetic residents to each
candidate site. Its results are given to you as evidence. Your job is to read
the user's priorities and pick the site that best fits them.

Rules:
- Choose only from the three sites in the evidence.
- Do not compute, estimate or state any number. The interface shows the
  authoritative figures next to your answer; describe comparisons in words
  ("reaches the most residents", "far better for wheelchair users") instead.
- capacity_utilization above 1.0 means modeled demand exceeds the site's
  capacity. Treat that as a real drawback when the user cares about crowding.
- wheelchair_access is the share of the modeled mobility-constrained
  population with a valid accessible route.
- Suggest `add_site_b_shade` only when the user cares about heat and Site B is
  your recommendation; that intervention exists only for Site B. Otherwise
  suggest `none`.
- Be honest about what the recommendation gives up. There is no site that wins
  on every measure.
"""


_client_lock = threading.Lock()
_cached_client = None


def _client(timeout: float):
    """The shared client, built once.

    Importing the SDK and constructing a client costs about a second. Doing it
    per request would put that on the user's first question every time, so it
    is cached and can be built ahead of time by `prewarm`.
    """
    global _cached_client

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise PlannerUnavailable(
            "OPENAI_API_KEY is not set, so Ask CivicSim is unavailable. "
            "The simulation itself is unaffected."
        )

    with _client_lock:
        if _cached_client is not None:
            return _cached_client
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - dependency is declared
            raise PlannerUnavailable("The OpenAI SDK is not installed.") from exc

        # No retries. The cached preset answers exist for exactly this case,
        # so failing fast and showing one beats making the room wait through a
        # retry that will probably fail too.
        _cached_client = OpenAI(api_key=api_key, timeout=timeout, max_retries=0)
        return _cached_client


def prewarm() -> bool:
    """Build the client ahead of the first question. Never raises.

    Called on a daemon thread at startup so the SDK import and client
    construction do not land on the first person who asks something. It makes
    no API call, so it costs nothing and cannot fail in a way that matters:
    if there is no key, this simply does nothing and the endpoint still
    reports the same unavailable state.
    """
    try:
        _client(DEFAULT_TIMEOUT_SECONDS)
        return True
    except Exception:
        return False


def prose_carries_numbers(recommendation: "Recommendation") -> bool:
    """True when the model put a figure in text the interface would show."""
    return bool(
        _DIGIT.search(recommendation.summary) or _DIGIT.search(recommendation.tradeoff)
    )


def model_name() -> str:
    return os.environ.get("OPENAI_MODEL") or DEFAULT_MODEL


def recommend(
    goal: str,
    evidence: Sequence[dict],
    *,
    client=None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> Recommendation:
    """Ask for a recommendation over already-computed results.

    `evidence` is the simulation's output, passed through untouched. `client`
    exists so tests can drive this without a network call.
    """
    if not goal.strip():
        raise PlannerUnavailable("Ask CivicSim needs a goal to work from.")

    active = client or _client(timeout)
    import json

    prompt = (
        f"Simulation evidence:\n{json.dumps(list(evidence), indent=1)}"
        f"\n\nWhat I care about: {goal.strip()}"
    )

    for attempt in range(_MAX_ATTEMPTS):
        instructions = INSTRUCTIONS
        if attempt:
            # The first reply carried a figure. Say so plainly and retry once
            # rather than showing text that blurs where numbers come from.
            instructions += (
                "\nYour previous answer contained a numeral. Rewrite it using "
                "no digits at all — compare in words only."
            )

        try:
            response = active.responses.parse(
                model=model_name(),
                input=[
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": prompt},
                ],
                text_format=Recommendation,
            )
        except Exception as exc:  # SDK raises timeouts, auth and status errors
            raise PlannerUnavailable(
                f"The assistant could not be reached: {exc}"
            ) from exc

        parsed = getattr(response, "output_parsed", None)
        if parsed is None:
            # A refusal, or output that did not conform. Either way there is
            # nothing trustworthy to show.
            raise PlannerUnavailable("The assistant declined to answer this one.")

        if not prose_carries_numbers(parsed):
            return parsed

    raise PlannerUnavailable(
        "The assistant kept quoting figures, which only the simulation may "
        "report, so its answer was discarded."
    )
