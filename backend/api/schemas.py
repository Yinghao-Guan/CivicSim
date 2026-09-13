"""Pydantic request/response models.

These mirror docs/03-api-contract.md exactly: same field names, same types,
same units, same coordinate order. Nothing here computes anything - the
schemas describe the wire format and nothing else.

Coordinates are always [longitude, latitude].
"""

from typing import Literal

from pydantic import BaseModel, Field

Coordinate = tuple[float, float]


class MetricsModel(BaseModel):
    """docs/03-api-contract.md section 7."""

    population_reached: int
    heat_vulnerable_reached: int
    wheelchair_access: float
    average_heat_exposure: float
    capacity_utilization: float | None


class InterventionsModel(BaseModel):
    """Interventions applied to a scenario."""

    shade_segments: list[str] = Field(default_factory=list)


class RouteModel(BaseModel):
    """docs/03-api-contract.md section 8."""

    agent_id: str
    profile: str
    mode: str
    travel_time: float
    heat_exposure: float
    path: list[Coordinate]


class UnreachableAgentModel(BaseModel):
    """docs/03-api-contract.md section 9."""

    agent_id: str
    profile: str
    origin: Coordinate
    reason: str


class HeatmapPointModel(BaseModel):
    """docs/03-api-contract.md section 10: street heat sampled along the graph."""

    position: Coordinate
    weight: float


class RunModel(BaseModel):
    """docs/03-api-contract.md section 11."""

    model_version: str
    population_version: str
    seed: int | None
    agent_count: int
    route_sample_count: int


class ScenarioResponse(BaseModel):
    """The shared result shape of POST /simulate and GET /scenario/{id}."""

    scenario_id: str
    selected_site: str | None
    interventions: InterventionsModel
    metrics: MetricsModel
    routes: list[RouteModel]
    unreachable_agents: list[UnreachableAgentModel]
    heatmap: list[HeatmapPointModel]
    run: RunModel
    warnings: list[str]


class CandidateSiteModel(BaseModel):
    """docs/03-api-contract.md section 4."""

    id: str
    facility_id: str
    name: str
    location: Coordinate
    capacity: int
    estimated_setup_cost: int | None
    accessible_entrance: bool


class BaselineResponse(BaseModel):
    """docs/03-api-contract.md section 5."""

    baseline: ScenarioResponse
    candidates: list[CandidateSiteModel]


class CoolingWalkModel(BaseModel):
    """One cooling place and the street walk to it (nearest-cooling lookup)."""

    id: str
    name: str
    facility_type: str
    location: Coordinate
    walk_metres: float
    walk_minutes: float
    path: list[Coordinate]


class NearestCoolingResponse(BaseModel):
    """GET /cooling/nearest: cooling places ordered by walking time."""

    origin: Coordinate
    places: list[CoolingWalkModel]


class SimulateRequest(BaseModel):
    """docs/03-api-contract.md section 6.

    Agent count, seed and routing weights stay under backend control and are
    deliberately not accepted here.
    """

    cooling_center: str
    shade_segments: list[str] = Field(default_factory=list)


class ErrorDetail(BaseModel):
    """Body of the `detail` field in a 400 or 404 (section 13)."""

    code: str
    message: str


class AiRecommendRequest(BaseModel):
    """docs/03-api-contract.md section 19."""

    goal: str = Field(min_length=1, max_length=500)


class SiteEvidenceModel(BaseModel):
    """Authoritative metrics for one candidate, straight from the simulation."""

    site_id: str
    name: str
    metrics: MetricsModel


class AiRecommendationResponse(BaseModel):
    """The model's bounded reply, plus the evidence it was reasoning over.

    The semantic fields come from the model; `evidence` never does. A client
    displays numbers from `evidence` only.
    """

    recommended_site: str
    summary: str
    tradeoff: str
    suggested_action: str
    evidence: list[SiteEvidenceModel]
    model: str
    #: `live` when the model answered this request; `cached` when the assistant
    #: was unreachable and a previously validated reply was served instead.
    #: Never omitted, so a client cannot mistake one for the other.
    source: Literal["live", "cached"]
    #: When a cached reply was captured. Null for a live answer.
    captured_at: str | None = None
