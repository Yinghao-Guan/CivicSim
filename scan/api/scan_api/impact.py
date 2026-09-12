"""From a located issue to a fix and its modeled effect.

For issues the demo graph can represent, the fix is applied to the nearest
modeled street and every scenario the demo knows (today's cooling center and
the three candidates) is re-run before and after, through the backend's own
routing and metrics. Nothing here computes a metric itself.

Issues the graph cannot represent get the fix and the responsible office, and
say plainly that no numbers were modeled.
"""

from dataclasses import asdict, dataclass, field
from typing import Literal

import networkx as nx

from scan_api import backend_bridge  # noqa: F401  (puts backend/ on sys.path)

from api.serializers import STANDING_WARNINGS, shade_assumption
from data.demo_neighborhood import (
    BASELINE_DESTINATION,
    CANDIDATE_SITES,
    build_demo_cohort,
    build_demo_graph,
    location,
)
from simulation.interventions import apply_shade
from simulation.routing import ACCESSIBLE_ATTR, EDGE_ID_ATTR, HEAT_ATTR, Route
from simulation.scenarios import ScenarioResult, evaluate_baseline, evaluate_scenario

from scan_api.geo import Coordinate, Segment, in_area, nearest_segment
from scan_api.taxonomy import IssueType, issue_type

#: Beyond this, the pin is not really on the street it was matched to. The
#: demo graph only covers part of the area, so this is a warning, not a refusal.
FAR_FROM_MODEL_M = 250.0

Status = Literal["outside_area", "modeled", "not_modeled"]


@dataclass(frozen=True)
class ScenarioImpact:
    scenario_id: str
    label: str
    before: dict
    after: dict


@dataclass(frozen=True)
class RoutePath:
    agent_id: str
    profile: str
    path: list[Coordinate]


@dataclass(frozen=True)
class Assessment:
    status: Status
    location: Coordinate
    issue: dict
    segment: dict | None = None
    change: dict | None = None
    scenarios: list[ScenarioImpact] = field(default_factory=list)
    #: The scenario where the fix moves its target metric the most, if any.
    headline: dict | None = None
    #: Before/after journeys for the headline scenario, for drawing.
    routes: dict | None = None
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def apply_accessibility_repair(graph: nx.Graph, edge_id: str) -> nx.Graph:
    """A copy of `graph` where one edge is wheelchair-passable.

    Mirrors `simulation.interventions.apply_shade`: the given graph is never
    edited. Travel time and heat exposure are left as they were - a repaired
    sidewalk is the same walk, now usable by more people.
    """
    repaired = graph.copy()
    for _u, _v, attrs in repaired.edges(data=True):
        if attrs.get(EDGE_ID_ATTR) == edge_id:
            attrs[ACCESSIBLE_ATTR] = True
            return repaired
    raise ValueError(f"No graph edge carries the id {edge_id!r}.")


def assess(issue_id: str, where: Coordinate) -> Assessment:
    kind = issue_type(issue_id)
    issue = _issue_dict(kind)

    if not in_area(where):
        return Assessment(
            status="outside_area",
            location=where,
            issue=issue,
            warnings=["This location is outside the neighborhood CivicSim currently models."],
        )

    segment = nearest_segment(where)
    warnings: list[str] = []
    if segment.distance_m > FAR_FROM_MODEL_M:
        warnings.append(
            f"The nearest modeled street is {segment.distance_m:.0f} m away; the demo "
            "graph covers only part of the neighborhood, so this is an approximate match."
        )

    if kind.intervention is None:
        return Assessment(
            status="not_modeled",
            location=where,
            issue=issue,
            segment=_segment_dict(segment),
            warnings=warnings
            + [
                "The neighborhood model does not include cycling yet, so no metrics were computed."
                if kind.kind == "request"
                else "The simulation does not model this kind of issue yet, so no metrics were computed."
            ],
        )

    graph = build_demo_graph()
    cohort = build_demo_cohort()

    if kind.intervention == "shade":
        fixed = apply_shade(graph, [segment.edge_id])
        after_heat = _edge_attr(fixed, segment.edge_id, HEAT_ATTR)
        change = {
            "kind": "shade",
            "edge_id": segment.edge_id,
            "changed": after_heat < segment.heat_exposure,
            "description": (
                f"Shade {segment.edge_id}: modeled heat exposure "
                f"{segment.heat_exposure:g} -> {after_heat:.2g} min."
            ),
        }
        warnings.insert(0, shade_assumption(1))
        target = ("average_heat_exposure", -1)
    else:
        fixed = apply_accessibility_repair(graph, segment.edge_id)
        already = segment.wheelchair_accessible
        change = {
            "kind": "accessibility_repair",
            "edge_id": segment.edge_id,
            "changed": not already,
            "description": (
                f"{segment.edge_id} is already modeled as wheelchair-passable, so the repair "
                "changes no modeled route."
                if already
                else f"Repair {segment.edge_id} so wheelchair users can pass."
            ),
        }
        warnings.insert(
            0,
            "Modeled repair makes the matched segment wheelchair-passable; travel time "
            "and heat exposure are unchanged. A demo assumption, not an engineering assessment.",
        )
        target = ("wheelchair_access", 1)

    runs = [
        ("baseline", "Today (existing cooling center)", lambda g: evaluate_baseline(g, cohort, BASELINE_DESTINATION)),
        *(
            (s.id, s.name, lambda g, s=s: evaluate_scenario(g, cohort, s))
            for s in CANDIDATE_SITES
        ),
    ]

    scenarios: list[ScenarioImpact] = []
    results: dict[str, tuple[ScenarioResult, ScenarioResult]] = {}
    for scenario_id, label, run in runs:
        before, after = run(graph), run(fixed)
        results[scenario_id] = (before, after)
        scenarios.append(
            ScenarioImpact(scenario_id, label, asdict(before.metrics), asdict(after.metrics))
        )

    headline, routes = _headline(scenarios, results, target)

    return Assessment(
        status="modeled",
        location=where,
        issue=issue,
        segment=_segment_dict(segment),
        change=change,
        scenarios=scenarios,
        headline=headline,
        routes=routes,
        warnings=warnings + list(STANDING_WARNINGS),
    )


def _headline(scenarios, results, target) -> tuple[dict | None, dict | None]:
    metric, direction = target
    best: ScenarioImpact | None = None
    best_gain = 0.0
    for scenario in scenarios:
        gain = (scenario.after[metric] - scenario.before[metric]) * direction
        # A shorter average among fewer reached journeys is not an improvement.
        if metric == "average_heat_exposure" and (
            scenario.after["population_reached"] < scenario.before["population_reached"]
        ):
            continue
        if gain > best_gain + 1e-9:
            best, best_gain = scenario, gain
    if best is None:
        return None, None

    before, after = results[best.scenario_id]
    return (
        {
            "scenario_id": best.scenario_id,
            "label": best.label,
            "metric": metric,
            "before": best.before[metric],
            "after": best.after[metric],
        },
        {
            "scenario_id": best.scenario_id,
            "before": [_route(r) for r in before.routes],
            "after": [_route(r) for r in after.routes],
        },
    )


def _route(route: Route) -> RoutePath:
    return RoutePath(route.agent_id, route.profile, [location(n) for n in route.path])


def _edge_attr(graph: nx.Graph, edge_id: str, attr: str) -> float:
    for _u, _v, attrs in graph.edges(data=True):
        if attrs.get(EDGE_ID_ATTR) == edge_id:
            return attrs[attr]
    raise ValueError(f"No graph edge carries the id {edge_id!r}.")


def _issue_dict(kind: IssueType) -> dict:
    return {
        "id": kind.id,
        "label": kind.label,
        "fix": kind.fix,
        "agency": kind.agency,
        "intervention": kind.intervention,
    }


def _segment_dict(segment: Segment) -> dict:
    return {
        "edge_id": segment.edge_id,
        "path": list(segment.path),
        "distance_m": round(segment.distance_m, 1),
        "wheelchair_accessible": segment.wheelchair_accessible,
        "heat_exposure": segment.heat_exposure,
    }

