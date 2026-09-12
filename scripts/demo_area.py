"""Demo-area definition, shared by every preprocessing script.

The bounding box and facility classification live here rather than in one
script so that later steps (the street graph, the synthetic population, the
PMTiles export) all describe the same area without copying coordinates.

Values come from M0; see docs/04-map-milestone-plan.md section 3.
"""

from __future__ import annotations

from typing import NamedTuple


class BBox(NamedTuple):
    """A geographic bounding box in WGS84 degrees."""

    south: float
    west: float
    north: float
    east: float

    def overpass(self) -> str:
        """Format as Overpass QL expects: south,west,north,east."""
        return f"{self.south},{self.west},{self.north},{self.east}"

    def contains(self, lat: float, lon: float) -> bool:
        return self.south <= lat <= self.north and self.west <= lon <= self.east

    def buffered(self, metres: float) -> "BBox":
        """Grow the box by roughly `metres` on all sides.

        Used when fetching facility polygons: a school campus that only
        partly overlaps the demo area should still be available for matching.
        """
        dlat = metres / M_PER_DEG_LAT
        dlon = metres / M_PER_DEG_LON
        return BBox(
            self.south - dlat, self.west - dlon, self.north + dlat, self.east + dlon
        )


# Metres per degree at latitude 34 deg N. Good to ~0.1% over an area this
# small, and it keeps the whole pipeline free of a projection dependency.
M_PER_DEG_LAT = 110_900.0
M_PER_DEG_LON = 92_400.0

# The venue the demo is built around: The Beehive / SoLa Technology &
# Entrepreneurship Center, 1000 E. 60th St., Council District 9.
VENUE_NAME = "The Beehive (SoLa Technology & Entrepreneurship Center)"
VENUE_LAT = 33.98530
VENUE_LON = -118.25747

# 1.80 x 1.66 km = 3.00 km^2, holding the venue plus three distinct
# cooling-center candidates. Larger than the 1.5-2 km^2 doc 03 first
# proposed; the reasoning is in docs/04 section 3.4.
DEMO_AREA = BBox(south=33.98100, west=-118.26450, north=33.99600, east=-118.24500)

# What M0 measured for this box. The script compares against these so a
# silent change in OSM data or in our filtering is noticed rather than
# quietly accepted.
EXPECTED_BUILDINGS = 4883
EXPECTED_BUILDINGS_TOLERANCE = 0.05

# Facility kinds eligible to become cooling-center candidates, per
# docs/04 section M1. Keys are (osm_key, osm_value).
CANDIDATE_FACILITIES = {
    ("amenity", "community_centre"): "community_centre",
    ("amenity", "library"): "library",
    ("amenity", "school"): "school",
    ("leisure", "sports_centre"): "sports_centre",
    ("leisure", "recreation_ground"): "recreation_ground",
}

# Recorded for context but deliberately *not* in the candidate pool. South
# LA churches do host real cooling centers, so they are worth carrying in the
# data; whether they belong in the scenario is a scenario-design decision,
# not a preprocessing one.
CONTEXT_FACILITIES = {
    ("amenity", "social_facility"): "social_facility",
    ("amenity", "place_of_worship"): "place_of_worship",
    ("leisure", "park"): "park",
}

ALL_FACILITIES = {**CANDIDATE_FACILITIES, **CONTEXT_FACILITIES}


def facility_type(tags: dict) -> str | None:
    """Return our facility classification for an OSM feature, if any."""
    for (key, value), name in ALL_FACILITIES.items():
        if tags.get(key) == value:
            return name
    return None


def is_candidate_eligible(ftype: str | None) -> bool:
    return ftype in set(CANDIDATE_FACILITIES.values())
