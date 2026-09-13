"""Translate simulation results into contract response models.

This is the only place graph node ids become coordinates. It performs no
aggregation: every number it emits was produced by the simulation engine.
"""

import math
from typing import Sequence

from api.schemas import (
    CandidateSiteModel,
    HeatmapPointModel,
    InterventionsModel,
    MetricsModel,
    RouteModel,
    RunModel,
    ScenarioResponse,
    UnreachableAgentModel,
)
from data.demo_neighborhood import MODEL_VERSION, POPULATION_VERSION, location
from data.street_geometry import edge_geometry, metres, walk_geometry
from simulation.heat import StreetHeat
from simulation.interventions import SHADE_HEAT_REDUCTION
from simulation.metrics import Metrics
from simulation.scenarios import CandidateSite, ScenarioResult

#: P0 routes on foot only. Transit would populate this field differently
#: without changing the schema.
WALK_MODE = "walk"

#: Street heat is sampled about this often along each segment, so the map can
#: draw a continuous field rather than one dot per street.
HEAT_SAMPLE_SPACING_M = 40.0

#: The cohort is enumerated rather than sampled, so no seed is consumed yet.
#: Reported as null rather than inventing a number that nothing used.
DEMO_SEED: int | None = None

#: Stated on every response so no reader mistakes the demo for a survey.
STANDING_WARNINGS: tuple[str, ...] = (
    "Synthetic demo neighborhood: travel times are modeled path costs, not "
    "measured street distances.",
    "Setup costs are illustrative estimates, not city figures.",
)


def shade_assumption(segment_count: int) -> str:
    """State the shade model in the response, in the reader's own units.

    Derived from the constant the simulation actually applied, so the sentence
    cannot drift away from the number that produced the metrics.
    """
    percent = round(SHADE_HEAT_REDUCTION * 100)
    return (
        f"Modeled shade removes {percent}% of unshaded heat exposure on the "
        f"{segment_count} edited segment(s). A demo assumption about mature "
        "street trees, not a measurement."
    )


def to_scenario_response(
    result: ScenarioResult, shade_segments: Sequence[str] = ()
) -> ScenarioResponse:
    """Render one scenario result in the contract's response shape."""
    routes = [_route(route) for route in result.routes]
    warnings = list(STANDING_WARNINGS)
    if shade_segments:
        # First, so a reader meets the assumption before the standing caveats.
        warnings.insert(0, shade_assumption(len(shade_segments)))

    return ScenarioResponse(
        scenario_id=result.scenario_id,
        selected_site=result.selected_site,
        interventions=InterventionsModel(shade_segments=list(shade_segments)),
        metrics=_metrics(result.metrics),
        routes=routes,
        unreachable_agents=[_unreachable(u) for u in result.unreachable],
        heatmap=_heatmap(result.street_heat),
        run=RunModel(
            model_version=MODEL_VERSION,
            population_version=POPULATION_VERSION,
            seed=DEMO_SEED,
            agent_count=len(result.routes) + len(result.unreachable),
            route_sample_count=len(routes),
        ),
        warnings=warnings,
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


def to_metrics_model(metrics: Metrics) -> MetricsModel:
    """Public alias: the AI endpoint attaches these as authoritative evidence."""
    return _metrics(metrics)


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
        # Drawn along real streets; the travel time above is still the model's.
        path=walk_geometry(route.path),
    )


def _heatmap(segments: Sequence[StreetHeat]) -> list[HeatmapPointModel]:
    """Sample each segment's heat intensity along its drawn street line.

    Samples sit at the middle of equal steps, so two segments meeting at a node
    never stack a point on the junction. The weight is the segment's intensity
    unchanged; only positions are generated here.
    """
    points: list[HeatmapPointModel] = []
    for segment in segments:
        line = edge_geometry(segment.u, segment.v)
        lengths = [metres(a, b) for a, b in zip(line, line[1:])]
        total = sum(lengths)
        steps = max(1, math.ceil(total / HEAT_SAMPLE_SPACING_M))
        for step in range(steps):
            points.append(
                HeatmapPointModel(
                    position=_along(line, lengths, total * (step + 0.5) / steps),
                    weight=round(segment.intensity, 4),
                )
            )
    return points


def _along(line, lengths, distance) -> tuple[float, float]:
    """The point `distance` metres along a polyline."""
    for index, ((a, b), length) in enumerate(zip(zip(line, line[1:]), lengths)):
        if distance <= length or index == len(lengths) - 1:
            t = 0.0 if length == 0 else min(1.0, distance / length)
            return (round(a[0] + (b[0] - a[0]) * t, 6), round(a[1] + (b[1] - a[1]) * t, 6))
        distance -= length
    return (round(line[-1][0], 6), round(line[-1][1], 6))


def _unreachable(unreachable) -> UnreachableAgentModel:
    return UnreachableAgentModel(
        agent_id=unreachable.agent_id,
        profile=unreachable.profile,
        origin=location(unreachable.origin),
        reason=unreachable.reason,
    )
