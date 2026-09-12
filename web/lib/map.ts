/**
 * Camera and annotation helpers for the CivicSim map.
 *
 * Layer-2 and layer-3 wiring arrives in M3 and M4; this file holds what M2
 * needs and is the place the layer-2 source abstraction will live, so that
 * swapping GeoJSON for PMTiles at district scale stays a local change
 * (doc 04 section 2).
 */

import type {
  ExpressionSpecification,
  LngLatBoundsLike,
  Map as MapLibreMap,
  SourceSpecification,
} from "maplibre-gl";

import { BUILDINGS_URL, DEMO_AREA_BOUNDS, VENUE } from "./demoArea.generated";
import { contextLayerIds } from "./mapStyle";
import { palette } from "./palette";

/**
 * A pitched view, because the whole point of layer 1 and 2 being extruded is
 * that you can see the extrusion. 52 degrees shows building sides clearly
 * while keeping enough of the street grid visible to read the neighborhood.
 */
export const CAMERA = {
  pitch: 52,
  /** A slight rotation off north; a grid this regular looks flat square-on. */
  bearing: -18,
  padding: 28,
  maxPitch: 72,
  minZoom: 11,
  maxZoom: 19,
} as const;

export const DEMO_BOUNDS: LngLatBoundsLike = DEMO_AREA_BOUNDS;

/** Frame the demo area. Used for the initial camera and the reset control. */
export function frameDemoArea(map: MapLibreMap, animate = true): void {
  map.fitBounds(DEMO_AREA_BOUNDS, {
    pitch: CAMERA.pitch,
    bearing: CAMERA.bearing,
    padding: CAMERA.padding,
    duration: animate ? 900 : 0,
  });
}

const VENUE_SOURCE = "venue";
const VENUE_DOT = "venue-dot";
const VENUE_LABEL = "venue-label";

/**
 * Mark The Beehive.
 *
 * An annotation rather than data: it anchors doc 03 section 3.2's "this is the
 * neighborhood we are sitting in" framing, and while building the map it is
 * the quickest way to confirm the camera is actually pointed where we think.
 *
 * Added on top of everything and set to ignore label collision. A basemap
 * label winning a collision against this one would be exactly backwards --
 * the venue is the one thing on the map that must always be findable.
 */
export function addVenueMarker(map: MapLibreMap): void {
  if (map.getSource(VENUE_SOURCE)) return;

  map.addSource(VENUE_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: VENUE.lngLat },
          properties: { name: VENUE.name },
        },
      ],
    },
  });

  map.addLayer({
    id: VENUE_DOT,
    type: "circle",
    source: VENUE_SOURCE,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4, 17, 9],
      "circle-color": palette.simulation,
      "circle-stroke-width": 2,
      "circle-stroke-color": palette.ink,
      "circle-opacity": 0.95,
    },
  });

  map.addLayer({
    id: VENUE_LABEL,
    type: "symbol",
    source: VENUE_SOURCE,
    minzoom: 14,
    layout: {
      "text-field": "The Beehive",
      "text-font": ["Noto Sans Bold"],
      "text-size": 12,
      "text-offset": [0, 1.4],
      "text-anchor": "top",
      "text-letter-spacing": 0.06,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": palette.chrome,
      "text-halo-color": palette.ink,
      "text-halo-width": 1.8,
    },
  });
}

/* ---------------------------------------------------------------------- */
/* Layer 2 — the demo slice                                               */
/* ---------------------------------------------------------------------- */

export const SLICE_SOURCE = "slice";
export const sliceLayerIds = { buildings: "slice-buildings" } as const;

/**
 * Vertical exaggeration applied to slice building heights.
 *
 * The neighborhood is genuinely low-rise: the median building is 4.4 m and 99%
 * are under 9.4 m (doc 04 §3.3), so at true scale the extrusion is almost
 * flat and a house is indistinguishable from a warehouse.
 *
 * 2 was chosen against 1 and 3 side by side. It is enough for massing to read
 * -- a school campus separates from the houses around it -- while the area
 * still looks like the low-rise neighborhood it is. At 3 a single-storey house
 * reads as four storeys, which works against the heat-vulnerability story the
 * demo is making.
 *
 * The side panel always reports the real height and says when the drawing is
 * exaggerated, per doc 01 §13.4 on provenance.
 */
export const SLICE_HEIGHT_EXAGGERATION: number = 2;

/**
 * The layer-2 source.
 *
 * Isolated here because doc 04 §2 expects this to become PMTiles when the area
 * grows to district scale — at which point only this function and the layer's
 * `source-layer` change, not the interaction code.
 *
 * `promoteId` is what makes the rest work: it lifts our own `building_id` into
 * MapLibre's feature id, which `feature-state` needs for hover and selection.
 * Tile-provided buildings have no such id, which is exactly why doc 03 §2.1
 * splits the city into separate layers.
 */
export function sliceSourceSpec(): SourceSpecification {
  return {
    type: "geojson",
    data: BUILDINGS_URL,
    promoteId: "building_id",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors (ODbL)',
  };
}

/** Selected beats hover beats candidate, so a click always reads clearly. */
const sliceColor: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  palette.sliceBuildingSelected,
  ["boolean", ["feature-state", "hover"], false],
  palette.sliceBuildingHover,
  ["get", "candidate_eligible"],
  palette.facility,
  palette.sliceBuilding,
];

/** Add the demo slice. Drawn under labels so street names stay readable. */
export function addSliceLayers(map: MapLibreMap): void {
  if (map.getSource(SLICE_SOURCE)) return;

  map.addSource(SLICE_SOURCE, sliceSourceSpec());

  map.addLayer(
    {
      id: sliceLayerIds.buildings,
      type: "fill-extrusion",
      source: SLICE_SOURCE,
      paint: {
        "fill-extrusion-color": sliceColor,
        "fill-extrusion-height":
          SLICE_HEIGHT_EXAGGERATION === 1
            ? ["get", "height"]
            : ["*", ["get", "height"], SLICE_HEIGHT_EXAGGERATION],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.95,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    contextLayerIds.firstLabel,
  );
}
