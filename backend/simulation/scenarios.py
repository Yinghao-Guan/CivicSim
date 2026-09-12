"""Scenario evaluation: route a cohort to one candidate site and score it.

This is the layer that turns "which site?" into numbers. It owns the access
threshold; routing stays a pure shortest-path question so that a journey which
merely takes too long can be told apart from one that is impossible.
"""

from dataclasses import dataclass
from typing import Hashable, Sequence

import networkx as nx

from simulation.agents import Agent
from simulation.metrics import REACH_THRESHOLD_MINUTES, Metrics, aggregate_metrics
from simulation.routing import Route, Unreachable, route_agent

#: Reported for an agent with a valid route that exceeds the access threshold.
REASON_TIME_LIMIT = "time_limit"

#: Canonical id of the current-state scenario (docs/03-api-contract.md s.3.2).
BASELINE_SCENARIO_ID = "baseline"


@dataclass(frozen=True)
class CandidateSite:
    """One candidate cooling center.

    Fields mirror docs/03-api-contract.md section 4, plus `node`, which links
    the facility to the walking graph. Costs are illustrative demo estimates,
    not city figures.
    """

    id: str
    facility_id: str
    name: str
    node: Hashable
    capacity: int
    location: tuple[float, float]
    estimated_setup_cost: int | None
    accessible_entrance: bool


@dataclass(frozen=True)
class ScenarioResult:
    """Outcome of placing a cooling center at one candidate site."""

    scenario_id: str
    selected_site: str | None
    metrics: Metrics
    routes: tuple[Route, ...]
    unreachable: tuple[Unreachable, ...]


def evaluate_scenario(
    graph: nx.Graph, cohort: Sequence[Agent], site: CandidateSite
) -> ScenarioResult:
    """Route every agent to `site` and aggregate the result."""
    reached, unreachable = _route_cohort(graph, cohort, site.node)

    return ScenarioResult(
        scenario_id=site.id,
        selected_site=site.id,
        metrics=aggregate_metrics(cohort, reached, site.capacity),
        routes=tuple(route for _, route in reached),
        unreachable=tuple(unreachable),
    )


def evaluate_baseline(
    graph: nx.Graph, cohort: Sequence[Agent], destination: Hashable
) -> ScenarioResult:
    """Score current-state access, before any new cooling center is added.

    Runs the same routing and metric pipeline as a proposal. `destination` is
    the cooling resource residents already have. No capacity applies, so
    `capacity_utilization` is null, as the contract allows for a baseline.
    """
    reached, unreachable = _route_cohort(graph, cohort, destination)

    return ScenarioResult(
        scenario_id=BASELINE_SCENARIO_ID,
        selected_site=None,
        metrics=aggregate_metrics(cohort, reached, capacity=None),
        routes=tuple(route for _, route in reached),
        unreachable=tuple(unreachable),
    )


def _route_cohort(
    graph: nx.Graph, cohort: Sequence[Agent], destination: Hashable
) -> tuple[list[tuple[Agent, Route]], list[Unreachable]]:
    """Route every agent, splitting them by whether they arrive in time."""
    reached: list[tuple[Agent, Route]] = []
    unreachable: list[Unreachable] = []

    for agent in cohort:
        outcome = route_agent(graph, agent, destination)
        if isinstance(outcome, Unreachable):
            unreachable.append(outcome)
        elif outcome.travel_time <= REACH_THRESHOLD_MINUTES:
            reached.append((agent, outcome))
        else:
            unreachable.append(_past_the_threshold(agent, outcome))

    return reached, unreachable


def compare_scenarios(
    graph: nx.Graph, cohort: Sequence[Agent], sites: Sequence[CandidateSite]
) -> dict[str, ScenarioResult]:
    """Evaluate several candidate sites against the same cohort and graph."""
    return {site.id: evaluate_scenario(graph, cohort, site) for site in sites}


def _past_the_threshold(agent: Agent, route: Route) -> Unreachable:
    """A real route exists, but not within the access threshold."""
    return Unreachable(
        agent_id=agent.agent_id,
        profile=agent.profile,
        origin=agent.origin,
        reason=REASON_TIME_LIMIT,
    )
