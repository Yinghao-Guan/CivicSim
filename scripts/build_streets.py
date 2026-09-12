"""Extract the demo area's walkable street network from OpenStreetMap.

The simulation graph in backend/data/demo_neighborhood.py is a small designed
network; its node coordinates are presentation only. This script fetches the
real streets around those nodes so the backend can draw each modeled walk
along actual roads instead of straight lines. Nothing in the simulation reads
the result.

Output: backend/data/streets.json

    {"source": ..., "nodes": [[lon, lat], ...], "edges": [[i, j], ...]}

Run from the repository root:

    uv run --with requests python scripts/build_streets.py
"""

from __future__ import annotations

import json
from pathlib import Path

from demo_area import DEMO_AREA
from overpass import query

OUTPUT = Path(__file__).resolve().parent.parent / "backend" / "data" / "streets.json"

# Ways a pedestrian can walk along. Motorways and their ramps are excluded.
WALKABLE = (
    "primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|"
    "residential|unclassified|living_street|service|pedestrian|footway|path|"
    "steps|crossing|track"
)

# A margin so walks between nodes near the edge of the area still find a route.
BUFFER_M = 250


def main() -> None:
    bbox = DEMO_AREA.buffered(BUFFER_M)
    ql = f"""
    [out:json][timeout:120];
    way["highway"~"^({WALKABLE})$"]({bbox.overpass()});
    (._;>;);
    out skel qt;
    """
    payload = query(ql, label="streets")

    coords: dict[int, tuple[float, float]] = {}
    ways: list[list[int]] = []
    for element in payload["elements"]:
        if element["type"] == "node":
            coords[element["id"]] = (round(element["lon"], 6), round(element["lat"], 6))
        elif element["type"] == "way":
            ways.append(element["nodes"])

    index: dict[int, int] = {}
    nodes: list[tuple[float, float]] = []
    edges: set[tuple[int, int]] = set()
    for way in ways:
        for a, b in zip(way, way[1:]):
            if a not in coords or b not in coords or a == b:
                continue
            for osm_id in (a, b):
                if osm_id not in index:
                    index[osm_id] = len(nodes)
                    nodes.append(coords[osm_id])
            i, j = sorted((index[a], index[b]))
            edges.add((i, j))

    OUTPUT.write_text(
        json.dumps(
            {
                "source": "OpenStreetMap via Overpass API, ODbL",
                "bbox_swne": list(bbox),
                "nodes": nodes,
                "edges": sorted(edges),
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    size_kb = OUTPUT.stat().st_size / 1e3
    print(f"  {len(nodes)} nodes, {len(edges)} edges, {size_kb:.0f} KB -> {OUTPUT}")


if __name__ == "__main__":
    main()
