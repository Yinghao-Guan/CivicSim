"""CivicSim simulation API.

HTTP only: this module validates requests, calls the simulation engine, and
renders the contract's response shapes. No metric is computed here.

Endpoints follow docs/03-api-contract.md sections 5, 6 and 12.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api.schemas import BaselineResponse, ScenarioResponse, SimulateRequest
from api.serializers import to_candidate_model, to_scenario_response
from api.store import ScenarioStore, derive_scenario_id
from data.demo_neighborhood import (
    BASELINE_DESTINATION,
    CANDIDATE_SITES,
    build_demo_cohort,
    build_demo_graph,
    site,
)
from simulation.scenarios import (
    BASELINE_SCENARIO_ID,
    evaluate_baseline,
    evaluate_scenario,
)

#: The frontend origin during local development (contract section 1).
FRONTEND_ORIGIN = "http://localhost:3000"

#: Shade is accepted by the schema but not yet modeled. Until the shade task
#: lands, a request carrying segments is rejected rather than quietly ignored.
SHADE_SUPPORTED = False


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
    _reject_unsupported_interventions(request.shade_segments)

    result = evaluate_scenario(app.state.graph, app.state.cohort, candidate)

    scenario_id = derive_scenario_id(candidate.id, request.shade_segments)
    if not app.state.store.is_canonical(scenario_id):
        app.state.store.put(scenario_id, result)

    return to_scenario_response(result, request.shade_segments)


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


def _resolve_site(cooling_center: str):
    """The candidate site, or a contract-shaped 400."""
    try:
        return site(cooling_center)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_scenario", "message": str(exc)},
        ) from exc


def _reject_unsupported_interventions(shade_segments: list[str]) -> None:
    """Fail loudly rather than return results that ignore the request."""
    if shade_segments and not SHADE_SUPPORTED:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_scenario",
                "message": (
                    "Shade interventions are not modeled yet; "
                    "shade_segments must be empty."
                ),
            },
        )
