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
import {
  CAMERA,
  MAX_PIXEL_RATIO,
  SLICE_SOURCE,
  addSliceLayers,
  addVenueMarker,
  frameDemoArea,
} from "@/lib/map";
import { BUILDING_COUNT, DEMO_AREA_BOUNDS } from "@/lib/demoArea.generated";
import { buildContextStyle } from "@/lib/mapStyle";
import { attachSimulationOverlay } from "@/lib/simulation";

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

    map.once("load", () => {
      addSliceLayers(map);
      addVenueMarker(map);
      // After the slice, so the overlay's interleaved layers are composited
      // against buildings that already exist.
      detachOverlay = attachSimulationOverlay(map).detach;
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
