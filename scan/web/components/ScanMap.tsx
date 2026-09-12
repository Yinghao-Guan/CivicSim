"use client";

import maplibregl, { type GeoJSONSource, type Map as MLMap, type Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { buildStyle, colors } from "@/lib/mapStyle";
import type { Area, LngLat, RoutePath } from "@/lib/types";

interface Props {
  area: Area;
  pin: LngLat | null;
  /** When given, the pin is draggable and a tap moves it. */
  onPinChange?: (pin: LngLat) => void;
  highlight?: LngLat[] | null;
  routesBefore?: RoutePath[];
  routesAfter?: RoutePath[];
  /** Change this to re-frame the camera (e.g. after "use my location"). */
  focusKey?: string | number;
  /** Draw every modeled street. Off while placing a pin: the synthetic graph cuts across blocks. */
  showModel?: boolean;
  className?: string;
}

type FC = GeoJSON.FeatureCollection;

const NO_ROUTES: RoutePath[] = [];

const empty = (): FC => ({ type: "FeatureCollection", features: [] });

const lines = (paths: LngLat[][]): FC => ({
  type: "FeatureCollection",
  features: paths.map((coordinates) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  })),
});

export default function ScanMap({
  area,
  pin,
  onPinChange,
  highlight,
  routesBefore = NO_ROUTES,
  routesAfter = NO_ROUTES,
  focusKey,
  showModel = false,
  className,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPinChangeRef = useRef(onPinChange);
  const [ready, setReady] = useState(false);

  onPinChangeRef.current = onPinChange;
  const interactive = Boolean(onPinChange);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: buildStyle(),
      bounds: area.bounds,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    map.on("load", () => {
      const [[w, s], [e, n]] = area.bounds;
      map.addSource("area", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [[w, s], [e, s], [e, n], [w, n], [w, s]] },
        },
      });
      map.addLayer({
        id: "area",
        type: "line",
        source: "area",
        paint: { "line-color": colors.ink, "line-width": 1.2, "line-dasharray": [3, 2], "line-opacity": 0.5 },
      });

      map.addSource("segments", { type: "geojson", data: lines(area.segments.map((s) => s.path)) });
      map.addLayer({
        id: "segments",
        type: "line",
        source: "segments",
        layout: { "line-cap": "round", visibility: showModel ? "visible" : "none" },
        paint: { "line-color": colors.muted, "line-width": 2, "line-opacity": 0.35 },
      });

      for (const id of ["routes-before", "routes-after", "highlight"]) {
        map.addSource(id, { type: "geojson", data: empty() });
      }
      map.addLayer({
        id: "routes-before",
        type: "line",
        source: "routes-before",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": colors.muted, "line-width": 3, "line-dasharray": [1.5, 1.5], "line-opacity": 0.8 },
      });
      map.addLayer({
        id: "routes-after",
        type: "line",
        source: "routes-after",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": colors.cool, "line-width": 4, "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "highlight",
        type: "line",
        source: "highlight",
        layout: { "line-cap": "round" },
        paint: { "line-color": colors.signal, "line-width": 8, "line-opacity": 0.9 },
      });

      map.addSource("sites", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: area.sites.map((site) => ({
            type: "Feature",
            properties: { name: site.name },
            geometry: { type: "Point", coordinates: site.location },
          })),
        },
      });
      map.addLayer({
        id: "sites",
        type: "circle",
        source: "sites",
        paint: {
          "circle-radius": 5,
          "circle-color": colors.paper,
          "circle-stroke-color": colors.ink,
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "site-labels",
        type: "symbol",
        source: "sites",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: { "text-color": colors.ink, "text-halo-color": colors.paper, "text-halo-width": 1.5 },
      });

      setReady(true);
    });

    map.on("click", (event) => {
      onPinChangeRef.current?.([event.lngLat.lng, event.lngLat.lat]);
    });

    return () => {
      markerRef.current = null;
      mapRef.current = null;
      setReady(false);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  // Pin marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const element = document.createElement("div");
      element.className = "pin";
      const marker = new maplibregl.Marker({ element, anchor: "bottom", draggable: interactive })
        .setLngLat(pin)
        .addTo(map);
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        onPinChangeRef.current?.([lng, lat]);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat(pin);
      markerRef.current.setDraggable(interactive);
    }
  }, [pin, interactive, ready]);

  // Overlays.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("highlight") as GeoJSONSource).setData(highlight ? lines([highlight]) : empty());
    (map.getSource("routes-before") as GeoJSONSource).setData(lines(routesBefore.map((r) => r.path)));
    (map.getSource("routes-after") as GeoJSONSource).setData(lines(routesAfter.map((r) => r.path)));
  }, [ready, highlight, routesBefore, routesAfter]);

  // Camera: frame the pin, the highlight and the routes when asked.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || focusKey === undefined) return;
    const points: LngLat[] = [
      ...(pin ? [pin] : []),
      ...(highlight ?? []),
      ...routesAfter.flatMap((r) => r.path),
    ];
    if (points.length === 0) return;
    if (points.length === 1) {
      map.easeTo({ center: points[0], zoom: Math.max(map.getZoom(), 15.5) });
      return;
    }
    const bounds = points.reduce(
      (b, p) => b.extend(p),
      new maplibregl.LngLatBounds(points[0], points[0]),
    );
    map.fitBounds(bounds, { padding: 48, maxZoom: 16.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusKey]);

  return <div ref={container} className={className ?? "map"} />;
}
