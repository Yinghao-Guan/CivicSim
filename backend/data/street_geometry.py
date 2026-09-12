"""Draw modeled walks along the real streets of the demo area.

The simulation routes over the small designed graph in demo_neighborhood.py,
and nothing here changes a travel time, an accessibility flag or a metric.
This module only decides how each modeled edge is *drawn*: as the shortest
walk along OpenStreetMap streets (streets.json, from scripts/build_streets.py)
between the edge's two node locations, instead of a straight line.
"""

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Hashable, Sequence

import networkx as nx

from data.demo_neighborhood import location

Coordinate = tuple[float, float]

STREETS_PATH = Path(__file__).with_name("streets.json")

#: Metres per degree near the demo area (latitude ~34 N).
M_PER_DEG_LON = 92_200.0
M_PER_DEG_LAT = 110_900.0


def metres(a: Coordinate, b: Coordinate) -> float:
    return math.hypot((b[0] - a[0]) * M_PER_DEG_LON, (b[1] - a[1]) * M_PER_DEG_LAT)


@lru_cache(maxsize=1)
def _streets() -> tuple[list[Coordinate], nx.Graph]:
    """The street graph, reduced to its largest connected piece."""
    data = json.loads(STREETS_PATH.read_text(encoding="utf-8"))
    nodes: list[Coordinate] = [tuple(point) for point in data["nodes"]]
    graph = nx.Graph()
    for i, j in data["edges"]:
        graph.add_edge(i, j, length=metres(nodes[i], nodes[j]))
    largest = max(nx.connected_components(graph), key=len)
    return nodes, graph.subgraph(largest).copy()


@lru_cache(maxsize=None)
def _nearest_street_node(node: Hashable) -> int:
    nodes, graph = _streets()
    point = location(node)
    return min(graph.nodes, key=lambda index: metres(point, nodes[index]))


@lru_cache(maxsize=None)
def edge_geometry(u: Hashable, v: Hashable) -> tuple[Coordinate, ...]:
    """The drawn line for one modeled edge, from u's location to v's.

    Falls back to the straight line only if the two ends share no street path,
    which cannot happen once both are snapped into the same connected piece.
    """
    nodes, graph = _streets()
    start, end = location(u), location(v)
    try:
        indices = nx.shortest_path(
            graph, _nearest_street_node(u), _nearest_street_node(v), weight="length"
        )
    except nx.NetworkXNoPath:
        return (start, end)
    points = [start, *(nodes[index] for index in indices), end]
    return tuple(p for k, p in enumerate(points) if k == 0 or p != points[k - 1])


def walk_geometry(path: Sequence[Hashable]) -> list[Coordinate]:
    """The drawn line for a whole route through the modeled graph."""
    if len(path) < 2:
        return [location(node) for node in path]
    line: list[Coordinate] = []
    for u, v in zip(path, path[1:]):
        for point in edge_geometry(u, v):
            if not line or point != line[-1]:
                line.append(point)
    return line
