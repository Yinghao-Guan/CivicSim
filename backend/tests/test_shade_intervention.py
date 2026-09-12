"""The shade intervention: a real edit to the neighborhood, re-simulated.

The point of these tests is that shading is not a second hard-coded scenario.
It changes the graph a run sees, the metrics fall out of the same pipeline, and
the unshaded result for the same site survives untouched.
"""

import pytest
from fastapi.testclient import TestClient

from data.demo_neighborhood import (
    SHADEABLE_EDGE_IDS,
    SITE_B_APPROACH_SEGMENTS,
    build_demo_cohort,
    build_demo_graph,
    site,
)
from main import app
from simulation.interventions import SHADE_HEAT_REDUCTION, apply_shade
from simulation.routing import EDGE_ID_ATTR, HEAT_ATTR
from simulation.scenarios import evaluate_scenario


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


# --- the graph edit itself ---------------------------------------------------


def test_shade_reduces_heat_on_the_named_edges():
    graph = build_demo_graph()
    before = {
        attrs[EDGE_ID_ATTR]: attrs[HEAT_ATTR] for _u, _v, attrs in graph.edges(data=True)
    }

    shaded = apply_shade(graph, SITE_B_APPROACH_SEGMENTS)
    after = {
        attrs[EDGE_ID_ATTR]: attrs[HEAT_ATTR] for _u, _v, attrs in shaded.edges(data=True)
    }

    for edge_id in SITE_B_APPROACH_SEGMENTS:
        assert after[edge_id] == pytest.approx(
            before[edge_id] * (1 - SHADE_HEAT_REDUCTION)
        )
        assert after[edge_id] < before[edge_id]


def test_shade_leaves_every_other_edge_alone():
    graph = build_demo_graph()
    shaded = apply_shade(graph, SITE_B_APPROACH_SEGMENTS)

    for _u, _v, attrs in shaded.edges(data=True):
        if attrs[EDGE_ID_ATTR] not in SITE_B_APPROACH_SEGMENTS:
            edge = graph.edges[_u, _v]
            assert attrs[HEAT_ATTR] == edge[HEAT_ATTR]


def test_shade_does_not_mutate_the_graph_it_was_given():
    """The canonical graph must survive any number of interventions."""
    graph = build_demo_graph()
    original = {
        attrs[EDGE_ID_ATTR]: attrs[HEAT_ATTR] for _u, _v, attrs in graph.edges(data=True)
    }

    apply_shade(graph, SITE_B_APPROACH_SEGMENTS)
    apply_shade(graph, ("edge_03",))

    still = {
        attrs[EDGE_ID_ATTR]: attrs[HEAT_ATTR] for _u, _v, attrs in graph.edges(data=True)
    }
    assert still == original


def test_shade_changes_no_travel_time_or_accessibility():
    """Shade is cooler, not shorter, and not newly accessible."""
    graph = build_demo_graph()
    shaded = apply_shade(graph, SITE_B_APPROACH_SEGMENTS)

    for u, v, attrs in shaded.edges(data=True):
        assert attrs["travel_time"] == graph.edges[u, v]["travel_time"]
        assert attrs["wheelchair_accessible"] == graph.edges[u, v]["wheelchair_accessible"]


def test_unknown_edge_id_is_rejected():
    with pytest.raises(ValueError, match="edge_999"):
        apply_shade(build_demo_graph(), ("edge_999",))


# --- the simulation result ---------------------------------------------------


def test_shading_the_approach_lowers_average_heat_exposure():
    graph, cohort = build_demo_graph(), build_demo_cohort()
    plain = evaluate_scenario(graph, cohort, site("site_b"))
    shaded = evaluate_scenario(
        apply_shade(graph, SITE_B_APPROACH_SEGMENTS),
        cohort,
        site("site_b"),
        scenario_id="site_b__shaded",
    )

    assert (
        shaded.metrics.average_heat_exposure < plain.metrics.average_heat_exposure
    )


def test_shade_does_not_change_who_can_reach_the_site():
    """Routing minimises time, so shade changes exposure and nothing else."""
    graph, cohort = build_demo_graph(), build_demo_cohort()
    plain = evaluate_scenario(graph, cohort, site("site_b"))
    shaded = evaluate_scenario(
        apply_shade(graph, SITE_B_APPROACH_SEGMENTS), cohort, site("site_b")
    )

    assert shaded.metrics.population_reached == plain.metrics.population_reached
    assert shaded.metrics.wheelchair_access == plain.metrics.wheelchair_access
    assert [r.path for r in shaded.routes] == [r.path for r in plain.routes]


# --- over HTTP ---------------------------------------------------------------


def test_simulate_accepts_supported_shade_segments(client):
    response = client.post(
        "/simulate",
        json={
            "cooling_center": "site_b",
            "shade_segments": list(SITE_B_APPROACH_SEGMENTS),
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["interventions"]["shade_segments"] == sorted(SITE_B_APPROACH_SEGMENTS)
    assert body["selected_site"] == "site_b"


def test_shaded_run_gets_its_own_scenario_id(client):
    plain = client.post("/simulate", json={"cooling_center": "site_b"}).json()
    shaded = client.post(
        "/simulate",
        json={
            "cooling_center": "site_b",
            "shade_segments": list(SITE_B_APPROACH_SEGMENTS),
        },
    ).json()

    assert plain["scenario_id"] == "site_b"
    assert shaded["scenario_id"] != "site_b"


def test_shaded_run_improves_heat_over_http(client):
    plain = client.post("/simulate", json={"cooling_center": "site_b"}).json()
    shaded = client.post(
        "/simulate",
        json={
            "cooling_center": "site_b",
            "shade_segments": list(SITE_B_APPROACH_SEGMENTS),
        },
    ).json()

    assert (
        shaded["metrics"]["average_heat_exposure"]
        < plain["metrics"]["average_heat_exposure"]
    )


def test_canonical_site_b_survives_a_shaded_run(client):
    before = client.get("/scenario/site_b").json()
    client.post(
        "/simulate",
        json={
            "cooling_center": "site_b",
            "shade_segments": list(SITE_B_APPROACH_SEGMENTS),
        },
    )
    after = client.get("/scenario/site_b").json()

    assert after == before


def test_shaded_scenario_is_retrievable_afterwards(client):
    shaded = client.post(
        "/simulate",
        json={
            "cooling_center": "site_b",
            "shade_segments": list(SITE_B_APPROACH_SEGMENTS),
        },
    ).json()

    stored = client.get(f"/scenario/{shaded['scenario_id']}")

    assert stored.status_code == 200
    assert stored.json()["metrics"] == shaded["metrics"]


def test_shaded_response_states_the_shade_assumption(client):
    """The 60% figure must travel with the number it produced."""
    plain = client.post("/simulate", json={"cooling_center": "site_b"}).json()
    shaded = client.post(
        "/simulate",
        json={
            "cooling_center": "site_b",
            "shade_segments": list(SITE_B_APPROACH_SEGMENTS),
        },
    ).json()

    added = [w for w in shaded["warnings"] if w not in plain["warnings"]]

    assert len(added) == 1
    assert f"{round(SHADE_HEAT_REDUCTION * 100)}%" in added[0]
    assert str(len(SITE_B_APPROACH_SEGMENTS)) in added[0]


def test_unshaded_runs_carry_no_shade_assumption(client):
    body = client.post("/simulate", json={"cooling_center": "site_b"}).json()

    assert not any("shade" in w.lower() for w in body["warnings"])


def test_unsupported_shade_segment_is_a_400(client):
    response = client.post(
        "/simulate", json={"cooling_center": "site_b", "shade_segments": ["edge_99"]}
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_scenario"


def test_every_supported_segment_exists_in_the_graph():
    graph = build_demo_graph()
    ids = {attrs[EDGE_ID_ATTR] for _u, _v, attrs in graph.edges(data=True)}

    assert SHADEABLE_EDGE_IDS <= ids
    assert set(SITE_B_APPROACH_SEGMENTS) <= SHADEABLE_EDGE_IDS


def test_shaded_runs_are_deterministic(client):
    body = {
        "cooling_center": "site_b",
        "shade_segments": list(SITE_B_APPROACH_SEGMENTS),
    }
    runs = [client.post("/simulate", json=body).json()["metrics"] for _ in range(3)]

    assert all(run == runs[0] for run in runs)
