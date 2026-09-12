/**
 * Camera and annotation helpers for the CivicSim map.
 *
 * Layer-2 and layer-3 wiring arrives in M3 and M4; this file holds what M2
 * needs and is the place the layer-2 source abstraction will live, so that
 * swapping GeoJSON for PMTiles at district scale stays a local change
 * (doc 04 section 2).
 */

import type { LngLatBoundsLike, Map as MapLibreMap } from "maplibre-gl";

import { DEMO_AREA_BOUNDS, VENUE } from "./demoArea.generated";
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
