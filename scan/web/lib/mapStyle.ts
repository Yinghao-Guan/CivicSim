import type { StyleSpecification } from "maplibre-gl";

/**
 * A minimal paper basemap over the offline tile package the main web app
 * ships (public/offline is a symlink to web/public/offline), so the phone
 * page works without venue Wi-Fi too. Deliberately quiet: the pin, the matched
 * street and the routes are the only strong colours.
 */
export const colors = {
  paper: "#f3eee4",
  land: "#ebe4d6",
  park: "#d5dcc3",
  water: "#bccbd0",
  road: "#fbf8f2",
  roadCasing: "#d6cebf",
  building: "#ddd5c6",
  ink: "#1f1c17",
  muted: "#7a7263",
  signal: "#e2462a",
  cool: "#2f7fb5",
};

export function buildStyle(): StyleSpecification {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const source = "openmaptiles";
  return {
    version: 8,
    glyphs: `${origin}/offline/fonts/{fontstack}/{range}.pbf`,
    sources: {
      [source]: {
        type: "vector",
        tiles: [`${origin}/offline/tiles/{z}/{x}/{y}.pbf`],
        minzoom: 11,
        maxzoom: 14,
        attribution: "© OpenMapTiles © OpenStreetMap contributors",
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": colors.land } },
      { id: "park", type: "fill", source, "source-layer": "park", paint: { "fill-color": colors.park } },
      { id: "water", type: "fill", source, "source-layer": "water", paint: { "fill-color": colors.water } },
      {
        id: "road-casing",
        type: "line",
        source,
        "source-layer": "transportation",
        filter: ["!=", ["get", "class"], "rail"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": colors.roadCasing,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 16, 9, 18, 20],
        },
      },
      {
        id: "road",
        type: "line",
        source,
        "source-layer": "transportation",
        filter: ["!=", ["get", "class"], "rail"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": colors.road,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 16, 6.5, 18, 16],
        },
      },
      {
        id: "building",
        type: "fill",
        source,
        "source-layer": "building",
        minzoom: 14,
        paint: { "fill-color": colors.building, "fill-outline-color": colors.roadCasing },
      },
      {
        id: "road-label",
        type: "symbol",
        source,
        "source-layer": "transportation_name",
        minzoom: 14,
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: { "text-color": colors.muted, "text-halo-color": colors.road, "text-halo-width": 1.2 },
      },
    ],
  };
}
