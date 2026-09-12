/**
 * The studio's "heat survey" look, layered onto the integration map.
 *
 * The context basemap still comes from `buildContextStyle()`, so the offline
 * tile package keeps working; this module only repaints it on paper and adds the
 * studio's own layers. Nothing here derives a simulation number: the heat field
 * is drawn from the backend's `heatmap` points.
 */

import type { ExpressionSpecification, ImageSource, Map as MapLibreMap } from "maplibre-gl";

import type { Coordinate, HeatmapPoint } from "@/lib/contract";
import { HERO_PALETTE } from "@/lib/hero-palette";
import { SLICE_HEIGHT_EXAGGERATION, SLICE_SOURCE, sliceSourceSpec } from "@/lib/map";
import { OPENMAPTILES_SOURCE, contextLayerIds } from "@/lib/mapStyle";

export const STUDIO_COLORS = {
  paper: "#eeeae2",
  ink: "#1a1917",
  vermilion: "#e2462a",
  slice: "#fbfaf6",
  candidate: "#f0b3a1",
  venue: "#3a3934",
  cooling: "#7fa6d8",
  picked: "#23221f",
} as const;

/** The venue's building carries this OSM name in the slice. */
export const VENUE_BUILDING_NAME = "The Beehive";

const LAYER = {
  context: "studio-context-buildings",
  heat: "studio-heat",
  slice: "studio-slice",
} as const;

/** Metres per degree near the demo area (latitude ~34 N). */
const M_PER_DEG_LON = 92_200;
const M_PER_DEG_LAT = 110_900;

function setPaint(map: MapLibreMap, layer: string, property: string, value: unknown) {
  if (map.getLayer(layer)) map.setPaintProperty(layer, property, value);
}

/** Repaint the integration basemap in the hero's paper palette. */
export function restyleContext(map: MapLibreMap) {
  setPaint(map, "background", "background-color", STUDIO_COLORS.paper);
  setPaint(map, "landuse-residential", "fill-opacity", 0);
  setPaint(map, "park", "fill-color", "#e1e3d4");
  setPaint(map, "landcover-wood", "fill-color", "#e1e3d4");
  setPaint(map, "water", "fill-color", "#d3dadb");
  setPaint(map, "waterway", "line-color", "#c9d2d4");
  setPaint(map, "rail", "line-color", "#d6d0c4");
  setPaint(map, "road-casing", "line-color", "#dcd5c8");
  setPaint(map, "road-fill", "line-color", "#faf8f3");
  for (const label of [contextLayerIds.firstLabel, "label-place"]) {
    setPaint(map, label, "text-color", "#8a857b");
    setPaint(map, label, "text-halo-color", "#f4f1ea");
  }
  if (map.getLayer("label-park")) map.setLayoutProperty("label-park", "visibility", "none");
  // Only arterial names survive; the demo is about blocks, not every street.
  if (map.getLayer(contextLayerIds.firstLabel)) {
    map.setFilter(contextLayerIds.firstLabel, ["all", ["has", "name"], ["in", ["get", "class"], ["literal", ["primary", "secondary"]]]]);
  }
  if (map.getLayer(contextLayerIds.contextBuildings)) {
    map.setLayoutProperty(contextLayerIds.contextBuildings, "visibility", "none");
  }
  map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.32, position: [1.4, 200, 40] });

  // The surrounding city lies flat so only the demo slice stands up.
  if (!map.getLayer(LAYER.context)) {
    map.addLayer({
      id: LAYER.context,
      type: "fill",
      source: OPENMAPTILES_SOURCE,
      "source-layer": "building",
      minzoom: 13,
      paint: { "fill-color": "#e3ded4", "fill-outline-color": "#d6d0c4", "fill-opacity": 0.85 },
    }, contextLayerIds.firstLabel);
  }
}

/** The demo slice as a white architectural model. */
export function sliceColor(candidateNames: string[], focusName: string | null): ExpressionSpecification {
  // Most buildings have no facility name; they must never match an empty focus or list.
  const facility: ExpressionSpecification = ["coalesce", ["get", "facility_name"], "\u0000"];
  return [
    "case",
    // The building a resident clicked as "where I am" outranks every other role.
    ["boolean", ["feature-state", "picked"], false], STUDIO_COLORS.picked,
    ["==", ["coalesce", ["get", "name"], ""], VENUE_BUILDING_NAME], STUDIO_COLORS.venue,
    ["==", facility, focusName ?? "\u0001"], STUDIO_COLORS.vermilion,
    ["in", facility, ["literal", candidateNames]], STUDIO_COLORS.candidate,
    // Every facility M1 marked eligible is a cooling place residents can walk to.
    ["==", ["get", "candidate_eligible"], true], STUDIO_COLORS.cooling,
    STUDIO_COLORS.slice,
  ];
}

/** Candidate buildings are matched by the facility name the backend reports for each site. */
export function paintCandidates(map: MapLibreMap, candidateNames: string[], focusName: string | null) {
  if (map.getLayer(LAYER.slice)) map.setPaintProperty(LAYER.slice, "fill-extrusion-color", sliceColor(candidateNames, focusName));
}

export const SLICE_LAYER_ID = LAYER.slice;

export function addStudioSlice(map: MapLibreMap) {
  if (!map.getSource(SLICE_SOURCE)) map.addSource(SLICE_SOURCE, sliceSourceSpec());
  if (map.getLayer(LAYER.slice)) return;
  map.addLayer({
    id: LAYER.slice,
    type: "fill-extrusion",
    source: SLICE_SOURCE,
    paint: {
      "fill-extrusion-color": sliceColor([], null),
      "fill-extrusion-height": ["*", ["get", "height"], SLICE_HEIGHT_EXAGGERATION],
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": true,
    },
  }, contextLayerIds.firstLabel);
}

function mixHex(a: string, b: string, t: number): [number, number, number] {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => ((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t;
  return [channel(16), channel(8), channel(0)];
}

/** The hero's thermal ramp, washed toward paper so buildings stay the brightest thing. */
const RAMP = HERO_PALETTE.heat.map(({ at, color }) => ({ at, rgb: mixHex(color, "#f4f1ea", 0.3) }));

export function thermalRgb(t: number): [number, number, number] {
  const upper = RAMP.findIndex((stop) => stop.at >= t);
  if (upper <= 0) return RAMP[0].rgb;
  const lower = RAMP[upper - 1];
  const f = (t - lower.at) / (RAMP[upper].at - lower.at);
  return lower.rgb.map((value, index) => value * (1 - f) + RAMP[upper].rgb[index] * f) as [number, number, number];
}

/** CSS gradient for the legend, matching the drawn field. */
export const THERMAL_GRADIENT = `linear-gradient(90deg, ${RAMP.map(({ at, rgb }) => `rgb(${rgb.map(Math.round).join(",")}) ${at * 100}%`).join(", ")})`;

/**
 * Paint the backend's street heat samples into a smooth field.
 *
 * Each pixel is a kernel-weighted average of nearby samples, so its color is
 * always one of the backend's weights blended with its neighbours; coverage
 * fades out away from the streets that were actually modeled.
 */
function heatImage(points: HeatmapPoint[]) {
  const lons = points.map((p) => p.position[0]);
  const lats = points.map((p) => p.position[1]);
  const pad = 0.0028;
  const west = Math.min(...lons) - pad;
  const east = Math.max(...lons) + pad;
  const south = Math.min(...lats) - pad;
  const north = Math.max(...lats) + pad;
  const width = 320;
  const height = Math.round(width * ((north - south) * M_PER_DEG_LAT) / ((east - west) * M_PER_DEG_LON));
  const sigma = 75;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(width, height);
  const samples = points.map((p) => [(p.position[0] - west) * M_PER_DEG_LON, (north - p.position[1]) * M_PER_DEG_LAT, p.weight]);
  const metresPerPixelX = ((east - west) * M_PER_DEG_LON) / width;
  const metresPerPixelY = ((north - south) * M_PER_DEG_LAT) / height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x * metresPerPixelX;
      const py = y * metresPerPixelY;
      let weighted = 0;
      let total = 0;
      for (const [sx, sy, w] of samples) {
        const k = Math.exp(-((px - sx) ** 2 + (py - sy) ** 2) / (2 * sigma * sigma));
        weighted += w * k;
        total += k;
      }
      const offset = (y * width + x) * 4;
      if (total < 1e-3) continue;
      const [r, g, b] = thermalRgb(weighted / total);
      const coverage = 1 - Math.exp(-total * 0.8);
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = 255 * coverage * (0.3 + (weighted / total) * 0.45);
    }
  }
  context.putImageData(image, 0, 0);
  const corners: [Coordinate, Coordinate, Coordinate, Coordinate] = [[west, north], [east, north], [east, south], [west, south]];
  return { url: canvas.toDataURL(), coordinates: corners };
}

/** Lay the heat field under the slice, or repaint it when an intervention changes street heat. */
export function addHeatField(map: MapLibreMap, points: HeatmapPoint[]) {
  if (!points.length) return;
  const image = heatImage(points);
  if (!image) return;
  const existing = map.getSource(LAYER.heat) as ImageSource | undefined;
  if (existing) {
    existing.updateImage({ url: image.url, coordinates: image.coordinates });
    return;
  }
  map.addSource(LAYER.heat, { type: "image", url: image.url, coordinates: image.coordinates });
  map.addLayer(
    { id: LAYER.heat, type: "raster", source: LAYER.heat, paint: { "raster-opacity": 1, "raster-fade-duration": 0 } },
    map.getLayer(LAYER.slice) ? LAYER.slice : contextLayerIds.firstLabel,
  );
}

export function boundsOf(coordinates: Coordinate[]): [[number, number], [number, number]] {
  const lons = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}
