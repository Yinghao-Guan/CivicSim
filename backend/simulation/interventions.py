"""Interventions: edits a user makes to the neighborhood before re-running it.

An intervention never touches the loaded graph. It returns a new graph for one
run, so the canonical scenarios stay exactly as they were computed at startup
and two runs can never contaminate each other.

Shade is the only intervention modeled so far. It changes heat exposure, not
travel time and not accessibility, so a shaded route is the same walk in less
sun rather than a different walk.
"""

from typing import Iterable

import networkx as nx

from simulation.routing import EDGE_ID_ATTR, HEAT_ATTR

#: Share of modeled unshaded exposure a shaded segment removes.
#:
#: A demo assumption, not a measurement: mature street trees over a sidewalk
#: remove most but not all exposure, so a shaded segment keeps 40% of its
#: modeled minutes. Stated in the response warnings so nobody reads the
#: resulting number as surveyed.
SHADE_HEAT_REDUCTION = 0.6


def apply_shade(graph: nx.Graph, edge_ids: Iterable[str]) -> nx.Graph:
    """A copy of `graph` with shade over the given edges.

    `Graph.copy()` is an independent shallow copy: the edge attribute dicts are
    new objects, so writing to them cannot reach the original graph.
    """
    requested = set(edge_ids)
    if not requested:
        return graph

    shaded = graph.copy()
    remaining = set(requested)

    for u, v, attrs in shaded.edges(data=True):
        edge_id = attrs.get(EDGE_ID_ATTR)
        if edge_id in remaining:
            remaining.discard(edge_id)
            attrs[HEAT_ATTR] = attrs[HEAT_ATTR] * (1.0 - SHADE_HEAT_REDUCTION)

    if remaining:
        unknown = ", ".join(sorted(remaining))
        raise ValueError(f"No graph edge carries the id(s): {unknown}.")

    return shaded


def shaded_edge_count(graph: nx.Graph, edge_ids: Iterable[str]) -> int:
    """How many edges an intervention would actually touch."""
    wanted = set(edge_ids)
    return sum(
        1
        for _u, _v, edge_id in graph.edges.data(EDGE_ID_ATTR)
        if edge_id in wanted
    )
