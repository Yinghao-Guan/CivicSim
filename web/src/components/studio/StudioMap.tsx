"use client";

import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import type { AgentRoute, CandidateSite, Coordinate, HeatmapPoint, SimulationResponse, UnreachableAgent } from "@/lib/contract";
import { DEMO_AREA_BOUNDS } from "@/lib/demoArea.generated";
import { MAX_PIXEL_RATIO } from "@/lib/map";
import { buildContextStyle } from "@/lib/mapStyle";
import { STUDIO_COLORS, addHeatField, addStudioSlice, boundsOf, restyleContext } from "@/lib/studio-map";

export type StudioStage = "brief" | "sites" | "running" | "results";
export type StudioLens = "all" | "heat_vulnerable" | "mobility_constrained";

type StudioMapProps = {
  stage: StudioStage;
  candidates: CandidateSite[];
  heatmap: HeatmapPoint[];
  scenario: SimulationResponse | null;
  focusSiteId: string | null;
  lens: StudioLens;
  reducedMotion: boolean;
  onSelectSite: (siteId: string) => void;
};

const VERMILION: [number, number, number] = [226, 70, 42];
const GRAPHITE: [number, number, number] = [74, 72, 67];
const PANEL_PADDING = { top: 90, bottom: 90, left: 480, right: 80 };
/** Seconds for a resident to walk a route in the animation, whatever its length. */
const WALK_SECONDS = 5.5;

/** A route belongs to the lens when the lens is everyone or matches its profile. */
const inLens = (profile: string, lens: StudioLens) => lens === "all" || profile === lens;

function pointAlong(path: Coordinate[], t: number): Coordinate {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  let remaining = lengths.reduce((a, b) => a + b, 0) * t;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] === 0 ? 1 : Math.min(1, remaining / lengths[i]);
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f];
    }
    remaining -= lengths[i];
  }
  return path[path.length - 1];
}

function scenarioLayers(routes: AgentRoute[], unreachable: UnreachableAgent[], lens: StudioLens, clock: number) {
  const color = (profile: string, alpha: number): [number, number, number, number] =>
    inLens(profile, lens) ? [...VERMILION, alpha] : [...GRAPHITE, alpha * 0.45];
  return [
    // A faint pass that ignores depth keeps stretches behind buildings readable.
    new PathLayer<AgentRoute>({
      id: "studio-routes-ghost", data: routes, getPath: (d) => d.path, getColor: (d) => color(d.profile, 80),
      getWidth: 2, widthUnits: "pixels", parameters: { depthCompare: "always" }, updateTriggers: { getColor: [lens] },
    }),
    new PathLayer<AgentRoute>({
      id: "studio-routes", data: routes, getPath: (d) => d.path, getColor: (d) => color(d.profile, 235),
      getWidth: (d) => (inLens(d.profile, lens) ? 4 : 2.5), widthUnits: "pixels", capRounded: true, jointRounded: true,
      updateTriggers: { getColor: [lens], getWidth: [lens] },
    }),
    new ScatterplotLayer<AgentRoute>({
      id: "studio-walkers", data: routes, getPosition: (d) => pointAlong(d.path, (clock / WALK_SECONDS) % 1),
      getFillColor: (d) => (inLens(d.profile, lens) ? [26, 25, 23, 255] : [...GRAPHITE, 120]), getRadius: 4, radiusUnits: "pixels",
      parameters: { depthCompare: "always" }, updateTriggers: { getPosition: [clock], getFillColor: [lens] },
    }),
    // Residents who cannot reach the site stay visible: they are the equity story.
    new ScatterplotLayer<UnreachableAgent>({
      id: "studio-unreachable", data: unreachable, getPosition: (d) => d.origin,
      getFillColor: [244, 241, 234, 255], getLineColor: (d) => (inLens(d.profile, lens) ? [...VERMILION, 255] : [26, 25, 23, 200]),
      stroked: true, getLineWidth: (d) => (inLens(d.profile, lens) ? 2.5 : 1.5), lineWidthUnits: "pixels",
      getRadius: (d) => (inLens(d.profile, lens) ? 7 : 5), radiusUnits: "pixels", parameters: { depthCompare: "always" },
      updateTriggers: { getLineColor: [lens], getLineWidth: [lens], getRadius: [lens] },
    }),
  ];
}

function markerElement(letter: string, name: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "studio-marker";
  element.innerHTML = `<span class="studio-marker__name"></span><span class="studio-marker__letter"></span>`;
  (element.firstChild as HTMLElement).textContent = name;
  (element.lastChild as HTMLElement).textContent = letter;
  return element;
}

export default function StudioMap({ stage, candidates, heatmap, scenario, focusSiteId, lens, reducedMotion, onSelectSite }: StudioMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const selectRef = useRef(onSelectSite);
  const [ready, setReady] = useState(false);

  useEffect(() => { selectRef.current = onSelectSite; }, [onSelectSite]);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: buildContextStyle(),
      bounds: DEMO_AREA_BOUNDS,
      fitBoundsOptions: { padding: 40, bearing: -20 },
      pitch: 48,
      maxPitch: 72,
      attributionControl: { compact: true },
      pixelRatio: Math.min(window.devicePixelRatio ?? 1, MAX_PIXEL_RATIO),
    });
    mapRef.current = map;
    const resize = new ResizeObserver(() => { try { map.resize(); } catch { /* not ready yet */ } });
    resize.observe(container.current);
    const siteMarkers = markers.current;

    map.once("load", () => {
      restyleContext(map);
      addStudioSlice(map);
      const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(overlay);
      overlayRef.current = overlay;
      setReady(true);
    });

    return () => {
      resize.disconnect();
      siteMarkers.forEach((marker) => marker.remove());
      siteMarkers.clear();
      overlayRef.current = null;
      mapRef.current = null;
      try { map.remove(); } catch { /* torn down mid-load */ }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (ready && map) addHeatField(map, heatmap);
  }, [heatmap, ready]);

  // One marker per candidate; the focused site is lit in vermilion.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    candidates.forEach((site, index) => {
      let marker = markers.current.get(site.id);
      if (!marker) {
        const element = markerElement(String.fromCharCode(65 + index), site.name);
        element.addEventListener("click", () => selectRef.current(site.id));
        marker = new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat(site.location).addTo(map);
        markers.current.set(site.id, marker);
      }
      const element = marker.getElement();
      element.classList.toggle("is-active", site.id === focusSiteId);
      element.classList.toggle("is-hidden", stage === "brief");
    });
  }, [candidates, focusSiteId, ready, stage]);

  // Camera: the whole neighborhood for the brief, the three sites afterwards.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !candidates.length) return;
    const duration = reducedMotion ? 0 : 2200;
    if (stage === "brief") {
      map.fitBounds(DEMO_AREA_BOUNDS, { padding: PANEL_PADDING, pitch: 48, bearing: -20, duration });
      return;
    }
    const focus = candidates.find((site) => site.id === focusSiteId);
    const points = [...candidates.map((site) => site.location), ...(scenario?.routes.flatMap((route) => route.path) ?? [])];
    if (focus && stage === "sites") {
      map.flyTo({ center: focus.location, zoom: 16.4, pitch: 58, bearing: -28, padding: PANEL_PADDING, duration });
    } else {
      map.fitBounds(boundsOf(points), { padding: PANEL_PADDING, pitch: 56, bearing: -26, maxZoom: 16, duration });
    }
  }, [candidates, focusSiteId, ready, reducedMotion, scenario, stage]);

  // Routes and residents for the scenario on screen, animated unless motion is reduced.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!ready || !overlay) return;
    const show = scenario && (stage === "results" || stage === "running");
    if (!show) {
      overlay.setProps({ layers: [] });
      return;
    }
    let frame = 0;
    const start = performance.now();
    const draw = () => {
      const clock = reducedMotion ? WALK_SECONDS * 0.6 : (performance.now() - start) / 1000;
      overlay.setProps({ layers: scenarioLayers(scenario.routes, scenario.unreachable_agents, lens, clock) });
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [lens, ready, reducedMotion, scenario, stage]);

  // MapLibre sets `position: relative` on its container, so the sized box is a wrapper.
  return (
    <div className="studio-map" style={{ background: STUDIO_COLORS.paper }}>
      <div ref={container} className="studio-map__canvas" />
    </div>
  );
}
