"use client";

/**
 * Attributes of the selected slice building.
 *
 * Reports the *real* height regardless of any vertical exaggeration applied to
 * the extrusion, and says where that height came from — doc 01 §13.4 wants
 * provenance visible rather than implied.
 */

import { SLICE_HEIGHT_EXAGGERATION } from "@/lib/map";
import type { BuildingProperties, HeightSource } from "@/lib/types";

const HEIGHT_SOURCE_LABEL: Record<HeightSource, string> = {
  measured: "measured (LiDAR)",
  levels: "estimated from floor count",
  default: "assumed — no height in OSM",
};

const FACILITY_LABEL: Record<string, string> = {
  community_centre: "Community centre",
  library: "Library",
  school: "School",
  sports_centre: "Sports centre",
  recreation_ground: "Recreation ground",
  social_facility: "Social facility",
  place_of_worship: "Place of worship",
  park: "Park",
};

function titleFor(building: BuildingProperties): string {
  if (building.name) return building.name;
  if (building.facility_name) return building.facility_name;
  if (building.facility_type) return FACILITY_LABEL[building.facility_type];
  return "Unnamed building";
}

export default function BuildingPanel({
  building,
  onClose,
}: {
  building: BuildingProperties;
  onClose: () => void;
}) {
  const osmUrl = `https://www.openstreetmap.org/${building.osm_type}/${building.osm_id}`;

  return (
    <aside className="panel" aria-label="Selected building">
      <header className="panel-head">
        <div>
          <h2>{titleFor(building)}</h2>
          <p className="panel-id">{building.building_id}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      {building.candidate_eligible && (
        <p className="panel-badge">
          Eligible as a cooling-center candidate
          {building.candidate_site ? " — selected for this scenario" : ""}
        </p>
      )}

      <dl className="panel-fields">
        <dt>Height</dt>
        <dd>
          {building.height.toFixed(1)} m
          <span className="panel-note">{HEIGHT_SOURCE_LABEL[building.height_source]}</span>
          {SLICE_HEIGHT_EXAGGERATION !== 1 && (
            <span className="panel-note">
              drawn at {SLICE_HEIGHT_EXAGGERATION}× for legibility
            </span>
          )}
        </dd>

        <dt>Type</dt>
        <dd>{building.building_type}</dd>

        {building.facility_type && (
          <>
            <dt>Facility</dt>
            <dd>
              {FACILITY_LABEL[building.facility_type] ?? building.facility_type}
              {building.facility_name && building.facility_name !== building.name && (
                <span className="panel-note">{building.facility_name}</span>
              )}
            </dd>
          </>
        )}

        <dt>Source</dt>
        <dd>
          <a href={osmUrl} target="_blank" rel="noreferrer">
            OSM {building.osm_type} {building.osm_id}
          </a>
        </dd>
      </dl>

      <p className="panel-footnote">
        Accessibility is not shown: no building in this area carries an OSM
        wheelchair tag. Access comes from street-graph edges in a later
        milestone.
      </p>
    </aside>
  );
}
