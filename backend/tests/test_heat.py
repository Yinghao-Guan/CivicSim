"""Street heat intensity is read off the walking graph, never invented."""

import networkx as nx
import pytest

from data.demo_neighborhood import DEMO_EDGES, build_demo_graph
from simulation.heat import street_heat
from simulation.routing import HEAT_ATTR, WEIGHT_ATTR


def test_every_edge_gets_exposed_minutes_per_minute_walked():
    heat = {(s.u, s.v): s.intensity for s in street_heat(build_demo_graph())}

    assert len(heat) == len(DEMO_EDGES)
    for u, v, travel_time, _accessible, exposure in DEMO_EDGES:
        a, b = sorted((u, v), key=str)
        assert heat[(a, b)] == pytest.approx(exposure / travel_time)


def test_order_is_stable():
    assert street_heat(build_demo_graph()) == street_heat(build_demo_graph())


def test_exposure_longer_than_the_walk_is_a_data_error():
    graph = nx.Graph()
    graph.add_edge("a", "b", **{WEIGHT_ATTR: 2.0, HEAT_ATTR: 3.0})

    with pytest.raises(ValueError, match="exposure must lie between"):
        street_heat(graph)
