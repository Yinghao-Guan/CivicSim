"""Build the offline basemap package for demo day.

Milestone M5 of docs/05-map-milestone-plan.md. Downloads the vector tiles and
glyphs the demo area needs into web/public/offline/, so the map keeps working
when the venue Wi-Fi does not (doc 04 section 2.3.2).

Usage:
    python scripts/build_offline_tiles.py
    python scripts/build_offline_tiles.py --force    # re-download everything

Layers 2 and 3 are already local, so with this in place the whole demo runs
offline. Switch the app over with NEXT_PUBLIC_OFFLINE_TILES=on.

Why a tile tree rather than the PMTiles file doc 04 section 2.3.2 imagined:
PMTiles packs many tiles into one archive addressed by HTTP range requests,
which is what makes a large area practical. The demo area needs 42 tiles. At
that size the archive format buys nothing and costs a toolchain -- tippecanoe
or planetiler, neither of which installs the same way on macOS and Windows --
so plain files served from public/ are both simpler and more portable. If the
area grows to district scale, revisit this along with the tiling change in
docs/05 section 2.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests

import demo_area as area

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "web" / "public" / "offline"

TILEJSON_URL = "https://tiles.openfreemap.org/planet"
GLYPHS_TEMPLATE = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf"
USER_AGENT = "CivicSim/0.1 (hackathon project; https://github.com/Guaguaaaa/CivicSim)"

# The map sets minZoom 11 (web/lib/map.ts), so lower zooms are never requested
# and downloading them would triple the package for nothing.
MIN_ZOOM = 11

# One tile of margin so panning a little at the edge does not hit a hole.
BUFFER_TILES = 1

# Fonts referenced by lib/mapStyle.ts and lib/map.ts.
FONTSTACKS = ["Noto Sans Regular", "Noto Sans Bold"]
# Latin plus Latin-1 Supplement and Latin Extended-A covers every label in the
# area; MapLibre requests ranges lazily and only these ever came up.
GLYPH_RANGES = ["0-255", "256-511"]


def deg2tile(lat: float, lon: float, zoom: int) -> tuple[int, int]:
    """Slippy-map tile containing a coordinate."""
    n = 2**zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return x, y


def tiles_for(box: area.BBox, min_zoom: int, max_zoom: int) -> list[tuple[int, int, int]]:
    wanted = []
    for zoom in range(min_zoom, max_zoom + 1):
        limit = 2**zoom - 1
        x0, y1 = deg2tile(box.south, box.west, zoom)
        x1, y0 = deg2tile(box.north, box.east, zoom)
        for x in range(max(0, x0 - BUFFER_TILES), min(limit, x1 + BUFFER_TILES) + 1):
            for y in range(max(0, y0 - BUFFER_TILES), min(limit, y1 + BUFFER_TILES) + 1):
                wanted.append((zoom, x, y))
    return wanted


def fetch(session: requests.Session, url: str, destination: Path, force: bool) -> int:
    """Download one file unless it is already there. Returns bytes written."""
    if destination.exists() and not force:
        return 0
    response = session.get(url, timeout=60)
    if response.status_code == 404:
        # Genuinely empty tiles exist (ocean, or beyond data coverage) and are
        # not an error; MapLibre treats a missing tile as empty either way.
        return 0
    response.raise_for_status()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(response.content)
    return len(response.content)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="re-download existing files")
    args = parser.parse_args()

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    print(f"Demo area: {area.DEMO_AREA.overpass()}")
    tilejson = session.get(TILEJSON_URL, timeout=60).json()
    template = tilejson["tiles"][0]
    max_zoom = int(tilejson["maxzoom"])
    # The upstream path carries a build date; recording it makes the package
    # traceable to a specific snapshot of OpenStreetMap.
    version = template.split("/planet/")[1].split("/")[0]
    print(f"Upstream: {version}, zooms {MIN_ZOOM}-{max_zoom}\n")

    wanted = tiles_for(area.DEMO_AREA, MIN_ZOOM, max_zoom)
    print(f"Tiles to fetch: {len(wanted)}")

    total_bytes = 0
    written = 0
    for index, (zoom, x, y) in enumerate(wanted, start=1):
        url = template.replace("{z}", str(zoom)).replace("{x}", str(x)).replace("{y}", str(y))
        destination = OUTPUT / "tiles" / str(zoom) / str(x) / f"{y}.pbf"
        size = fetch(session, url, destination, args.force)
        if size:
            written += 1
            total_bytes += size
        if index % 10 == 0 or index == len(wanted):
            print(f"  {index}/{len(wanted)} ({total_bytes / 1e6:.1f} MB)")
        time.sleep(0.05)

    print("\nGlyphs:")
    for fontstack in FONTSTACKS:
        for glyph_range in GLYPH_RANGES:
            url = GLYPHS_TEMPLATE.replace("{fontstack}", quote(fontstack)).replace(
                "{range}", glyph_range
            )
            destination = OUTPUT / "fonts" / fontstack / f"{glyph_range}.pbf"
            size = fetch(session, url, destination, args.force)
            total_bytes += size
            print(f"  {fontstack}/{glyph_range}: {size / 1024:.0f} KB")

    manifest = {
        "milestone": "M5",
        "upstream": "OpenFreeMap planet tiles (OpenMapTiles schema)",
        "upstream_version": version,
        "license": "Map data from OpenStreetMap contributors, ODbL",
        "bbox_swne": list(area.DEMO_AREA),
        "minzoom": MIN_ZOOM,
        "maxzoom": max_zoom,
        "buffer_tiles": BUFFER_TILES,
        "tile_count": len(wanted),
        "fontstacks": FONTSTACKS,
        "glyph_ranges": GLYPH_RANGES,
    }
    (OUTPUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )

    on_disk = sum(f.stat().st_size for f in OUTPUT.rglob("*") if f.is_file())
    print(f"\nWrote {OUTPUT.relative_to(ROOT).as_posix()}/")
    print(f"  {written} files downloaded this run, {on_disk / 1e6:.1f} MB on disk total")
    print("\nEnable with NEXT_PUBLIC_OFFLINE_TILES=on (see web/README.md).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
