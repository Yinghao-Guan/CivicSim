"""Aggregate scenario metrics.

Every value here is derived from routes the router actually produced. Nothing
in this module invents, estimates, or backfills a number: if a journey was not
routed, it does not contribute.

Metric names and units follow docs/03-api-contract.md section 7.
"""

from dataclasses import dataclass
from typing import Sequence

from simulation.agents import Agent
from simulation.routing import Route

#: Access threshold for the demo, in minutes (docs/03-api-contract.md s.7).
REACH_THRESHOLD_MINUTES = 15.0


@dataclass(frozen=True)
class Metrics:
    """The five metrics the hackathon frontend depends on."""

    population_reached: int
    heat_vulnerable_reached: int
    wheelchair_access: float
    average_heat_exposure: float
    capacity_utilization: float | None


def aggregate_metrics(
    cohort: Sequence[Agent],
    reached: Sequence[tuple[Agent, Route]],
    capacity: float | None,
) -> Metrics:
    """Summarize one scenario.

    `cohort` is every modeled agent, `reached` only those whose routed journey
    finished within the access threshold. The denominators come from `cohort`
    so an agent that could not be routed still counts against the share.
    """
    if not cohort:
        raise ValueError("Cannot aggregate metrics for an empty cohort.")

    constrained_weight = _weight(a for a in cohort if a.requires_accessible_route)
    if constrained_weight == 0:
        raise ValueError(
            "Cohort models no mobility-constrained population, so "
            "wheelchair_access would be undefined."
        )

    reached_weight = _weight(agent for agent, _ in reached)
    reached_constrained = _weight(
        agent for agent, _ in reached if agent.requires_accessible_route
    )

    return Metrics(
        population_reached=round(reached_weight),
        heat_vulnerable_reached=round(
            _weight(agent for agent, _ in reached if agent.heat_vulnerable)
        ),
        wheelchair_access=reached_constrained / constrained_weight,
        average_heat_exposure=_weighted_mean_heat_exposure(reached),
        capacity_utilization=_capacity_utilization(reached, capacity),
    )


def _weight(agents) -> float:
    """Total modeled residents represented by `agents`."""
    return sum(agent.population_weight for agent in agents)


def _weighted_mean_heat_exposure(reached: Sequence[tuple[Agent, Route]]) -> float:
    """Mean heat exposure across reached journeys, weighted by population.

    Zero when nobody was reached: there are no journeys to average.
    """
    total_weight = _weight(agent for agent, _ in reached)
    if total_weight == 0:
        return 0.0

    exposure = sum(
        agent.population_weight * route.heat_exposure for agent, route in reached
    )
    return exposure / total_weight


def _capacity_utilization(
    reached: Sequence[tuple[Agent, Route]], capacity: float | None
) -> float | None:
    """Modeled demand divided by site capacity.

    Demand is the heat-vulnerable population that can reach the site: a cooling
    center is sized for the residents it exists to serve, not for everyone in
    range. `None` when no capacity applies, as in a baseline with no new site.
    """
    if capacity is None:
        return None
    if capacity <= 0:
        raise ValueError(f"Site capacity must be positive, got {capacity}.")

    demand = _weight(agent for agent, _ in reached if agent.heat_vulnerable)
    return demand / capacity
