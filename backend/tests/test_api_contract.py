"""End-to-end tests for the three contract endpoints.

These assert the wire format in docs/03-api-contract.md: field names, types,
units, coordinate order, error shapes, and that the numbers the API returns
are the numbers the simulation engine produced.
"""

import pytest
from fastapi.testclient import TestClient

from data.demo_neighborhood import (
    BASELINE_DESTINATION,
    CANDIDATE_SITES,
    build_demo_cohort,
    build_demo_graph,
    site,
)
from main import app
from simulation.scenarios import evaluate_baseline, evaluate_scenario

FRONTEND_ORIGIN = "http://localhost:3000"

METRIC_FIELDS = {
    "population_reached",
    "heat_vulnerable_reached",
    "wheelchair_access",
    "average_heat_exposure",
    "capacity_utilization",
}

SCENARIO_FIELDS = {
    "scenario_id",
    "selected_site",
    "interventions",
    "metrics",
    "routes",
    "unreachable_agents",
    "heatmap",
    "run",
    "warnings",
}


@pytest.fixture
def client():
    """A client with lifespan run, so canonical scenarios are preloaded."""
    with TestClient(app) as test_client:
        yield test_client


# --- GET /baseline -----------------------------------------------------------


def test_baseline_returns_scenario_and_three_candidates(client):
    body = client.get("/baseline").json()

    assert set(body) == {"baseline", "candidates"}
    assert set(body["baseline"]) == SCENARIO_FIELDS
    assert [c["id"] for c in body["candidates"]] == ["site_a", "site_b", "site_c"]


def test_baseline_has_no_selected_site_and_no_capacity_utilization(client):
    baseline = client.get("/baseline").json()["baseline"]

    assert baseline["scenario_id"] == "baseline"
    assert baseline["selected_site"] is None
    assert baseline["metrics"]["capacity_utilization"] is None


def test_baseline_is_computed_from_the_real_pipeline(client):
    """The API reports what the engine produced, not a stored constant."""
    expected = evaluate_baseline(
        build_demo_graph(), build_demo_cohort(), BASELINE_DESTINATION
    )
    baseline = client.get("/baseline").json()["baseline"]

    assert (
        baseline["metrics"]["population_reached"]
        == expected.metrics.population_reached
    )
    assert len(baseline["unreachable_agents"]) == len(expected.unreachable)


def test_candidate_sites_carry_every_contract_field(client):
    candidates = client.get("/baseline").json()["candidates"]

    for candidate in candidates:
        assert set(candidate) == {
            "id",
            "facility_id",
            "name",
            "location",
            "capacity",
            "estimated_setup_cost",
            "accessible_entrance",
        }
        lon, lat = candidate["location"]
        assert -119 < lon < -117, "longitude must come first"
        assert 33 < lat < 35


# --- POST /simulate ----------------------------------------------------------


@pytest.mark.parametrize("site_id", ["site_a", "site_b", "site_c"])
def test_simulate_supports_every_candidate_site(client, site_id):
    response = client.post("/simulate", json={"cooling_center": site_id})

    assert response.status_code == 200
    body = response.json()
    assert body["scenario_id"] == site_id
    assert body["selected_site"] == site_id
    assert set(body["metrics"]) == METRIC_FIELDS


def test_simulate_matches_the_engine_exactly(client):
    expected = evaluate_scenario(
        build_demo_graph(), build_demo_cohort(), site("site_c")
    )
    metrics = client.post("/simulate", json={"cooling_center": "site_c"}).json()[
        "metrics"
    ]

    assert metrics["population_reached"] == expected.metrics.population_reached
    assert metrics["heat_vulnerable_reached"] == expected.metrics.heat_vulnerable_reached
    assert metrics["wheelchair_access"] == pytest.approx(
        expected.metrics.wheelchair_access
    )
    assert metrics["capacity_utilization"] == pytest.approx(
        expected.metrics.capacity_utilization
    )


def test_simulate_defaults_shade_segments_to_empty(client):
    body = client.post("/simulate", json={"cooling_center": "site_b"}).json()

    assert body["interventions"]["shade_segments"] == []


def test_routes_use_longitude_latitude_order(client):
    routes = client.post("/simulate", json={"cooling_center": "site_c"}).json()["routes"]

    assert routes
    for route in routes:
        assert route["mode"] == "walk"
        assert len(route["path"]) >= 2
        for lon, lat in route["path"]:
            assert -119 < lon < -117, "longitude must come first"
            assert 33 < lat < 35


def test_unreachable_agents_report_an_origin_and_a_reason(client):
    body = client.post("/simulate", json={"cooling_center": "site_a"}).json()

    assert body["unreachable_agents"]
    for agent in body["unreachable_agents"]:
        assert set(agent) == {"agent_id", "profile", "origin", "reason"}
        assert agent["reason"] in {
            "accessibility_barrier",
            "time_limit",
            "no_route",
            "capacity",
        }


def test_run_metadata_describes_the_actual_run(client):
    body = client.post("/simulate", json={"cooling_center": "site_b"}).json()
    run = body["run"]

    assert set(run) == {
        "model_version",
        "population_version",
        "seed",
        "agent_count",
        "route_sample_count",
    }
    assert run["agent_count"] == len(build_demo_cohort())
    assert run["route_sample_count"] == len(body["routes"])


def test_heatmap_is_empty_in_p0(client):
    assert client.post("/simulate", json={"cooling_center": "site_b"}).json()["heatmap"] == []


def test_the_demo_invariants_survive_the_api(client):
    """The reveal must hold over HTTP, not just in the engine."""
    b = client.post("/simulate", json={"cooling_center": "site_b"}).json()["metrics"]
    c = client.post("/simulate", json={"cooling_center": "site_c"}).json()["metrics"]

    assert c["population_reached"] > b["population_reached"]
    assert b["wheelchair_access"] > c["wheelchair_access"]


# --- GET /scenario/{id} ------------------------------------------------------


@pytest.mark.parametrize("scenario_id", ["baseline", "site_a", "site_b", "site_c"])
def test_canonical_scenarios_are_retrievable(client, scenario_id):
    response = client.get(f"/scenario/{scenario_id}")

    assert response.status_code == 200
    assert response.json()["scenario_id"] == scenario_id


def test_scenario_returns_the_same_shape_as_simulate(client):
    simulated = client.post("/simulate", json={"cooling_center": "site_b"}).json()
    retrieved = client.get("/scenario/site_b").json()

    assert set(simulated) == set(retrieved)
    assert simulated["metrics"] == retrieved["metrics"]


def test_simulating_does_not_overwrite_a_canonical_scenario(client):
    before = client.get("/scenario/site_b").json()
    client.post("/simulate", json={"cooling_center": "site_b"})
    after = client.get("/scenario/site_b").json()

    assert before == after


# --- errors ------------------------------------------------------------------


def test_unknown_cooling_center_is_a_400_invalid_scenario(client):
    response = client.post("/simulate", json={"cooling_center": "site_x"})

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_scenario"


def test_unsupported_shade_intervention_is_rejected_not_ignored(client):
    response = client.post(
        "/simulate", json={"cooling_center": "site_b", "shade_segments": ["edge_18"]}
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_scenario"


def test_unknown_scenario_is_a_404_scenario_not_found(client):
    response = client.get("/scenario/site_x")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "scenario_not_found"


def test_malformed_request_body_is_a_422(client):
    assert client.post("/simulate", json={}).status_code == 422


# --- CORS --------------------------------------------------------------------


def test_frontend_origin_is_allowed(client):
    response = client.get("/baseline", headers={"Origin": FRONTEND_ORIGIN})

    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN


def test_preflight_allows_posting_a_simulation(client):
    response = client.options(
        "/simulate",
        headers={
            "Origin": FRONTEND_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN


def test_other_origins_are_not_allowed(client):
    response = client.get("/baseline", headers={"Origin": "http://evil.example"})

    assert "access-control-allow-origin" not in response.headers


# --- store -------------------------------------------------------------------


def test_intervention_runs_get_their_own_scenario_id():
    """A shaded run must not be able to claim the canonical site id."""
    from api.store import derive_scenario_id

    assert derive_scenario_id("site_b", []) == "site_b"
    assert derive_scenario_id("site_b", ["edge_18"]) != "site_b"


def test_store_refuses_to_replace_a_canonical_scenario():
    from api.store import ScenarioStore

    graph, cohort = build_demo_graph(), build_demo_cohort()
    result = evaluate_scenario(graph, cohort, site("site_b"))
    store = ScenarioStore()
    store.preload_canonical([result])

    with pytest.raises(ValueError, match="canonical"):
        store.put("site_b", result)

    assert store.get("site_b") == result
