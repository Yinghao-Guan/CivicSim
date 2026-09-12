"""Where a report is: inside the supported area, and which modeled street.

Distances use a flat-earth approximation at 34 deg N, the same constants the
map pipeline uses (scripts/demo_area.py). Good to ~0.1% over an area this size.
"""

from dataclasses import dataclass
from math import hypot

from scan_api import backend_bridge  # noqa: F401  (puts backend/ on sys.path)

from data.demo_neighborhood import DEMO_AREA_SWNE, DEMO_EDGES, NODE_LOCATIONS

M_PER_DEG_LAT = 110_900.0
M_PER_DEG_LON = 92_400.0

Coordinate = tuple[float, float]


@dataclass(frozen=True)
class Segment:
    edge_id: str
    path: tuple[Coordinate, Coordinate]
    distance_m: float
    travel_time: float
    wheelchair_accessible: bool
    heat_exposure: float


def in_area(location: Coordinate) -> bool:
    lon, lat = location
    south, west, north, east = DEMO_AREA_SWNE
    return south <= lat <= north and west <= lon <= east


def area_bounds() -> tuple[Coordinate, Coordinate]:
    """[[west, south], [east, north]], as MapLibre's fitBounds expects."""
    south, west, north, east = DEMO_AREA_SWNE
    return ((west, south), (east, north))


def modeled_segments() -> list[Segment]:
    """Every edge of the demo graph, with its drawn geometry."""
    return [
        Segment(
            edge_id=edge_id,
            path=(NODE_LOCATIONS[u], NODE_LOCATIONS[v]),
            distance_m=0.0,
            travel_time=travel_time,
            wheelchair_accessible=accessible,
            heat_exposure=heat,
        )
        for edge_id, u, v, travel_time, accessible, heat in DEMO_EDGES
    ]


def nearest_segment(location: Coordinate) -> Segment:
    best: Segment | None = None
    for segment in modeled_segments():
        distance = _point_to_segment_m(location, *segment.path)
        if best is None or distance < best.distance_m:
            best = Segment(**{**segment.__dict__, "distance_m": distance})
    assert best is not None, "The demo graph has no edges."
    return best


def _point_to_segment_m(p: Coordinate, a: Coordinate, b: Coordinate) -> float:
    px, py = _metres(p, a)
    bx, by = _metres(b, a)
    length_sq = bx * bx + by * by
    t = 0.0 if length_sq == 0 else max(0.0, min(1.0, (px * bx + py * by) / length_sq))
    return hypot(px - t * bx, py - t * by)


def _metres(p: Coordinate, origin: Coordinate) -> tuple[float, float]:
    return ((p[0] - origin[0]) * M_PER_DEG_LON, (p[1] - origin[1]) * M_PER_DEG_LAT)
