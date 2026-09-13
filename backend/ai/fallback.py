"""Cached answers for the four preset goals.

Every entry below is a **real reply from the model**, captured on 2026-09-12
from `gpt-5.6-terra` and validated the same way a live reply is: the site and
action are the bounded enums, and the prose carries no digits. Nothing here
was written by hand; the punctuation was normalised to ASCII and nothing else.

This exists for one failure only — the network or the API being unavailable
during the demo. It is not a cache for speed, and it is never consulted while
a live answer is possible.

It holds no metric values. The endpoint attaches fresh deterministic evidence
to a cached reply exactly as it does to a live one, so every number on screen
still comes from the simulation run at request time.

A goal that is not one of the four presets, character for character, gets the
normal unavailable state instead. Guessing which cached answer "fits" free
text would be exactly the fabrication the trust boundary exists to prevent.
"""

from dataclasses import dataclass

from ai.planner import Recommendation

#: The model these answers came from. Reported as-is so a cached reply is
#: never attributed to whatever model is configured now.
CAPTURED_MODEL = "gpt-5.6-terra"

#: When they were captured, for the provenance line in the UI.
CAPTURED_AT = "2026-09-12"


@dataclass(frozen=True)
class CachedRecommendation:
    """One validated reply. Semantic fields only - no metrics."""

    goal: str
    recommended_site: str
    summary: str
    tradeoff: str
    suggested_action: str

    def as_recommendation(self) -> Recommendation:
        """Re-validate through the same schema a live reply passes through."""
        return Recommendation(
            recommended_site=self.recommended_site,
            summary=self.summary,
            tradeoff=self.tradeoff,
            suggested_action=self.suggested_action,
        )


#: Keyed by preset name. The goal strings mirror GOAL_PRESETS in
#: web/lib/ai.ts and must stay character-identical for a match to happen.
CACHED: dict[str, CachedRecommendation] = {
    "maximize_access": CachedRecommendation(
        goal='Reach as many residents as possible overall.',
        recommended_site='site_c',
        summary='Site C reaches the most residents overall, directly matching your priority. Its demand slightly exceeds capacity, so crowding may be a concern.',
        tradeoff='It gives up the stronger wheelchair access and lower heat exposure available at Site B.',
        suggested_action='none',
    ),
    "mobility_access": CachedRecommendation(
        goal='Prioritise mobility-constrained residents; do not leave wheelchair users behind.',
        recommended_site='site_b',
        summary='Site B is the clear choice for prioritizing mobility-constrained residents because it provides accessible routes for far more wheelchair users than either alternative. It also reaches more residents overall than Site A while avoiding the over-capacity demand seen at Site C.',
        tradeoff="This gives up Site C's much broader overall and heat-vulnerable reach.",
        suggested_action='none',
    ),
    "reduce_heat": CachedRecommendation(
        goal='Reduce the heat residents are exposed to on the way, while keeping access equitable.',
        recommended_site='site_b',
        summary='Site B best reduces travel heat exposure while providing by far the strongest wheelchair-accessible coverage. It also avoids the modeled overcrowding concern present at Site C.',
        tradeoff='It reaches fewer residents and fewer heat-vulnerable residents overall than Site C.',
        suggested_action='add_site_b_shade',
    ),
    "avoid_capacity": CachedRecommendation(
        goal="Avoid sites where modeled demand would exceed the building's capacity.",
        recommended_site='site_b',
        summary='Site B avoids modeled demand exceeding capacity while reaching more residents than Site A. It also has stronger wheelchair access and lower average heat exposure than the other non-overcapacity option.',
        tradeoff='It gives up the broader overall and heat-vulnerable reach offered by Site C, which is over capacity.',
        suggested_action='none',
    ),
}


def _normalise(goal: str) -> str:
    return " ".join(goal.split()).casefold()


_BY_GOAL = {_normalise(entry.goal): entry for entry in CACHED.values()}


def lookup(goal: str) -> CachedRecommendation | None:
    """The cached reply for an exact preset goal, or None.

    Matching collapses surrounding whitespace and case only. Anything looser
    would mean deciding that a goal the user actually typed is "close enough"
    to a canned answer, which it is not.
    """
    return _BY_GOAL.get(_normalise(goal))


def preset_goals() -> tuple[str, ...]:
    return tuple(entry.goal for entry in CACHED.values())
