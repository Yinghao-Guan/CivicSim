"""Deterministic routing proof on a tiny hand-built graph.

The point of this test is the core CivicSim claim in its smallest form:
an agent's mobility constraint genuinely changes the route it can take.

The graph is defined here rather than loaded from a file so the expected
routes can be read off by hand.
"""

import networkx as nx
import pytest

from simulation.agents import Agent
from simulation.routing import (
    ACCESSIBLE_ATTR,
    WEIGHT_ATTR,
    Route,
    Unreachable,
    route_agent,
    route_agents,
)

DESTINATION = "cooling_center"

# (u, v, travel_time_minutes, wheelchair_accessible)
#
#   stair route     origin_a - n1 - n2 - cooling_center        6.0 min
#                              (n1-n2 is stairs, not accessible)
#   detour route    origin_a - n3 - n4 - n5 - cooling_center  12.0 min
#   origin_b sits behind a stair-only connection at n6-n2
#   island_park has no edges at all
EDGES = (
    ("origin_a", "n1", 2.0, True),
    ("n1", "n2", 2.0, False),  # stairs: on the shortest path
    ("n2", "cooling_center", 2.0, True),
    ("origin_a", "n3", 3.0, True),
    ("n3", "n4", 3.0, True),
    ("n4", "n5", 3.0, True),
    ("n5", "cooling_center", 3.0, True),
    ("origin_b", "n6", 1.0, True),
    ("n6", "n2", 1.0, False),  # stairs: origin_b's only way out
)

ISOLATED_NODES = ("island_park",)


@pytest.fixture
def graph():
    g = nx.Graph()
    g.add_nodes_from(ISOLATED_NODES)
    for u, v, travel_time, accessible in EDGES:
        g.add_edge(u, v, **{WEIGHT_ATTR: travel_time, ACCESSIBLE_ATTR: accessible})
    return g


@pytest.fixture
def general_agent():
    return Agent(agent_id="agent_001", profile="general", origin="origin_a")


@pytest.fixture
def constrained_agent():
    return Agent(
        agent_id="agent_002",
        profile="mobility_constrained",
        origin="origin_a",
        requires_accessible_route=True,
    )


def test_graph_is_the_expected_size(graph):
    assert 8 <= graph.number_of_nodes() <= 12


def test_general_agent_takes_the_short_route_through_the_stairs(graph, general_agent):
    result = route_agent(graph, general_agent, DESTINATION)

    assert isinstance(result, Route)
    assert result.path == ("origin_a", "n1", "n2", "cooling_center")
    assert result.travel_time == pytest.approx(6.0)


def test_mobility_constrained_agent_is_forced_onto_the_longer_route(
    graph, constrained_agent
):
    result = route_agent(graph, constrained_agent, DESTINATION)

    assert isinstance(result, Route)
    assert result.path == ("origin_a", "n3", "n4", "n5", "cooling_center")
    assert result.travel_time == pytest.approx(12.0)


def test_constraint_changes_the_route_and_costs_more(
    graph, general_agent, constrained_agent
):
    """The headline claim: the same origin and destination, different outcome."""
    unconstrained = route_agent(graph, general_agent, DESTINATION)
    constrained = route_agent(graph, constrained_agent, DESTINATION)

    assert constrained.path != unconstrained.path
    assert constrained.travel_time > unconstrained.travel_time


def test_no_accessible_route_reports_a_barrier_instead_of_raising(graph):
    """origin_b can only leave via stairs, so a wheelchair user is cut off."""
    stranded = Agent(
        agent_id="agent_003",
        profile="mobility_constrained",
        origin="origin_b",
        requires_accessible_route=True,
    )

    result = route_agent(graph, stranded, DESTINATION)

    assert isinstance(result, Unreachable)
    assert result.reason == "accessibility_barrier"
    assert result.origin == "origin_b"


def test_same_origin_is_reachable_for_an_unconstrained_agent(graph):
    """Confirms the barrier above is the constraint, not a disconnected graph."""
    walker = Agent(agent_id="agent_004", profile="general", origin="origin_b")

    result = route_agent(graph, walker, DESTINATION)

    assert isinstance(result, Route)
    assert result.path == ("origin_b", "n6", "n2", "cooling_center")


def test_a_genuinely_disconnected_origin_reports_no_route(graph):
    islander = Agent(
        agent_id="agent_005",
        profile="mobility_constrained",
        origin="island_park",
        requires_accessible_route=True,
    )

    result = route_agent(graph, islander, DESTINATION)

    assert isinstance(result, Unreachable)
    assert result.reason == "no_route"


def test_routing_does_not_mutate_the_graph(graph, constrained_agent):
    before = (graph.number_of_nodes(), graph.number_of_edges())

    route_agent(graph, constrained_agent, DESTINATION)

    assert (graph.number_of_nodes(), graph.number_of_edges()) == before
    assert graph.edges["n1", "n2"][ACCESSIBLE_ATTR] is False


def test_routing_is_deterministic_across_repeated_runs(graph, constrained_agent):
    results = [route_agent(graph, constrained_agent, DESTINATION) for _ in range(5)]

    assert all(r == results[0] for r in results)


def test_route_agents_preserves_input_order(graph, general_agent, constrained_agent):
    results = route_agents(graph, (general_agent, constrained_agent), DESTINATION)

    assert [r.agent_id for r in results] == ["agent_001", "agent_002"]
