"""Cooling places residents can walk to today.

Built by scripts/build_cooling_places.py from the facilities M1 marked eligible
in the building slice. Used only by the nearest-cooling lookup; the scenario
simulation does not read it.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

PLACES_PATH = Path(__file__).with_name("cooling_places.json")


@dataclass(frozen=True)
class CoolingPlace:
    id: str
    name: str
    facility_type: str
    location: tuple[float, float]


@lru_cache(maxsize=1)
def cooling_places() -> tuple[CoolingPlace, ...]:
    data = json.loads(PLACES_PATH.read_text(encoding="utf-8"))
    return tuple(
        CoolingPlace(
            id=place["id"],
            name=place["name"],
            facility_type=place["facility_type"],
            location=tuple(place["location"]),
        )
        for place in data["places"]
    )
