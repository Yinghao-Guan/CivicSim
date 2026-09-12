"""Pure-Python geometry helpers.

Enough polygon handling to turn Overpass output into GeoJSON and to test
which buildings sit inside a facility campus. Intentionally no shapely or
GDAL: the shapes here are tiny and the dependency is not worth the
cross-platform install burden (docs/04-map-milestone-plan.md section 4).

Coordinates are (lon, lat) tuples throughout, matching GeoJSON order.
"""

from __future__ import annotations

Ring = list[tuple[float, float]]
Polygon = list[Ring]  # [outer, hole, hole, ...]


def ring_from_geometry(geometry: list[dict]) -> Ring:
    """Convert an Overpass `geometry` array into a (lon, lat) ring."""
    return [(pt["lon"], pt["lat"]) for pt in geometry if "lon" in pt and "lat" in pt]


def closed(ring: Ring) -> Ring:
    """Return the ring with its first point repeated at the end."""
    if len(ring) >= 2 and ring[0] != ring[-1]:
        return [*ring, ring[0]]
    return ring


def signed_area(ring: Ring) -> float:
    """Shoelace area in square degrees. Positive is counter-clockwise.

    Computed relative to the ring's first vertex. Shoelace terms on raw
    lon/lat near (-118, 34) are around 4e3 while a building's true area is
    around 1e-8, so summing them directly loses the answer entirely to
    floating-point cancellation. Translating to a local origin first keeps
    every term the same magnitude as the result.
    """
    r = closed(ring)
    if len(r) < 4:
        return 0.0
    ox, oy = r[0]
    total = 0.0
    for (x1, y1), (x2, y2) in zip(r, r[1:]):
        total += (x1 - ox) * (y2 - oy) - (x2 - ox) * (y1 - oy)
    return total / 2.0


def centroid(ring: Ring) -> tuple[float, float]:
    """Area-weighted centroid of a ring, falling back to the mean vertex.

    Shifted to a local origin for the same precision reason as `signed_area`.
    The fallback matters for degenerate footprints (zero area, or a ring that
    is really a line), which OSM does contain a few of.
    """
    r = closed(ring)
    if len(r) < 4:
        n = len(ring) or 1
        return (sum(x for x, _ in ring) / n, sum(y for _, y in ring) / n)

    ox, oy = r[0]
    area = signed_area(r)
    if abs(area) < 1e-15:
        n = len(ring) or 1
        return (sum(x for x, _ in ring) / n, sum(y for _, y in ring) / n)

    cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(r, r[1:]):
        ax, ay = x1 - ox, y1 - oy
        bx, by = x2 - ox, y2 - oy
        cross = ax * by - bx * ay
        cx += (ax + bx) * cross
        cy += (ay + by) * cross
    return (ox + cx / (6.0 * area), oy + cy / (6.0 * area))


def point_in_ring(x: float, y: float, ring: Ring) -> bool:
    """Ray-casting point-in-polygon test."""
    r = closed(ring)
    inside = False
    for (x1, y1), (x2, y2) in zip(r, r[1:]):
        if (y1 > y) != (y2 > y):
            # x coordinate where the edge crosses the horizontal line at y
            t = (y - y1) / (y2 - y1)
            if x < x1 + t * (x2 - x1):
                inside = not inside
    return inside


def point_in_polygon(x: float, y: float, polygon: Polygon) -> bool:
    """Inside the outer ring and outside every hole."""
    if not polygon or not point_in_ring(x, y, polygon[0]):
        return False
    return not any(point_in_ring(x, y, hole) for hole in polygon[1:])


def orient(polygon: Polygon) -> Polygon:
    """Wind a polygon per GeoJSON RFC 7946: outer ring CCW, holes CW.

    OSM ways carry no consistent winding, and while MapLibre tolerates either
    for `fill-extrusion`, tippecanoe (needed for the district-scale PMTiles
    export) does not. Normalising here keeps that door open.
    """
    if not polygon:
        return polygon
    outer, *holes = polygon
    if signed_area(outer) < 0:
        outer = list(reversed(outer))
    fixed_holes = [
        list(reversed(h)) if signed_area(h) > 0 else h for h in holes
    ]
    return [outer, *fixed_holes]


def bounds(ring: Ring) -> tuple[float, float, float, float]:
    """(min_lon, min_lat, max_lon, max_lat) — a cheap pre-filter."""
    xs = [x for x, _ in ring]
    ys = [y for _, y in ring]
    return (min(xs), min(ys), max(xs), max(ys))


def stitch_rings(fragments: list[Ring]) -> list[Ring]:
    """Join way fragments end-to-end into closed rings.

    A multipolygon relation's members are often partial rings that only form
    a closed loop once joined. Fragments that never close are still returned,
    closed by force, so that a slightly broken OSM relation degrades into a
    usable shape instead of disappearing.
    """
    pending = [list(f) for f in fragments if len(f) >= 2]
    rings: list[Ring] = []

    while pending:
        current = pending.pop(0)
        joined = True
        while joined and current[0] != current[-1]:
            joined = False
            for i, candidate in enumerate(pending):
                if candidate[0] == current[-1]:
                    current.extend(candidate[1:])
                elif candidate[-1] == current[-1]:
                    current.extend(reversed(candidate[:-1]))
                elif candidate[-1] == current[0]:
                    current = candidate[:-1] + current
                elif candidate[0] == current[0]:
                    current = list(reversed(candidate[1:])) + current
                else:
                    continue
                pending.pop(i)
                joined = True
                break
        if len(current) >= 3:
            rings.append(closed(current))
    return rings


def polygons_from_element(element: dict) -> list[Polygon]:
    """Extract polygons from an Overpass way or relation with `out geom`."""
    if element.get("type") == "way":
        ring = ring_from_geometry(element.get("geometry") or [])
        if len(ring) < 3:
            return []
        return [[closed(ring)]]

    if element.get("type") != "relation":
        return []

    outer_fragments: list[Ring] = []
    inner_fragments: list[Ring] = []
    for member in element.get("members") or []:
        if member.get("type") != "way" or not member.get("geometry"):
            continue
        ring = ring_from_geometry(member["geometry"])
        if len(ring) < 2:
            continue
        # An empty or unknown role is treated as outer, which is what
        # OSM convention implies for building relations.
        if member.get("role") == "inner":
            inner_fragments.append(ring)
        else:
            outer_fragments.append(ring)

    outers = stitch_rings(outer_fragments)
    inners = stitch_rings(inner_fragments)
    if not outers:
        return []

    # Assign each hole to the first outer ring that contains it.
    polygons: list[Polygon] = [[o] for o in outers]
    for hole in inners:
        hx, hy = centroid(hole)
        for polygon in polygons:
            if point_in_ring(hx, hy, polygon[0]):
                polygon.append(hole)
                break
    return polygons
