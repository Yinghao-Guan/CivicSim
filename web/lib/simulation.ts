/**
 * Layer 3 of doc 04 §2.2: the deck.gl simulation overlay.
 *
 * MapLibre renders the city; deck.gl renders what happens in it (doc 02 §16).
 * The overlay is created with `interleaved: true` so deck.gl draws into
 * MapLibre's own WebGL context and shares its depth buffer — without that,
 * agents and routes float on top of the extruded buildings instead of passing
 * behind them, and the 2.5D city stops reading as a city.
 *
 * M4 adds no real data. It attaches the overlay and draws a probe whose only
 * job is to prove occlusion works in this MapLibre/deck.gl version pair
 * (doc 05 §9). Real agents, routes and heat come in later milestones.
 */

import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { Map as MapLibreMap } from "maplibre-gl";

import { VENUE } from "./demoArea.generated";
import { palette } from "./palette";

/**
 * Draw the occlusion probe.
 *
 * Kept rather than deleted once M4 passed, per doc 05 §M4: when real routes
 * arrive, this is the known-good reference to compare against. Set
 * `NEXT_PUBLIC_OCCLUSION_PROBE=off` to hide it.
 */
export const SHOW_OCCLUSION_PROBE =
  process.env.NEXT_PUBLIC_OCCLUSION_PROBE !== "off";

/** Converts a hex colour into the RGBA tuple deck.gl wants. */
function rgba(hex: string, alpha = 255): [number, number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

/**
 * A line across the blocks north-east of The Beehive, at ground level.
 *
 * Deliberately cuts across building footprints rather than following a street:
 * a path down the middle of a road is never occluded, so it would pass the
 * test without testing anything. This one has to disappear behind walls.
 */
const PROBE_PATH: [number, number][] = [
  [-118.26, 33.9832],
  [-118.2578, 33.9845],
  [-118.2556, 33.9858],
  [-118.2534, 33.9871],
  [-118.2512, 33.9884],
];

/** Points spaced along the same line, some of which land inside buildings. */
const PROBE_POINTS = PROBE_PATH.flatMap((start, i) => {
  const end = PROBE_PATH[i + 1];
  if (!end) return [start];
  return [0, 0.25, 0.5, 0.75].map(
    (t) =>
      [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t] as [
        number,
        number,
      ],
  );
});

export function occlusionProbeLayers(): Layer[] {
  return [
    new PathLayer<{ path: [number, number][] }>({
      id: "probe-path",
      data: [{ path: PROBE_PATH }],
      getPath: (d) => d.path,
      getColor: rgba(palette.simulation),
      getWidth: 6,
      widthMinPixels: 3,
      capRounded: true,
      jointRounded: true,
    }),
    new ScatterplotLayer<[number, number]>({
      id: "probe-points",
      data: PROBE_POINTS,
      getPosition: (d) => d,
      getFillColor: rgba(palette.heat),
      getRadius: 7,
      radiusMinPixels: 2.5,
      stroked: false,
    }),
    new ScatterplotLayer<[number, number]>({
      id: "probe-venue",
      data: [VENUE.lngLat],
      getPosition: (d) => d,
      getFillColor: rgba(palette.intervention),
      getRadius: 12,
      radiusMinPixels: 4,
      stroked: false,
    }),
  ];
}

/**
 * Attach the overlay to a MapLibre map.
 *
 * Returns a detach function. The overlay must be added as a MapLibre control:
 * that is what gives `interleaved: true` access to the map's GL context.
 */
export function attachSimulationOverlay(map: MapLibreMap): {
  overlay: MapboxOverlay;
  detach: () => void;
} {
  const overlay = new MapboxOverlay({
    interleaved: true,
    layers: SHOW_OCCLUSION_PROBE ? occlusionProbeLayers() : [],
  });

  map.addControl(overlay);

  return {
    overlay,
    detach: () => {
      try {
        map.removeControl(overlay);
      } catch {
        // The map may already be tearing down; nothing left to detach from.
      }
    },
  };
}
