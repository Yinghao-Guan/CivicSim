"use client";

import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import type { NearestCooling } from "@/lib/cooling";
import type { AgentRoute, CandidateSite, Coordinate, HeatmapPoint, SimulationResponse, UnreachableAgent } from "@/lib/contract";
import { DEMO_AREA_BOUNDS, VENUE } from "@/lib/demoArea.generated";
import { MAX_PIXEL_RATIO, SLICE_SOURCE } from "@/lib/map";
import { buildContextStyle } from "@/lib/mapStyle";
import { SLICE_LAYER_ID, STUDIO_COLORS, addHeatField, addStudioSlice, boundsOf, paintCandidates, restyleContext } from "@/lib/studio-map";

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
  nearby: NearestCooling | null;
  /** A cooling center picked from the list, flown to while the candidates are introduced. */
  flyToPoint: Coordinate | null;
  onSelectSite: (siteId: string) => void;
  onPickLocation: (location: Coordinate) => void;
};

const VERMILION: [number, number, number] = [226, 70, 42];
const COOL_BLUE: [number, number, number] = [47, 104, 184];
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

/** Walks from a clicked building to its nearest cooling places, closest first and boldest. */
function nearbyLayers(nearby: NearestCooling) {
  const ranked = nearby.places.map((place, rank) => ({ ...place, rank }));
  return [
    new PathLayer<(typeof ranked)[number]>({
      id: "nearby-walks", data: ranked, getPath: (d) => d.path,
      getColor: (d) => [...COOL_BLUE, d.rank === 0 ? 245 : 150], getWidth: (d) => (d.rank === 0 ? 5 : 3), widthUnits: "pixels",
      capRounded: true, jointRounded: true, parameters: { depthCompare: "always" },
    }),
    new ScatterplotLayer<(typeof ranked)[number]>({
      id: "nearby-places", data: ranked, getPosition: (d) => d.location,
      getFillColor: [247, 245, 239, 255], getLineColor: [...COOL_BLUE, 255], stroked: true,
      getLineWidth: 3, lineWidthUnits: "pixels", getRadius: (d) => (d.rank === 0 ? 9 : 6), radiusUnits: "pixels",
      parameters: { depthCompare: "always" },
    }),
    new ScatterplotLayer<Coordinate>({
      id: "nearby-origin", data: [nearby.origin], getPosition: (d) => d,
      getFillColor: [26, 25, 23, 255], getLineColor: [247, 245, 239, 255], stroked: true,
      getLineWidth: 3, lineWidthUnits: "pixels", getRadius: 8, radiusUnits: "pixels", parameters: { depthCompare: "always" },
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

export default function StudioMap({ stage, candidates, heatmap, scenario, focusSiteId, lens, reducedMotion, nearby, flyToPoint, onSelectSite, onPickLocation }: StudioMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const selectRef = useRef(onSelectSite);
  const pickRef = useRef(onPickLocation);
  const pickedBuilding = useRef<string | number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { selectRef.current = onSelectSite; }, [onSelectSite]);
  useEffect(() => { pickRef.current = onPickLocation; }, [onPickLocation]);

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
    if (process.env.NODE_ENV !== "production") Object.assign(window, { studioMap: map });
    const resize = new ResizeObserver(() => { try { map.resize(); } catch { /* not ready yet */ } });
    resize.observe(container.current);
    const siteMarkers = markers.current;

    // The venue we are presenting from stays labeled on every step.
    const venue = document.createElement("div");
    venue.className = "studio-venue";
    venue.innerHTML = "<strong>The Beehive</strong><span>VISION HACK venue</span>";
    const venueMarker = new maplibregl.Marker({ element: venue, anchor: "bottom", offset: [0, -18] }).setLngLat(VENUE.lngLat).addTo(map);

    map.once("load", () => {
      restyleContext(map);
      addStudioSlice(map);
      // Any building in the slice can stand in for "where I am".
      map.on("click", SLICE_LAYER_ID, (event) => {
        const id = event.features?.[0]?.id;
        if (pickedBuilding.current !== null) map.setFeatureState({ source: SLICE_SOURCE, id: pickedBuilding.current }, { picked: false });
        if (id !== undefined) map.setFeatureState({ source: SLICE_SOURCE, id }, { picked: true });
        pickedBuilding.current = id ?? null;
        pickRef.current([event.lngLat.lng, event.lngLat.lat]);
      });
      map.on("mouseenter", SLICE_LAYER_ID, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", SLICE_LAYER_ID, () => { map.getCanvas().style.cursor = ""; });
      const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(overlay);
      overlayRef.current = overlay;
      setReady(true);
    });

    return () => {
      resize.disconnect();
      venueMarker.remove();
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
    // Candidate buildings take color once the sites are introduced; the focused one is vermilion.
    const revealed = stage !== "brief";
    const focus = candidates.find((site) => site.id === focusSiteId);
    paintCandidates(map, revealed ? candidates.map((site) => site.name) : [], revealed ? focus?.name ?? null : null);
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
    const walks = nearby ? nearbyLayers(nearby) : [];
    if (!show) {
      overlay.setProps({ layers: walks });
      return;
    }
    let frame = 0;
    const start = performance.now();
    const draw = () => {
      const clock = reducedMotion ? WALK_SECONDS * 0.6 : (performance.now() - start) / 1000;
      overlay.setProps({ layers: [...scenarioLayers(scenario.routes, scenario.unreachable_agents, lens, clock), ...walks] });
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [lens, nearby, ready, reducedMotion, scenario, stage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !flyToPoint) return;
    map.flyTo({ center: flyToPoint, zoom: 16.2, bearing: map.getBearing(), pitch: map.getPitch(), padding: PANEL_PADDING, duration: reducedMotion ? 0 : 1600 });
  }, [flyToPoint, ready, reducedMotion]);

  // Bring a clicked building and its walks into view without turning or tilting the camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!nearby) {
      if (pickedBuilding.current !== null) map.setFeatureState({ source: SLICE_SOURCE, id: pickedBuilding.current }, { picked: false });
      pickedBuilding.current = null;
      return;
    }
    if (!nearby.places.length) return;
    const points = nearby.places.flatMap((place) => place.path);
    map.fitBounds(boundsOf(points), {
      padding: { ...PANEL_PADDING, right: 380 },
      maxZoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      duration: reducedMotion ? 0 : 1400,
    });
  }, [nearby, ready, reducedMotion]);

  // MapLibre sets `position: relative` on its container, so the sized box is a wrapper.
  return (
    <div className="studio-map" style={{ background: STUDIO_COLORS.paper }}>
      <div ref={container} className={`studio-map__canvas${ready ? " is-ready" : ""}`} />
    </div>
  );
}
