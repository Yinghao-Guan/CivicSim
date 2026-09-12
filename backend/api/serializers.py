"""Translate simulation results into contract response models.

This is the only place graph node ids become coordinates. It performs no
aggregation: every number it emits was produced by the simulation engine.
"""

from typing import Sequence

from api.schemas import (
    CandidateSiteModel,
    InterventionsModel,
    MetricsModel,
    RouteModel,
    RunModel,
    ScenarioResponse,
    UnreachableAgentModel,
)
from data.demo_neighborhood import MODEL_VERSION, POPULATION_VERSION, location
from simulation.metrics import Metrics
from simulation.scenarios import CandidateSite, ScenarioResult

#: P0 routes on foot only. Transit would populate this field differently
#: without changing the schema.
WALK_MODE = "walk"

#: The cohort is enumerated rather than sampled, so no seed is consumed yet.
#: Reported as null rather than inventing a number that nothing used.
DEMO_SEED: int | None = None

#: Stated on every response so no reader mistakes the demo for a survey.
STANDING_WARNINGS: tuple[str, ...] = (
    "Synthetic demo neighborhood: travel times are modeled path costs, not "
    "measured street distances.",
    "Setup costs are illustrative estimates, not city figures.",
)


def to_scenario_response(
    result: ScenarioResult, shade_segments: Sequence[str] = ()
) -> ScenarioResponse:
    """Render one scenario result in the contract's response shape."""
    routes = [_route(route) for route in result.routes]

    return ScenarioResponse(
        scenario_id=result.scenario_id,
        selected_site=result.selected_site,
        interventions=InterventionsModel(shade_segments=list(shade_segments)),
        metrics=_metrics(result.metrics),
        routes=routes,
        unreachable_agents=[_unreachable(u) for u in result.unreachable],
        heatmap=[],
        run=RunModel(
            model_version=MODEL_VERSION,
            population_version=POPULATION_VERSION,
            seed=DEMO_SEED,
            agent_count=len(result.routes) + len(result.unreachable),
            route_sample_count=len(routes),
        ),
        warnings=list(STANDING_WARNINGS),
    )


def to_candidate_model(site: CandidateSite) -> CandidateSiteModel:
    """Render one candidate cooling center."""
    return CandidateSiteModel(
        id=site.id,
        facility_id=site.facility_id,
        name=site.name,
        location=site.location,
        capacity=site.capacity,
        estimated_setup_cost=site.estimated_setup_cost,
        accessible_entrance=site.accessible_entrance,
    )


def _metrics(metrics: Metrics) -> MetricsModel:
    return MetricsModel(
        population_reached=metrics.population_reached,
        heat_vulnerable_reached=metrics.heat_vulnerable_reached,
        wheelchair_access=metrics.wheelchair_access,
        average_heat_exposure=metrics.average_heat_exposure,
        capacity_utilization=metrics.capacity_utilization,
    )


def _route(route) -> RouteModel:
    return RouteModel(
        agent_id=route.agent_id,
        profile=route.profile,
        mode=WALK_MODE,
        travel_time=route.travel_time,
        heat_exposure=route.heat_exposure,
        path=[location(node) for node in route.path],
    )


def _unreachable(unreachable) -> UnreachableAgentModel:
    return UnreachableAgentModel(
        agent_id=unreachable.agent_id,
        profile=unreachable.profile,
        origin=location(unreachable.origin),
        reason=unreachable.reason,
    )
