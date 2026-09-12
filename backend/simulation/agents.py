"""Synthetic resident agents.

An agent is a synthetic decision-making unit, never a real resident. For this
first milestone an agent carries only what routing needs: where it starts and
whether it can use inaccessible infrastructure.
"""

from dataclasses import dataclass
from typing import Hashable

# Profile names exposed to the frontend (docs/03-api-contract.md section 8).
PROFILES = (
    "general",
    "heat_vulnerable",
    "mobility_constrained",
    "transit_dependent",
)


@dataclass(frozen=True)
class Agent:
    """One synthetic resident.

    `origin` is a graph node id. `requires_accessible_route` is kept separate
    from `profile` so routing depends on a modeled constraint rather than on
    the display name of a profile.
    """

    agent_id: str
    profile: str
    origin: Hashable
    requires_accessible_route: bool = False

    def __post_init__(self) -> None:
        if self.profile not in PROFILES:
            raise ValueError(
                f"Unknown agent profile {self.profile!r}; expected one of {PROFILES}."
            )
