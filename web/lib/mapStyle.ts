/**
 * Layer 1 of the three-layer approach in doc 03 section 2.2: the context
 * basemap.
 *
 * Written by hand against OpenFreeMap's OpenMapTiles vector source rather
 * than loading one of their ready-made styles, for three reasons:
 *
 *   1. Doc 02 section 6 asks for a specific look (warm neutral ground, muted
 *      buildings) that would otherwise mean recolouring 55-111 inherited
 *      layers at runtime.
 *   2. Everything drawn here is deliberately recessive. A general-purpose
 *      basemap competes with the simulation; this one is built to sit under it.
 *   3. The offline PMTiles swap in M5 becomes a one-line source change.
 *
 * Buildings from these tiles are context only: they carry no ids we control
 * and no simulation attributes, which is exactly why doc 03 section 2.1
 * splits the city into three layers. Nothing here is clickable.
 */

import type { StyleSpecification } from "maplibre-gl";

import { palette, labelPalette } from "./palette";

/** OpenFreeMap's TileJSON. Source id must match what the layers reference. */
export const OPENMAPTILES_SOURCE = "openmaptiles";
const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

/**
 * Tiles and glyphs written by scripts/build_offline_tiles.py.
 *
 * Absolute, not root-relative. MapLibre fetches tiles from a web worker, where
 * there is no document to resolve a relative URL against, and it fails with
 * "Failed to parse URL from /offline/tiles/...". The origin is only read in
 * the browser; these components never render on the server (doc 03 §2.3.5).
 */
const offlineOrigin = () =>
  typeof window === "undefined" ? "" : window.location.origin;
const offlineTilesUrl = () => `${offlineOrigin()}/offline/tiles/{z}/{x}/{y}.pbf`;
const offlineGlyphsUrl = () =>
  `${offlineOrigin()}/offline/fonts/{fontstack}/{range}.pbf`;
const OFFLINE_MINZOOM = 11;
const OFFLINE_MAXZOOM = 14;

/**
 * Serve the basemap from disk instead of the network.
 *
 * Doc 03 §2.3.2's insurance against venue Wi-Fi. Layers 2 and 3 are already
 * local, so with this on the entire demo runs offline. Run
 * `python scripts/build_offline_tiles.py` first -- the package is committed,
 * so normally it is already there.
 */
export const OFFLINE_TILES = process.env.NEXT_PUBLIC_OFFLINE_TILES === "on";

const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> ' +
  '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/** Ids of the layers this style defines, so other code can insert relative to them. */
export const contextLayerIds = {
  /** Tile buildings, extruded for depth. Layer 2 is drawn just after this. */
  contextBuildings: "context-buildings",
  /** The first label layer — insert map content *before* this to stay under labels. */
  firstLabel: "label-road",
} as const;

/**
 * OpenMapTiles road classes, coarsest first. Used to weight line widths so the
 * street grid reads at a glance without drawing attention to itself.
 */
const MAJOR_ROAD_CLASSES = ["motorway", "trunk", "primary"];
const MINOR_ROAD_CLASSES = ["secondary", "tertiary", "minor", "service"];

/**
 * Above this zoom, layer 1's buildings are hidden entirely.
 *
 * Inside the demo area layer 2 draws the same buildings from our own data, and
 * two extrusions of one building fight for depth: the tiles' `render_height`
 * often disagrees with ours (11 m where we resolved 5 m, for instance), so the
 * tile version pokes through the slice and shreds its roofs.
 *
 * The honest fix is to not draw tile buildings inside the box, but MapLibre
 * 5.24 offers no way to express that: `within` only supports Point and
 * LineString features, so it silently matches nothing against building
 * polygons, and the `clip` layer type does not exist in this version.
 *
 * A zoom cut-off works because it costs almost nothing. The demo area is
 * 1.8 km across, so by zoom ~15.5 the viewport is mostly inside it and there
 * is little context left to lose; below that, buildings are a couple of pixels
 * tall and the depth fight is invisible. When the area grows to district scale
 * (doc 04 §2) our own data becomes PMTiles covering the whole view, and this
 * cut-off goes away with the conflict.
 */
const CONTEXT_BUILDINGS_MAXZOOM = 15.5;

export function buildContextStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: OFFLINE_TILES ? offlineGlyphsUrl() : GLYPHS_URL,
    sources: {
      // Offline needs explicit zoom bounds: there is no TileJSON on disk to
      // declare them, and without them MapLibre requests zooms we never
      // downloaded and renders nothing.
      [OPENMAPTILES_SOURCE]: OFFLINE_TILES
        ? {
            type: "vector",
            tiles: [offlineTilesUrl()],
            minzoom: OFFLINE_MINZOOM,
            maxzoom: OFFLINE_MAXZOOM,
            attribution: ATTRIBUTION,
          }
        : { type: "vector", url: TILEJSON_URL, attribution: ATTRIBUTION },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": palette.land },
      },
      {
        id: "landuse-residential",
        type: "fill",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "landuse",
        filter: ["==", ["get", "class"], "residential"],
        paint: { "fill-color": palette.landAlt, "fill-opacity": 0.55 },
      },
      {
        id: "park",
        type: "fill",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "park",
        paint: { "fill-color": palette.park, "fill-opacity": 0.8 },
      },
      {
        id: "landcover-wood",
        type: "fill",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["wood", "grass"]]],
        paint: { "fill-color": palette.parkDark, "fill-opacity": 0.45 },
      },
      {
        id: "water",
        type: "fill",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "water",
        paint: { "fill-color": palette.water },
      },
      {
        id: "waterway",
        type: "line",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "waterway",
        paint: { "line-color": palette.waterLine, "line-width": 1.2 },
      },
      {
        id: "rail",
        type: "line",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        minzoom: 11,
        paint: {
          "line-color": palette.rail,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 16, 2.4],
          "line-dasharray": [3, 2],
        },
      },
      {
        id: "road-casing",
        type: "line",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          ["literal", [...MAJOR_ROAD_CLASSES, ...MINOR_ROAD_CLASSES]],
        ],
        minzoom: 11,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": palette.roadCasing,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            1.4,
            15,
            ["case", ["in", ["get", "class"], ["literal", MAJOR_ROAD_CLASSES]], 9, 5],
            18,
            ["case", ["in", ["get", "class"], ["literal", MAJOR_ROAD_CLASSES]], 26, 16],
          ],
        },
      },
      {
        id: "road-fill",
        type: "line",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          ["literal", [...MAJOR_ROAD_CLASSES, ...MINOR_ROAD_CLASSES]],
        ],
        minzoom: 11,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "case",
            ["in", ["get", "class"], ["literal", MAJOR_ROAD_CLASSES]],
            palette.roadMajor,
            palette.roadMinor,
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            0.6,
            15,
            ["case", ["in", ["get", "class"], ["literal", MAJOR_ROAD_CLASSES]], 6.5, 3.2],
            18,
            ["case", ["in", ["get", "class"], ["literal", MAJOR_ROAD_CLASSES]], 22, 13],
          ],
        },
      },
      {
        // Layer 1's buildings. Extruded so the surrounding city has depth,
        // but pale and semi-transparent so the demo slice stands clear of it.
        // `hide_3d` marks features OpenMapTiles says not to extrude, and
        // CONTEXT_BUILDINGS_MAXZOOM hands the ground to layer 2 up close.
        id: contextLayerIds.contextBuildings,
        type: "fill-extrusion",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "building",
        filter: ["!=", ["get", "hide_3d"], true],
        minzoom: 13,
        maxzoom: CONTEXT_BUILDINGS_MAXZOOM,
        paint: {
          "fill-extrusion-color": palette.contextBuilding,
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 5],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.65,
          // Fade in with zoom so the transition into the slice is not abrupt.
          "fill-extrusion-vertical-gradient": true,
        },
      },
      {
        id: contextLayerIds.firstLabel,
        type: "symbol",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "transportation_name",
        minzoom: 14,
        filter: ["has", "name"],
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 13],
          "text-letter-spacing": 0.04,
        },
        paint: {
          "text-color": labelPalette.textMuted,
          "text-halo-color": labelPalette.textHalo,
          "text-halo-width": 1.4,
        },
      },
      {
        id: "label-park",
        type: "symbol",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "park",
        minzoom: 14,
        filter: ["has", "name"],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-max-width": 8,
        },
        paint: {
          "text-color": labelPalette.textMuted,
          "text-halo-color": labelPalette.textHalo,
          "text-halo-width": 1.2,
        },
      },
      {
        id: "label-place",
        type: "symbol",
        source: OPENMAPTILES_SOURCE,
        "source-layer": "place",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["suburb", "neighbourhood", "quarter"]],
        ],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 11, 16, 14],
          "text-letter-spacing": 0.12,
          "text-transform": "uppercase",
          "text-max-width": 9,
        },
        paint: {
          "text-color": labelPalette.text,
          "text-halo-color": labelPalette.textHalo,
          "text-halo-width": 1.8,
        },
      },
    ],
  };
}
