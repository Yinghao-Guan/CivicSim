"""CivicSim simulation API.

HTTP only: this module validates requests, calls the simulation engine, and
renders the contract's response shapes. No metric is computed here.

Endpoints follow docs/03-api-contract.md sections 5, 6 and 12.
"""

import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from ai import fallback, planner
from api.schemas import (
    AiRecommendationResponse,
    AiRecommendRequest,
    BaselineResponse,
    CoolingWalkModel,
    NearestCoolingResponse,
    ScenarioResponse,
    SimulateRequest,
    SiteEvidenceModel,
)
from api.serializers import (
    to_candidate_model,
    to_metrics_model,
    to_scenario_response,
)
from api.store import ScenarioStore, derive_scenario_id
from data.cooling_places import cooling_places
from data.demo_neighborhood import (
    BASELINE_DESTINATION,
    CANDIDATE_SITES,
    DEMO_AREA_SWNE,
    SHADEABLE_EDGE_IDS,
    build_demo_cohort,
    build_demo_graph,
    site,
)
from data.street_geometry import WALKING_SPEED_M_PER_MIN, walks_from
from simulation.interventions import apply_shade
from simulation.scenarios import (
    BASELINE_SCENARIO_ID,
    evaluate_baseline,
    evaluate_scenario,
)

#: The frontend origin during local development (contract section 1).
FRONTEND_ORIGIN = "http://localhost:3000"

#: Segments a request may shade. A small allow-list: an unrecognised id would
#: otherwise change nothing while the response still looked successful.
SUPPORTED_SHADE_SEGMENTS = SHADEABLE_EDGE_IDS

#: The only site the shade intervention exists for.
SHADE_SITE_ID = "site_b"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the neighborhood once and precompute the canonical scenarios."""
    graph = build_demo_graph()
    cohort = build_demo_cohort()
    store = ScenarioStore()
    store.preload_canonical(
        [
            evaluate_baseline(graph, cohort, BASELINE_DESTINATION),
            *(evaluate_scenario(graph, cohort, s) for s in CANDIDATE_SITES),
        ]
    )

    app.state.graph = graph
    app.state.cohort = cohort
    app.state.store = store

    # Build the OpenAI client off the startup path. It is a daemon thread that
    # makes no API call and swallows its own errors, so startup is not delayed
    # by it and the simulation never waits on, or depends on, the AI layer.
    threading.Thread(target=planner.prewarm, name="ai-prewarm", daemon=True).start()

    yield
    app.state.store = None


app = FastAPI(
    title="CivicSim simulation API",
    version="1.0.0",
    summary="Deterministic cooling-center scenario simulation.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/baseline", response_model=BaselineResponse)
def get_baseline() -> BaselineResponse:
    """Current-state access, plus the three candidate sites."""
    baseline = app.state.store.get(BASELINE_SCENARIO_ID)
    return BaselineResponse(
        baseline=to_scenario_response(baseline),
        candidates=[to_candidate_model(s) for s in CANDIDATE_SITES],
    )


@app.post("/simulate", response_model=ScenarioResponse)
def simulate(request: SimulateRequest) -> ScenarioResponse:
    """Run the simulation for one candidate cooling center."""
    candidate = _resolve_site(request.cooling_center)
    segments = _validated_shade_segments(request.shade_segments)
    scenario_id = derive_scenario_id(candidate.id, segments)

    # Interventions run against a per-request graph. The loaded graph is never
    # edited, so the canonical results computed at startup stay valid.
    graph = apply_shade(app.state.graph, segments) if segments else app.state.graph

    result = evaluate_scenario(
        graph, app.state.cohort, candidate, scenario_id=scenario_id
    )

    if not app.state.store.is_canonical(scenario_id):
        app.state.store.put(scenario_id, result)

    return to_scenario_response(result, segments)


@app.get("/scenario/{scenario_id}", response_model=ScenarioResponse)
def get_scenario(scenario_id: str) -> ScenarioResponse:
    """Retrieve an already-computed scenario from in-memory state."""
    result = app.state.store.get(scenario_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "scenario_not_found",
                "message": f"Scenario {scenario_id!r} was not found.",
            },
        )
    return to_scenario_response(result)


@app.get("/cooling/nearest", response_model=NearestCoolingResponse)
def nearest_cooling(
    lon: float = Query(..., description="Longitude of the resident's location"),
    lat: float = Query(..., description="Latitude of the resident's location"),
    limit: int = Query(3, ge=1, le=10),
) -> NearestCoolingResponse:
    """Cooling places ordered by walking time along real streets."""
    south, west, north, east = DEMO_AREA_SWNE
    if not (west <= lon <= east and south <= lat <= north):
        raise HTTPException(
            status_code=400,
            detail={"code": "outside_demo_area", "message": "The location is outside the demo area."},
        )
    places = cooling_places()
    walks = walks_from((lon, lat), [place.location for place in places])
    results = [
        CoolingWalkModel(
            id=place.id,
            name=place.name,
            facility_type=place.facility_type,
            location=place.location,
            walk_metres=round(walk[0], 1),
            walk_minutes=round(walk[0] / WALKING_SPEED_M_PER_MIN, 1),
            path=walk[1],
        )
        for place, walk in zip(places, walks)
        if walk is not None
    ]
    results.sort(key=lambda result: result.walk_metres)
    return NearestCoolingResponse(origin=(lon, lat), places=results[:limit])


@app.post("/ai/recommend", response_model=AiRecommendationResponse)
def ai_recommend(request: AiRecommendRequest) -> AiRecommendationResponse:
    """Interpret a user's priorities over the already-computed scenarios.

    The deterministic results are gathered first and passed to the model as
    evidence. Whatever comes back is validated against what the simulation
    actually supports, then the authoritative metrics are attached here -
    the model never supplies a number (contract section 19).
    """
    evidence = _site_evidence()
    if not evidence:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "ai_unavailable",
                "message": "No simulated scenarios are available to reason over.",
            },
        )

    captured_at = None
    try:
        recommendation = planner.recommend(
            request.goal, [e.model_dump() for e in evidence]
        )
        source = "live"
        model = planner.model_name()
    except planner.PlannerUnavailable as exc:
        # The assistant is unreachable. For the four preset goals we can serve
        # a previously validated reply rather than nothing - clearly labelled,
        # and still with fresh evidence attached below. Anything else keeps the
        # unavailable state: picking a canned answer for a goal the user typed
        # would be guessing.
        cached = fallback.lookup(request.goal)
        if cached is None:
            raise HTTPException(
                status_code=503,
                detail={"code": "ai_unavailable", "message": str(exc)},
            ) from exc
        recommendation = cached.as_recommendation()
        source = "cached"
        model = fallback.CAPTURED_MODEL
        captured_at = fallback.CAPTURED_AT

    known = {e.site_id for e in evidence}
    if recommendation.recommended_site not in known:
        # The schema should make this impossible; refuse rather than trust it.
        raise HTTPException(
            status_code=503,
            detail={
                "code": "ai_unavailable",
                "message": "The assistant named a site this demo does not have.",
            },
        )

    return AiRecommendationResponse(
        recommended_site=recommendation.recommended_site,
        summary=recommendation.summary,
        tradeoff=recommendation.tradeoff,
        suggested_action=_validated_action(
            recommendation.suggested_action, recommendation.recommended_site
        ),
        # Fresh from the simulation either way: a cached reply gets the same
        # evidence a live one would, computed for this request.
        evidence=evidence,
        model=model,
        source=source,
        captured_at=captured_at,
    )


def _site_evidence() -> list[SiteEvidenceModel]:
    """Authoritative metrics for every candidate, from the canonical runs."""
    evidence = []
    for candidate in CANDIDATE_SITES:
        result = app.state.store.get(candidate.id)
        if result is None:
            continue
        evidence.append(
            SiteEvidenceModel(
                site_id=candidate.id,
                name=candidate.name,
                metrics=to_metrics_model(result.metrics),
            )
        )
    return evidence


def _validated_action(action: str, recommended_site: str) -> str:
    """Drop an action the simulation cannot actually carry out.

    Shade exists only for Site B. Proposing it anywhere else would offer a
    button that could not be honoured, so it degrades to `none` rather than
    reaching the interface.
    """
    if action == "add_site_b_shade" and recommended_site == SHADE_SITE_ID:
        return action
    return "none"


def _resolve_site(cooling_center: str):
    """The candidate site, or a contract-shaped 400."""
    try:
        return site(cooling_center)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_scenario", "message": str(exc)},
        ) from exc


def _validated_shade_segments(shade_segments: list[str]) -> tuple[str, ...]:
    """The segments to shade, deduplicated and ordered.

    Rejects anything outside the supported set: accepting an id the demo graph
    does not carry would return a result that silently ignored the request.
    """
    unknown = sorted(set(shade_segments) - SUPPORTED_SHADE_SEGMENTS)
    if unknown:
        supported = ", ".join(sorted(SUPPORTED_SHADE_SEGMENTS))
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_scenario",
                "message": (
                    f"Unsupported shade segment(s): {', '.join(unknown)}. "
                    f"This demo can shade: {supported}."
                ),
            },
        )
    return tuple(sorted(set(shade_segments)))
