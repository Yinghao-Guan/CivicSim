"""Regression tests for the CivicSim demo reveal.

The two invariants below are the point of the demo: Site C serves the most
residents overall, Site B serves mobility-constrained residents better. They
must hold because of where people live and where the steps are, so these tests
assert the *relationship* between scenarios rather than pinning fabricated
numbers onto them.
"""

import networkx as nx
import pytest

from data.demo_neighborhood import (
    CANDIDATE_SITES,
    DEMO_AREA_SWNE,
    DEMO_EDGES,
    NODE_LOCATIONS,
    build_demo_cohort,
    build_demo_graph,
    site,
)
from simulation.metrics import REACH_THRESHOLD_MINUTES
from simulation.routing import ACCESSIBLE_ATTR, HEAT_ATTR, WEIGHT_ATTR
from simulation.scenarios import REASON_TIME_LIMIT, compare_scenarios, evaluate_scenario


@pytest.fixture
def graph():
    return build_demo_graph()


@pytest.fixture
def cohort():
    return build_demo_cohort()


@pytest.fixture
def results(graph, cohort):
    return compare_scenarios(graph, cohort, CANDIDATE_SITES)


# --- the two demo invariants -------------------------------------------------


def test_site_c_reaches_more_residents_than_site_b(results):
    assert (
        results["site_c"].metrics.population_reached
        > results["site_b"].metrics.population_reached
    )


def test_site_b_serves_mobility_constrained_residents_better_than_site_c(results):
    assert (
        results["site_b"].metrics.wheelchair_access
        > results["site_c"].metrics.wheelchair_access
    )


def test_the_reveal_is_a_genuine_tradeoff(results):
    """Neither site wins both metrics - that is the whole point."""
    site_b, site_c = results["site_b"].metrics, results["site_c"].metrics

    assert site_c.population_reached > site_b.population_reached
    assert site_b.wheelchair_access > site_c.wheelchair_access


# --- the invariants are earned, not asserted into existence ------------------


def test_the_barrier_is_what_blocks_site_c_for_constrained_residents(graph, cohort):
    """Remove the steps and Site C's accessibility disadvantage disappears."""
    constrained_ids = {a.agent_id for a in cohort if a.requires_accessible_route}

    with_steps = evaluate_scenario(graph, cohort, site("site_c"))

    repaired = build_demo_graph()
    repaired.edges["j_c1", "j_e"][ACCESSIBLE_ATTR] = True
    without_steps = evaluate_scenario(repaired, cohort, site("site_c"))

    assert (
        without_steps.metrics.wheelchair_access > with_steps.metrics.wheelchair_access
    )
    # and the agents who changed status are the constrained ones
    gained = {r.agent_id for r in without_steps.routes} - {
        r.agent_id for r in with_steps.routes
    }
    assert gained
    assert gained <= constrained_ids


def test_population_reached_matches_the_agents_actually_routed(results, cohort):
    """Metrics are a sum over routed journeys, not a stored constant."""
    by_id = {agent.agent_id: agent for agent in cohort}

    for result in results.values():
        expected = sum(by_id[r.agent_id].population_weight for r in result.routes)
        assert result.metrics.population_reached == round(expected)


def test_every_agent_is_either_routed_or_explained(results, cohort):
    for result in results.values():
        accounted = len(result.routes) + len(result.unreachable)
        assert accounted == len(cohort)


def test_no_reported_journey_exceeds_the_access_threshold(results):
    for result in results.values():
        for route in result.routes:
            assert route.travel_time <= REACH_THRESHOLD_MINUTES


def test_distant_residents_are_reported_as_time_limited(results):
    """Eastern residents can walk to Site B, just not within 15 minutes."""
    reasons = {u.agent_id: u.reason for u in results["site_b"].unreachable}

    assert reasons["agent_e1"] == REASON_TIME_LIMIT


def test_site_a_has_no_accessible_entrance_for_anyone(results):
    """Its only entrance edge is stepped, so no constrained agent gets in."""
    assert results["site_a"].metrics.wheelchair_access == 0.0


# --- demo data integrity -----------------------------------------------------


def test_every_demo_edge_declares_accessibility_and_heat(graph):
    for u, v, attrs in graph.edges(data=True):
        assert ACCESSIBLE_ATTR in attrs, f"{u}-{v} does not declare accessibility"
        assert isinstance(attrs[ACCESSIBLE_ATTR], bool)
        assert HEAT_ATTR in attrs, f"{u}-{v} does not declare heat exposure"
        assert attrs[HEAT_ATTR] <= attrs[WEIGHT_ATTR]


def test_declared_accessible_entrance_matches_the_graph(graph):
    """A site's contract field must not disagree with its modeled entrance."""
    for candidate in CANDIDATE_SITES:
        entrances = graph.edges(candidate.node, data=ACCESSIBLE_ATTR)
        assert candidate.accessible_entrance == any(
            accessible for _, _, accessible in entrances
        )


def test_demo_graph_is_small_and_connected(graph):
    assert graph.number_of_edges() == len(DEMO_EDGES)
    assert nx.is_connected(graph)


def test_metrics_stay_within_their_documented_ranges(results):
    for result in results.values():
        metrics = result.metrics
        assert 0.0 <= metrics.wheelchair_access <= 1.0
        assert metrics.population_reached >= metrics.heat_vulnerable_reached >= 0
        assert metrics.average_heat_exposure >= 0.0
        assert metrics.capacity_utilization >= 0.0


def test_capacity_utilization_uses_the_sites_capacity(results):
    """Site C draws more heat-vulnerable demand than the building holds."""
    result = results["site_c"]
    expected = result.metrics.heat_vulnerable_reached / site("site_c").capacity

    assert result.metrics.capacity_utilization == pytest.approx(expected)


def test_scenario_evaluation_is_deterministic(graph, cohort):
    runs = [evaluate_scenario(graph, cohort, site("site_c")) for _ in range(3)]

    assert all(run == runs[0] for run in runs)


def test_evaluating_a_scenario_does_not_mutate_the_graph(graph, cohort):
    before = (graph.number_of_nodes(), graph.number_of_edges())

    compare_scenarios(graph, cohort, CANDIDATE_SITES)

    assert (graph.number_of_nodes(), graph.number_of_edges()) == before
    assert graph.edges["j_c1", "j_e"][ACCESSIBLE_ATTR] is False


def test_every_node_sits_inside_the_frontend_demo_area(graph):
    """A node outside the map slice would render off-screen or not at all."""
    south, west, north, east = DEMO_AREA_SWNE

    for node in graph.nodes:
        lon, lat = NODE_LOCATIONS[node]
        assert west < lon < east, f"{node} longitude {lon} is outside the demo area"
        assert south < lat < north, f"{node} latitude {lat} is outside the demo area"


def test_every_edge_is_geometrically_possible():
    """A walk cannot be shorter than the straight line between its ends.

    Guards the drawn map: if an edge's travel time implies less distance than
    the gap between its nodes, the rendered route contradicts its own label.
    """
    metres_per_degree_lat = 110_996.0
    metres_per_degree_lon = 92_315.0  # at latitude 34
    walking_metres_per_minute = 84.0  # 1.4 m/s

    for u, v, minutes, _accessible, _heat in DEMO_EDGES:
        (lon_u, lat_u), (lon_v, lat_v) = NODE_LOCATIONS[u], NODE_LOCATIONS[v]
        east_west = (lon_v - lon_u) * metres_per_degree_lon
        north_south = (lat_v - lat_u) * metres_per_degree_lat
        straight_line = (east_west**2 + north_south**2) ** 0.5

        assert straight_line < minutes * walking_metres_per_minute, (
            f"{u}-{v} claims {minutes} minutes but its nodes are "
            f"{straight_line:.0f} m apart"
        )


def test_candidate_sites_sit_on_their_graph_node():
    """The mapped facility and the simulation destination must be one place."""
    for candidate in CANDIDATE_SITES:
        assert candidate.location == NODE_LOCATIONS[candidate.node]


def test_unknown_site_id_is_rejected():
    with pytest.raises(ValueError, match="site_x"):
        site("site_x")
