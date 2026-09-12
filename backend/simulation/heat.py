"""Street heat: how much of each walk is spent in unshaded heat.

Every edge of the walking graph already models its heat exposure in minutes.
Divided by the edge's travel time, that becomes an intensity in [0, 1] - the
share of the walk spent exposed. This is what the map's heat layer draws. It
is read straight off the graph, so it can never disagree with the heat
exposure the metrics report.
"""

from dataclasses import dataclass
from typing import Hashable

import networkx as nx

from simulation.routing import HEAT_ATTR, WEIGHT_ATTR


@dataclass(frozen=True)
class StreetHeat:
    """Heat intensity along one street segment of the walking graph."""

    u: Hashable
    v: Hashable
    #: Exposed minutes per minute walked, 0.0-1.0.
    intensity: float


def street_heat(graph: nx.Graph) -> tuple[StreetHeat, ...]:
    """Heat intensity for every edge, in a stable order.

    Raises rather than clamping when an edge reports more exposed minutes than
    walking minutes: that is a data error, and hiding it would misstate heat.
    """
    segments = []
    for u, v, data in graph.edges(data=True):
        travel_time = data[WEIGHT_ATTR]
        heat = data[HEAT_ATTR]
        if travel_time <= 0 or not 0 <= heat <= travel_time:
            raise ValueError(
                f"Edge {u!r}-{v!r} has heat exposure {heat} for travel time "
                f"{travel_time}; exposure must lie between 0 and the travel time."
            )
        a, b = sorted((u, v), key=str)
        segments.append(StreetHeat(u=a, v=b, intensity=heat / travel_time))
    return tuple(sorted(segments, key=lambda s: (str(s.u), str(s.v))))
