"""List the demo area's cooling places for the backend.

Every facility M1 marked `candidate_eligible` in web/public/data/buildings.geojson
(schools, the senior center, the swimming pool) is treated as a place a
resident can walk to for relief. A campus of many buildings becomes one place,
located at the centre of its buildings.

Output: backend/data/cooling_places.json

Run from the repository root:

    python scripts/build_cooling_places.py
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILDINGS = ROOT / "web" / "public" / "data" / "buildings.geojson"
OUTPUT = ROOT / "backend" / "data" / "cooling_places.json"


def outer_rings(geometry: dict) -> list[list[list[float]]]:
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"][0]]
    return [polygon[0] for polygon in geometry["coordinates"]]


def main() -> None:
    features = json.loads(BUILDINGS.read_text(encoding="utf-8"))["features"]
    grouped: dict[str, dict] = defaultdict(lambda: {"points": [], "building_ids": []})
    for feature in features:
        props = feature["properties"]
        name = props.get("facility_name")
        if not props.get("candidate_eligible") or not name:
            continue
        place = grouped[name]
        place["facility_type"] = props["facility_type"]
        place["building_ids"].append(props["building_id"])
        for ring in outer_rings(feature["geometry"]):
            place["points"].extend(ring[:-1])

    places = []
    for name, place in sorted(grouped.items()):
        points = place["points"]
        places.append(
            {
                "id": name.lower().replace(".", "").replace(" ", "_"),
                "name": name,
                "facility_type": place["facility_type"],
                "location": [
                    round(sum(p[0] for p in points) / len(points), 6),
                    round(sum(p[1] for p in points) / len(points), 6),
                ],
                "building_ids": sorted(place["building_ids"]),
            }
        )

    OUTPUT.write_text(json.dumps({"source": "OpenStreetMap via buildings.geojson (M1), ODbL", "places": places}, indent=2), encoding="utf-8")
    print(f"  {len(places)} cooling places -> {OUTPUT}")
    for place in places:
        print(f"    {place['facility_type']:<16} {place['name']} ({len(place['building_ids'])} buildings)")


if __name__ == "__main__":
    main()
