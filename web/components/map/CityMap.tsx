"use client";

/**
 * The MapLibre instance.
 *
 * `"use client"` is mandatory: MapLibre touches `window` and WebGL at import
 * time, so it cannot be server-rendered (doc 04 section 2.3.5). This component
 * is only ever reached through `MapView`, which loads it with `ssr: false`.
 *
 * M2 builds layer 1 only — the context basemap. Layer 2 (the clickable demo
 * slice) is M3 and layer 3 (the deck.gl simulation overlay) is M4.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import BuildingPanel from "@/components/panels/BuildingPanel";
import ScenarioPanel from "@/components/panels/ScenarioPanel";
import {
  CAMERA,
  MAX_PIXEL_RATIO,
  SLICE_SOURCE,
  addSliceLayers,
  addVenueMarker,
  frameDemoArea,
  frameScenario,
} from "@/lib/map";
import { BUILDING_COUNT, DEMO_AREA_BOUNDS } from "@/lib/demoArea.generated";
import { buildContextStyle } from "@/lib/mapStyle";
import {
  SHOW_OCCLUSION_PROBE,
  attachSimulationOverlay,
  occlusionProbeLayers,
  scenarioLayers,
} from "@/lib/simulation";
import { useScenarios } from "@/lib/useScenarios";
import type { MapboxOverlay } from "@deck.gl/mapbox";

import { useSliceInteraction } from "./useSliceInteraction";

interface CityMapProps {
  /** Called once the style has loaded, for layers added in later milestones. */
  onReady?: (map: MapLibreMap) => void;
}

export default function CityMap({ onReady }: CityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sliceLoaded, setSliceLoaded] = useState(false);
  const { selected, clearSelection, attach } = useSliceInteraction();
  const attachRef = useRef(attach);
  attachRef.current = attach;
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const scenarios = useScenarios();
  const { active, candidates, activeId } = scenarios;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildContextStyle(),
      bounds: DEMO_AREA_BOUNDS,
      fitBoundsOptions: { padding: CAMERA.padding, bearing: CAMERA.bearing },
      pitch: CAMERA.pitch,
      maxPitch: CAMERA.maxPitch,
      minZoom: CAMERA.minZoom,
      maxZoom: CAMERA.maxZoom,
      attributionControl: { compact: false },
      pixelRatio: Math.min(window.devicePixelRatio ?? 1, MAX_PIXEL_RATIO),
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("error", (event) => {
      // MapLibre surfaces tile failures here. Venue Wi-Fi is the expected
      // cause (doc 04 section 2.3.2); M5 adds the offline PMTiles fallback.
      const message = event.error?.message ?? "Unknown map error";
      console.error("[CityMap]", message);
      setError(message);
    });

    if (process.env.NODE_ENV !== "production") {
      // Handy in the console while iterating on layers and paint properties;
      // never present in a production build.
      Object.assign(window, { civicsimMap: map, civicsimStyle: buildContextStyle });
    }

    let detachSlice: (() => void) | undefined;
    let detachOverlay: (() => void) | undefined;

    // MapLibre measures its container once, at construction, and afterwards
    // only listens for *window* resizes. When the first paint beats layout the
    // container is still 0×0, so the canvas is left at MapLibre's 400×300
    // fallback: the map draws into one corner, routes land off-screen, and the
    // initial render never completes — which means `load` never fires either,
    // so this cannot be deferred until then. Watch the container itself.
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === 0) return;
      try {
        map.resize();
      } catch (cause) {
        // Harmless mid-initialisation; the next observation corrects it.
        console.debug("[CityMap] resize before the map was ready", cause);
      }
    });
    resizeObserver.observe(containerRef.current);

    map.once("load", () => {
      addSliceLayers(map);
      addVenueMarker(map);
      // After the slice, so the overlay's interleaved layers are composited
      // against buildings that already exist.
      const overlay = attachSimulationOverlay(map);
      overlayRef.current = overlay.overlay;
      detachOverlay = () => {
        overlayRef.current = null;
        overlay.detach();
      };
      detachSlice = attachRef.current(map);
      // Re-frame now that the container has its final size; the constructor
      // fit runs before layout settles on a first paint.
      frameDemoArea(map, false);
      setReady(true);
      onReady?.(map);
    });

    // The slice is ~2.9 MB, so it lands noticeably after the basemap.
    const onSourceData = (event: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (event.sourceId === SLICE_SOURCE && event.isSourceLoaded) setSliceLoaded(true);
    };
    map.on("sourcedata", onSourceData);

    return () => {
      detachSlice?.();
      detachOverlay?.();
      resizeObserver.disconnect();
      map.off("sourcedata", onSourceData);
      // Clear the ref *before* removing. React StrictMode unmounts and
      // remounts within the same tick in development, and MapLibre 5 throws
      // ("no tile manager with ID ...") when a map is torn down while its
      // style is still loading. If that throw escaped, the ref would stay set
      // and the remount would skip creating a map, leaving a dead canvas.
      mapRef.current = null;
      try {
        map.remove();
      } catch (cause) {
        console.debug("[CityMap] error tearing down a partially loaded map", cause);
      }
    };
    // onReady is intentionally not a dependency: the map is built once and
    // re-creating it on every parent render would be wasteful and flickery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push the current scenario into the overlay. `setProps` updates the
  // underlying Deck instance in place, so the map is never rebuilt when the
  // user switches sites.
  useEffect(() => {
    const overlay = overlayRef.current;
    const map = mapRef.current;
    if (!overlay || !map || !ready) return;

    if (!active) {
      overlay.setProps({
        layers: SHOW_OCCLUSION_PROBE ? occlusionProbeLayers() : [],
      });
      return;
    }

    overlay.setProps({
      layers: scenarioLayers({
        routes: active.routes,
        unreachable: active.unreachable_agents,
        candidates,
        selectedSiteId: active.selected_site,
      }),
    });

    // Fly to what this scenario covers. Only for proposals: the baseline
    // reaches nobody, so there are no routes to frame and pulling the camera
    // to a handful of stranded origins would misrepresent it.
    if (active.selected_site === null) {
      frameDemoArea(map);
      return;
    }
    const site = candidates.find((c) => c.id === active.selected_site);
    frameScenario(map, [
      ...active.routes.flatMap((route) => route.path),
      ...(site ? [site.location] : []),
    ]);
  }, [active, candidates, activeId, ready]);

  return (
    <div className="map-root">
      <div ref={containerRef} className="map-canvas" />
      {(!ready || !sliceLoaded) && !error && (
        <div className="map-status">
          {ready
            ? `Loading ${BUILDING_COUNT.toLocaleString("en-US")} buildings…`
            : "Loading the neighborhood…"}
        </div>
      )}
      {error && (
        <div className="map-status map-status--error">
          Basemap tiles failed to load: {error}
          <br />
          The slice and simulation layers are local, so only the surrounding
          context is affected.
        </div>
      )}
      <ScenarioPanel {...scenarios} />
      {selected && <BuildingPanel building={selected} onClose={clearSelection} />}
      <button
        type="button"
        className="map-reset"
        onClick={() => mapRef.current && frameDemoArea(mapRef.current)}
      >
        Reset view
      </button>
    </div>
  );
}
