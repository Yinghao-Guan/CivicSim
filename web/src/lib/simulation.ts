/**
 * Layer 3 of doc 04 §2.2: the deck.gl simulation overlay.
 *
 * MapLibre renders the city; deck.gl renders what happens in it (doc 02 §16).
 * The overlay is created with `interleaved: true` so deck.gl draws into
 * MapLibre's own WebGL context and shares its depth buffer — without that,
 * agents and routes float on top of the extruded buildings instead of passing
 * behind them, and the 2.5D city stops reading as a city.
 *
 * M4 attached the overlay and drew a probe to prove occlusion works in this
 * MapLibre/deck.gl version pair (doc 05 §9). The probe is still here as the
 * known-good reference, but the overlay now carries real data: every route
 * below is a journey the FastAPI backend actually routed.
 */

import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { Map as MapLibreMap } from "maplibre-gl";

import type {
  AgentRoute,
  CandidateSite,
  Coordinate,
  UnreachableAgent,
} from "./contract";
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
 * What the overlay draws for one scenario.
 *
 * All of it comes from a backend response. Nothing here derives a metric or
 * re-runs any part of the simulation: `routes` are the paths the backend
 * routed, and `unreachable` are the agents it could not get there.
 */
export interface ScenarioScene {
  routes: AgentRoute[];
  unreachable: UnreachableAgent[];
  candidates: CandidateSite[];
  selectedSiteId: string | null;
  /**
   * Pull the mobility-constrained journeys forward and push the rest back.
   *
   * Nothing is filtered out: the other journeys stay on screen, faint, so the
   * comparison is still visible rather than replaced by a different map.
   */
  focusMobility: boolean;
}

const MOBILITY_CONSTRAINED = "mobility_constrained";

const isConstrained = (profile: string) => profile === MOBILITY_CONSTRAINED;

/** Mobility-constrained journeys are drawn apart: they carry the equity story. */
function routeColor(
  route: AgentRoute,
  focusMobility: boolean,
): [number, number, number, number] {
  if (isConstrained(route.profile)) {
    return rgba(palette.intervention, focusMobility ? 255 : 235);
  }
  return rgba(palette.simulation, focusMobility ? 55 : 200);
}

/** Widths in the same order the colours above imply. */
function routeWidth(route: AgentRoute, focusMobility: boolean): number {
  if (!focusMobility) return 11;
  return isConstrained(route.profile) ? 15 : 5;
}

export function scenarioLayers(scene: ScenarioScene): Layer[] {
  const { routes, unreachable, candidates, selectedSiteId, focusMobility } = scene;
  const origins = routes
    .map((route) => ({ route, position: route.path[0] }))
    .filter((d): d is { route: AgentRoute; position: Coordinate } => Boolean(d.position));

  return [
    // A dark casing under every route. Routes cross a warm, light map and a
    // grey slice; a single bright stroke loses its edges against both at
    // presentation distance, so each one gets an outline to sit in.
    new PathLayer<AgentRoute>({
      id: "scenario-routes-casing",
      data: routes,
      getPath: (d) => d.path,
      getColor: (d) =>
        rgba(palette.chrome, focusMobility && !isConstrained(d.profile) ? 40 : 150),
      getWidth: (d) => routeWidth(d, focusMobility) + 6,
      widthMinPixels: focusMobility ? 4 : 8,
      widthMaxPixels: 26,
      capRounded: true,
      jointRounded: true,
      updateTriggers: {
        getColor: [focusMobility],
        getWidth: [focusMobility],
      },
    }),
    new PathLayer<AgentRoute>({
      id: "scenario-routes",
      data: routes,
      getPath: (d) => d.path,
      getColor: (d) => routeColor(d, focusMobility),
      getWidth: (d) => routeWidth(d, focusMobility),
      widthMinPixels: focusMobility ? 3 : 5,
      widthMaxPixels: 20,
      capRounded: true,
      jointRounded: true,
      pickable: true,
      updateTriggers: {
        getColor: [focusMobility],
        getWidth: [focusMobility],
      },
    }),
    // Where each reached resident started.
    new ScatterplotLayer<{ route: AgentRoute; position: Coordinate }>({
      id: "scenario-origins",
      data: origins,
      getPosition: (d) => d.position,
      getFillColor: (d) => routeColor(d.route, focusMobility),
      getRadius: (d) =>
        focusMobility && !isConstrained(d.route.profile) ? 7 : 15,
      radiusMinPixels: focusMobility ? 3 : 5,
      radiusMaxPixels: 15,
      stroked: true,
      getLineColor: (d) =>
        rgba(
          palette.chrome,
          focusMobility && !isConstrained(d.route.profile) ? 60 : 200,
        ),
      lineWidthMinPixels: 1.5,
      pickable: true,
      updateTriggers: {
        getFillColor: [focusMobility],
        getRadius: [focusMobility],
        getLineColor: [focusMobility],
      },
    }),
    // Residents who could not reach the site. Kept visible on purpose: they
    // are the point of the equity reveal, not noise to hide (doc 01 §11.3).
    new ScatterplotLayer<UnreachableAgent>({
      id: "scenario-unreachable",
      data: unreachable,
      getPosition: (d) => d.origin,
      // A constrained resident who is cut off is the sharpest form of the
      // equity point, so focus mode keeps these at full strength.
      getFillColor: (d) =>
        rgba(
          palette.heat,
          focusMobility && !isConstrained(d.profile) ? 70 : 225,
        ),
      getRadius: (d) => (focusMobility && !isConstrained(d.profile) ? 7 : 15),
      radiusMinPixels: focusMobility ? 3 : 5,
      radiusMaxPixels: 15,
      stroked: true,
      getLineColor: rgba(palette.chrome, 200),
      lineWidthMinPixels: 1.5,
      pickable: true,
      updateTriggers: {
        getFillColor: [focusMobility],
        getRadius: [focusMobility],
      },
    }),
    // A halo marking the site under test, so which proposal is on screen is
    // readable without looking back at the panel.
    new ScatterplotLayer<CandidateSite>({
      id: "scenario-selected-halo",
      data: candidates.filter((site) => site.id === selectedSiteId),
      getPosition: (d) => d.location,
      getFillColor: rgba(palette.intervention, 70),
      getRadius: 110,
      radiusMinPixels: 20,
      radiusMaxPixels: 80,
      stroked: false,
      updateTriggers: { getPosition: [selectedSiteId] },
    }),
    new ScatterplotLayer<CandidateSite>({
      id: "scenario-candidates",
      data: candidates,
      getPosition: (d) => d.location,
      getFillColor: (d) =>
        d.id === selectedSiteId
          ? rgba(palette.intervention, 255)
          : rgba(palette.facility, 200),
      getRadius: (d) => (d.id === selectedSiteId ? 46 : 24),
      radiusMinPixels: (selectedSiteId ? 11 : 8) as number,
      radiusMaxPixels: 46,
      stroked: true,
      getLineColor: (d) =>
        d.id === selectedSiteId ? rgba(palette.ink, 255) : rgba(palette.chrome, 190),
      getLineWidth: (d) => (d.id === selectedSiteId ? 4 : 2),
      lineWidthMinPixels: 2,
      pickable: true,
      updateTriggers: {
        getFillColor: [selectedSiteId],
        getRadius: [selectedSiteId],
        getLineColor: [selectedSiteId],
        getLineWidth: [selectedSiteId],
      },
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
