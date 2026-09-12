"""Build web/public/data/buildings.geojson for the demo area.

Milestone M1 of docs/05-map-milestone-plan.md. Extracts building footprints
from OpenStreetMap via Overpass, resolves a height for every one of them,
attaches facility classifications, and writes a MapLibre-ready GeoJSON that
layer (2) renders with `fill-extrusion`.

Usage:
    python scripts/build_buildings.py
    python scripts/build_buildings.py --force     # ignore the Overpass cache

The output is deterministic: same input, byte-identical file. It carries no
timestamp so that re-running it produces an empty git diff.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import demo_area as area
import geometry as geom
import overpass

ROOT = Path(__file__).resolve().parent.parent

# The browser fetches this file directly, and doc 04 section 2.3.2 already
# places the offline PMTiles in public/, so public/data is its single home.
# Committing it here rather than in a separate data/ directory keeps one copy
# in the repository while preserving clone-and-run.
OUTPUT = ROOT / "web" / "public" / "data" / "buildings.geojson"

# Generated so that the bounding box is defined once, in demo_area.py, instead
# of being hand-copied into TypeScript where it could silently drift.
TS_OUTPUT = ROOT / "web" / "lib" / "demoArea.generated.ts"

# Coordinates are rounded to 6 decimals (~0.11 m at this latitude) — far
# finer than the footprints warrant, and it roughly halves the file size.
COORD_PRECISION = 6

DEFAULT_HEIGHT_M = 5.0
METRES_PER_LEVEL = 3.0

# Buildings whose OSM type implies they are not somewhere people live.
# Used only to populate `building_type`; nothing is dropped.
_FEET_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*\")?$")


def parse_height(raw: str | None) -> float | None:
    """Parse an OSM height value into metres, or None if unusable.

    OSM heights are mostly plain metres but occasionally carry a unit or use
    feet-and-inches notation, so those are handled rather than discarded.
    """
    if not raw:
        return None
    text = raw.strip().lower().replace(",", ".")
    if not text:
        return None

    feet = _FEET_RE.match(text)
    if feet:
        inches = float(feet.group(2)) if feet.group(2) else 0.0
        return round(float(feet.group(1)) * 0.3048 + inches * 0.0254, 2)

    text = text.removesuffix("m").removesuffix("metres").removesuffix("meters").strip()
    try:
        value = float(text)
    except ValueError:
        return None
    # Guard against typos like height=0 or height=999 that would wreck the
    # extrusion; treat them as missing and let the fallback chain decide.
    if not 0.5 <= value <= 300.0:
        return None
    return round(value, 2)


def parse_levels(raw: str | None) -> float | None:
    if not raw:
        return None
    try:
        levels = float(raw.strip().split(";")[0])
    except ValueError:
        return None
    if not 0.5 <= levels <= 100:
        return None
    return levels


def resolve_height(tags: dict) -> tuple[float, str]:
    """Height fallback chain from docs/04 section 2.3.1.

    Returns (metres, source) where source is measured | levels | default.
    """
    measured = parse_height(tags.get("height"))
    if measured is not None:
        return measured, "measured"
    levels = parse_levels(tags.get("building:levels"))
    if levels is not None:
        return round(levels * METRES_PER_LEVEL, 2), "levels"
    return DEFAULT_HEIGHT_M, "default"


def parse_accessibility(tags: dict) -> str:
    """Map OSM `wheelchair` to our vocabulary.

    Almost every building will be `unknown`. That is a real property of the
    data, and doc 01 section 13.4 wants it visible rather than papered over.
    """
    value = (tags.get("wheelchair") or "").strip().lower()
    if value in ("yes", "limited", "no", "designated"):
        return "designated" if value == "designated" else value
    return "unknown"


def fetch_buildings(force: bool) -> list[dict]:
    ql = f"""
[out:json][timeout:300];
(
  way["building"]({area.DEMO_AREA.overpass()});
  relation["building"]({area.DEMO_AREA.overpass()});
);
out geom;
"""
    return overpass.query(ql, label="buildings", force=force)["elements"]


def fetch_facilities(force: bool) -> list[dict]:
    """Facility features, from a box buffered so partly-overlapping campuses match."""
    box = area.DEMO_AREA.buffered(300).overpass()
    amenities = "|".join(
        sorted({v for (k, v) in area.ALL_FACILITIES if k == "amenity"})
    )
    leisures = "|".join(sorted({v for (k, v) in area.ALL_FACILITIES if k == "leisure"}))
    ql = f"""
[out:json][timeout:300];
(
  node["amenity"~"^({amenities})$"]({box});
  way["amenity"~"^({amenities})$"]({box});
  relation["amenity"~"^({amenities})$"]({box});
  way["leisure"~"^({leisures})$"]({box});
  relation["leisure"~"^({leisures})$"]({box});
);
out geom;
"""
    return overpass.query(ql, label="facilities", force=force)["elements"]


def build_facility_index(elements: list[dict]) -> list[dict]:
    """Facility polygons with a bounding box, for cheap containment tests."""
    index = []
    for element in elements:
        tags = element.get("tags") or {}
        ftype = area.facility_type(tags)
        if ftype is None:
            continue
        for polygon in geom.polygons_from_element(element):
            index.append(
                {
                    "facility_type": ftype,
                    "name": tags.get("name"),
                    "polygon": polygon,
                    "bounds": geom.bounds(polygon[0]),
                }
            )
    return index


def match_facility(lon: float, lat: float, index: list[dict]) -> dict | None:
    """Smallest facility polygon containing the point, if any.

    Smallest wins so that a building inside a sports centre that itself sits
    inside a park is attributed to the sports centre.
    """
    best = None
    best_area = float("inf")
    for entry in index:
        min_lon, min_lat, max_lon, max_lat = entry["bounds"]
        if not (min_lon <= lon <= max_lon and min_lat <= lat <= max_lat):
            continue
        if not geom.point_in_polygon(lon, lat, entry["polygon"]):
            continue
        size = abs(geom.signed_area(entry["polygon"][0]))
        if size < best_area:
            best, best_area = entry, size
    return best


def round_polygon(polygon: geom.Polygon) -> list[list[list[float]]]:
    """Normalise ring winding, then round coordinates for output."""
    return [
        [[round(x, COORD_PRECISION), round(y, COORD_PRECISION)] for x, y in ring]
        for ring in geom.orient(polygon)
    ]


def build_features(buildings: list[dict], facilities: list[dict]) -> tuple[list, Counter]:
    stats: Counter = Counter()
    features = []

    for element in buildings:
        tags = element.get("tags") or {}
        polygons = geom.polygons_from_element(element)
        if not polygons:
            stats["skipped_no_geometry"] += 1
            continue

        # Overpass returns everything *intersecting* the box; keep the ones
        # whose centroid is inside it so the count is stable and the slice
        # has a crisp edge.
        outer = polygons[0][0]
        lon, lat = geom.centroid(outer)
        if not area.DEMO_AREA.contains(lat, lon):
            stats["skipped_outside_bbox"] += 1
            continue

        height, height_source = resolve_height(tags)
        stats[f"height_{height_source}"] += 1

        # A facility tag on the building itself beats an enclosing campus.
        own_type = area.facility_type(tags)
        matched = None if own_type else match_facility(lon, lat, facilities)
        ftype = own_type or (matched["facility_type"] if matched else None)
        facility_name = tags.get("name") or (matched["name"] if matched else None)
        if ftype:
            stats[f"facility_{ftype}"] += 1

        osm_type = "w" if element["type"] == "way" else "r"
        building_id = f"{osm_type}{element['id']}"

        properties = {
            "building_id": building_id,
            "height": height,
            "height_source": height_source,
            "building_type": tags.get("building") or "yes",
            "facility_type": ftype,
            "facility_name": facility_name if ftype else None,
            "candidate_eligible": area.is_candidate_eligible(ftype),
            # Chosen during scenario design, not here. See docs/05 section 3.4.
            "candidate_site": False,
            "accessibility": parse_accessibility(tags),
            "name": tags.get("name"),
            "osm_id": element["id"],
            "osm_type": element["type"],
        }

        if len(polygons) == 1:
            gj = {"type": "Polygon", "coordinates": round_polygon(polygons[0])}
        else:
            gj = {
                "type": "MultiPolygon",
                "coordinates": [round_polygon(p) for p in polygons],
            }
            stats["multipolygon"] += 1

        features.append(
            {"type": "Feature", "id": building_id, "geometry": gj, "properties": properties}
        )

    # Sorted so the committed file is stable across runs and machines.
    features.sort(key=lambda f: (f["properties"]["osm_type"], f["properties"]["osm_id"]))
    return features, stats


def write_typescript_constants(building_count: int) -> None:
    """Emit the demo-area constants the frontend needs at build time."""
    box = area.DEMO_AREA
    content = f"""// GENERATED by scripts/build_buildings.py -- do not edit by hand.
// The demo area is defined once, in scripts/demo_area.py. See
// docs/05-map-milestone-plan.md section 3.

/** [south, west, north, east] in WGS84 degrees. */
export const DEMO_AREA_SWNE = [
  {box.south}, {box.west}, {box.north}, {box.east},
] as const;

/** [west, south, east, north] -- the order MapLibre's fitBounds expects. */
export const DEMO_AREA_BOUNDS: [[number, number], [number, number]] = [
  [{box.west}, {box.south}],
  [{box.east}, {box.north}],
];

export const DEMO_AREA_CENTER: [number, number] = [
  {round((box.west + box.east) / 2, 6)}, {round((box.south + box.north) / 2, 6)},
];

/** The Beehive: the venue the demo area is built around. */
export const VENUE = {{
  name: {json.dumps(area.VENUE_NAME)},
  lngLat: [{area.VENUE_LON}, {area.VENUE_LAT}] as [number, number],
  councilDistrict: 9,
}};

export const BUILDING_COUNT = {building_count};

/** Served from web/public, so this is the browser-visible path. */
export const BUILDINGS_URL = "/data/buildings.geojson";
"""
    TS_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    TS_OUTPUT.write_text(content, encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force", action="store_true", help="refetch from Overpass, ignoring the cache"
    )
    args = parser.parse_args()

    print(f"Demo area: {area.DEMO_AREA.overpass()}")
    print(f"Venue:     {area.VENUE_NAME}\n")

    buildings = fetch_buildings(args.force)
    facilities = fetch_facilities(args.force)
    print()

    facility_index = build_facility_index(facilities)
    print(f"Facility polygons available for matching: {len(facility_index)}")

    features, stats = build_features(buildings, facility_index)

    payload = {
        "type": "FeatureCollection",
        # Non-standard metadata keys; ignored by MapLibre, useful to a reader.
        "civicsim": {
            "milestone": "M1",
            "venue": area.VENUE_NAME,
            "venue_lonlat": [area.VENUE_LON, area.VENUE_LAT],
            "bbox_swne": list(area.DEMO_AREA),
            "source": "OpenStreetMap via Overpass API, ODbL",
            "height_fallback": "height -> building:levels * 3 m -> 5 m",
            "building_count": len(features),
        },
        "features": features,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    # newline="\n" explicitly: the default translates to CRLF on Windows, so
    # the same script would otherwise emit different bytes on a Mac and a PC.
    OUTPUT.write_text(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    size_mb = OUTPUT.stat().st_size / 1e6
    print(
        f"\nWrote {OUTPUT.relative_to(ROOT).as_posix()}: "
        f"{len(features)} buildings, {size_mb:.2f} MB"
    )

    write_typescript_constants(len(features))
    print(f"Wrote {TS_OUTPUT.relative_to(ROOT).as_posix()}")

    total = len(features) or 1
    print("\nHeight source:")
    for source in ("measured", "levels", "default"):
        count = stats[f"height_{source}"]
        print(f"  {source:9s} {count:6d}  {100 * count / total:5.1f}%")

    print("\nFacility buildings:")
    facility_rows = sorted(
        ((k[len("facility_") :], v) for k, v in stats.items() if k.startswith("facility_")),
        key=lambda kv: -kv[1],
    )
    if facility_rows:
        for name, count in facility_rows:
            eligible = "candidate pool" if area.is_candidate_eligible(name) else "context only"
            print(f"  {name:20s} {count:5d}  ({eligible})")
    else:
        print("  none")

    print("\nOther:")
    for key in ("multipolygon", "skipped_no_geometry", "skipped_outside_bbox"):
        print(f"  {key:22s} {stats[key]}")

    expected = area.EXPECTED_BUILDINGS
    drift = abs(len(features) - expected) / expected
    if drift > area.EXPECTED_BUILDINGS_TOLERANCE:
        print(
            f"\nWARNING: {len(features)} buildings differs from the M0 measurement "
            f"({expected}) by {100 * drift:.1f}%, above the "
            f"{100 * area.EXPECTED_BUILDINGS_TOLERANCE:.0f}% tolerance.\n"
            "         Either OSM data changed or the filtering did. Investigate "
            "before trusting the slice."
        )
        return 1

    print(f"\nMatches the M0 measurement ({expected}) within tolerance.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
