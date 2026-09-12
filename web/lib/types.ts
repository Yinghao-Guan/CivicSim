/**
 * Shared types for the CivicSim frontend.
 *
 * `BuildingProperties` mirrors what scripts/build_buildings.py writes into
 * web/public/data/buildings.geojson. The two must stay in step; the script is
 * the source of truth.
 */

/** How a building's height was determined — see doc 03 section 2.3.1. */
export type HeightSource = "measured" | "levels" | "default";

/** Our facility vocabulary, from scripts/demo_area.py. */
export type FacilityType =
  | "community_centre"
  | "library"
  | "school"
  | "sports_centre"
  | "recreation_ground"
  | "social_facility"
  | "place_of_worship"
  | "park";

/**
 * OSM `wheelchair`, normalised. In the current demo area this is `"unknown"`
 * for every building — no footprint here carries the tag. Accessibility in
 * the simulation comes from street-graph edge attributes instead, so do not
 * build UI that depends on this field carrying signal.
 */
export type Accessibility = "yes" | "limited" | "no" | "designated" | "unknown";

export interface BuildingProperties {
  /** Stable id we control: "w" or "r" plus the OSM id. Used as MapLibre's feature id. */
  building_id: string;
  /** Metres. Always present; see `height_source` for how trustworthy it is. */
  height: number;
  height_source: HeightSource;
  /** The raw OSM `building=` value, e.g. "house", "apartments", "warehouse". */
  building_type: string;
  facility_type: FacilityType | null;
  facility_name: string | null;
  /** True if `facility_type` is in the cooling-center candidate pool. */
  candidate_eligible: boolean;
  /** Chosen during scenario design; false everywhere for now. */
  candidate_site: boolean;
  accessibility: Accessibility;
  name: string | null;
  osm_id: number;
  osm_type: "way" | "relation";
}

/** Metadata the preprocessing script attaches to the FeatureCollection. */
export interface BuildingsMetadata {
  milestone: string;
  venue: string;
  venue_lonlat: [number, number];
  bbox_swne: [number, number, number, number];
  source: string;
  height_fallback: string;
  building_count: number;
}
