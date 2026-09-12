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

    `population_weight` is how many modeled residents this agent stands for, so
    a small cohort can represent a neighborhood. `heat_vulnerable` is carried
    separately from `profile` for the same reason as the accessibility flag:
    metrics depend on modeled attributes, not on display names.
    """

    agent_id: str
    profile: str
    origin: Hashable
    requires_accessible_route: bool = False
    population_weight: float = 1.0
    heat_vulnerable: bool = False

    def __post_init__(self) -> None:
        if self.profile not in PROFILES:
            raise ValueError(
                f"Unknown agent profile {self.profile!r}; expected one of {PROFILES}."
            )
        if self.population_weight <= 0:
            raise ValueError(
                f"Agent {self.agent_id} has population_weight "
                f"{self.population_weight}; it must be positive."
            )
