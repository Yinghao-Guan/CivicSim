"use client";

/**
 * Hover and selection for layer 2.
 *
 * Uses MapLibre `feature-state` rather than React state for the visual
 * highlight: re-styling through feature-state touches only the GPU attributes
 * of one feature, where re-rendering a 4,887-feature source on every mouse move
 * would not hold 60fps. React only ever hears about the *selected* building,
 * which is what the side panel needs.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MapLayerMouseEvent, Map as MapLibreMap } from "maplibre-gl";

import { SLICE_SOURCE, sliceLayerIds } from "@/lib/map";
import type { BuildingProperties } from "@/lib/types";

export interface SliceInteraction {
  selected: BuildingProperties | null;
  clearSelection: () => void;
  /** Attach once the slice layer exists. Returns a detach function. */
  attach: (map: MapLibreMap) => () => void;
}

export function useSliceInteraction(): SliceInteraction {
  const [selected, setSelected] = useState<BuildingProperties | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);

  const setState = useCallback(
    (map: MapLibreMap, id: string | null, key: "hover" | "selected", value: boolean) => {
      if (id === null) return;
      map.setFeatureState({ source: SLICE_SOURCE, id }, { [key]: value });
    },
    [],
  );

  const clearSelection = useCallback(() => {
    const map = mapRef.current;
    if (map) setState(map, selectedRef.current, "selected", false);
    selectedRef.current = null;
    setSelected(null);
  }, [setState]);

  const attach = useCallback(
    (map: MapLibreMap) => {
      mapRef.current = map;
      const layer = sliceLayerIds.buildings;

      const onMove = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        // `id` comes from promoteId, so it is our own building_id.
        const id = feature?.id != null ? String(feature.id) : null;
        if (id === hoveredRef.current) return;
        setState(map, hoveredRef.current, "hover", false);
        hoveredRef.current = id;
        setState(map, id, "hover", true);
        map.getCanvas().style.cursor = id ? "pointer" : "";
      };

      const onLeave = () => {
        setState(map, hoveredRef.current, "hover", false);
        hoveredRef.current = null;
        map.getCanvas().style.cursor = "";
      };

      const onClick = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        // Stops the map-wide handler below from immediately deselecting.
        event.preventDefault();
        const id = String(feature.id);
        setState(map, selectedRef.current, "selected", false);
        selectedRef.current = id;
        setState(map, id, "selected", true);
        setSelected(feature.properties as unknown as BuildingProperties);
      };

      const onMapClick = (event: MapLayerMouseEvent) => {
        if (event.defaultPrevented) return;
        clearSelection();
      };

      map.on("mousemove", layer, onMove);
      map.on("mouseleave", layer, onLeave);
      map.on("click", layer, onClick);
      map.on("click", onMapClick);

      return () => {
        map.off("mousemove", layer, onMove);
        map.off("mouseleave", layer, onLeave);
        map.off("click", layer, onClick);
        map.off("click", onMapClick);
        mapRef.current = null;
      };
    },
    [clearSelection, setState],
  );

  // Escape is the expected way out of a selection.
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, clearSelection]);

  return { selected, clearSelection, attach };
}
