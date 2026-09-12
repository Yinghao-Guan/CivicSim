"use client";

import {
  AttributionControl,
  GeoJSONSource,
  Map as MapLibreMap,
  NavigationControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Eye, Trees } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { LayerState, SiteId } from "@/lib/types";

const siteCoordinates: Record<SiteId, [number, number]> = {
  a: [-118.2651, 33.9877],
  b: [-118.2577, 33.9847],
  c: [-118.2482, 33.9809],
};

const routeCoordinates: Record<SiteId, [number, number][][]> = {
  a: [
    [[-118.276, 33.981], [-118.272, 33.983], [-118.268, 33.985], [-118.2651, 33.9877]],
    [[-118.268, 33.994], [-118.267, 33.991], [-118.2651, 33.9877]],
    [[-118.256, 33.978], [-118.261, 33.982], [-118.2651, 33.9877]],
  ],
  b: [
    [[-118.276, 33.981], [-118.269, 33.982], [-118.263, 33.984], [-118.2577, 33.9847]],
    [[-118.268, 33.994], [-118.263, 33.991], [-118.2577, 33.9847]],
    [[-118.247, 33.992], [-118.251, 33.988], [-118.2577, 33.9847]],
    [[-118.251, 33.975], [-118.254, 33.98], [-118.2577, 33.9847]],
  ],
  c: [
    [[-118.276, 33.981], [-118.265, 33.979], [-118.256, 33.98], [-118.2482, 33.9809]],
    [[-118.258, 33.994], [-118.254, 33.988], [-118.2482, 33.9809]],
    [[-118.238, 33.989], [-118.243, 33.985], [-118.2482, 33.9809]],
  ],
};

const overlayRoutes: Record<SiteId, string[]> = {
  a: ["M75 470 C190 450 225 300 360 220", "M145 80 C220 130 275 180 360 220", "M560 500 C500 420 435 330 360 220"],
  b: ["M75 470 C210 440 345 370 475 315", "M145 80 C230 145 325 225 475 315", "M720 110 C650 170 565 250 475 315", "M590 540 C560 470 525 395 475 315"],
  c: ["M75 470 C240 490 430 470 650 405", "M250 70 C360 160 510 270 650 405", "M810 130 C770 230 710 325 650 405"],
};

const residentCoordinates: [number, number][] = [
  [-118.276, 33.981], [-118.273, 33.986], [-118.270, 33.990], [-118.268, 33.994],
  [-118.265, 33.977], [-118.263, 33.988], [-118.260, 33.980], [-118.257, 33.993],
  [-118.254, 33.976], [-118.251, 33.975], [-118.249, 33.991], [-118.247, 33.992],
  [-118.244, 33.978], [-118.241, 33.985], [-118.237, 33.981], [-118.270, 33.976],
  [-118.261, 33.996], [-118.253, 33.989], [-118.246, 33.975], [-118.240, 33.992],
];

function featureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

const heatData = featureCollection([
  {
    type: "Feature",
    properties: { intensity: 0.92 },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-118.280, 33.975], [-118.263, 33.974], [-118.258, 33.984],
        [-118.265, 33.991], [-118.279, 33.988], [-118.280, 33.975],
      ]],
    },
  },
  {
    type: "Feature",
    properties: { intensity: 0.72 },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-118.258, 33.978], [-118.242, 33.975], [-118.234, 33.985],
        [-118.242, 33.995], [-118.257, 33.991], [-118.258, 33.978],
      ]],
    },
  },
]);

const candidateData = featureCollection(
  (Object.entries(siteCoordinates) as [SiteId, [number, number]][]).map(([id, coordinates]) => ({
    type: "Feature",
    properties: { id, label: id.toUpperCase() },
    geometry: { type: "Point", coordinates },
  })),
);

const residentData = featureCollection(
  residentCoordinates.map((coordinates, index) => ({
    type: "Feature",
    properties: { id: index },
    geometry: { type: "Point", coordinates },
  })),
);

function routeData(selectedSite: SiteId) {
  return featureCollection(
    routeCoordinates[selectedSite].map((coordinates, index) => ({
      type: "Feature",
      properties: { id: index },
      geometry: { type: "LineString", coordinates },
    })),
  );
}

type MapCanvasProps = {
  layers: LayerState;
  selectedSite: SiteId;
  onSelectSite: (site: SiteId) => void;
  playing: boolean;
};

export default function MapCanvas({ layers, selectedSite, onSelectSite, playing }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectSiteRef = useRef(onSelectSite);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    selectSiteRef.current = onSelectSite;
  }, [onSelectSite]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [-118.2575, 33.985],
      zoom: 14.4,
      pitch: 48,
      bearing: -19,
      attributionControl: false,
      maxPitch: 68,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: true }), "bottom-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-left");

    map.on("error", () => setMapError(true));
    map.on("load", () => {
      setMapReady(true);
      setMapError(false);
      const style = map.getStyle();
      const firstSymbol = style.layers?.find((layer) => layer.type === "symbol")?.id;

      if (style.sources?.openmaptiles) {
        map.addLayer({
          id: "civicsim-3d-buildings",
          source: "openmaptiles",
          "source-layer": "building",
          type: "fill-extrusion",
          minzoom: 13.8,
          paint: {
            "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 5], 0, "#d9d8d1", 12, "#c9cac4", 40, "#b9bbb6"],
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 5],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.84,
          },
        }, firstSymbol);
      }

      map.addSource("heat-zones", { type: "geojson", data: heatData });
      map.addLayer({
        id: "heat-zones",
        type: "fill",
        source: "heat-zones",
        paint: {
          "fill-color": ["interpolate", ["linear"], ["get", "intensity"], 0.6, "#ffbd71", 1, "#ef735c"],
          "fill-opacity": 0.18,
        },
      }, firstSymbol);

      map.addSource("routes", { type: "geojson", data: routeData("b") });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "rgba(255,255,255,.9)", "line-width": 6, "line-opacity": 0.78 },
      });
      map.addLayer({
        id: "routes",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#00a98f", "line-width": 3, "line-opacity": 0.92, "line-dasharray": [0.1, 2] },
      });

      map.addSource("residents", { type: "geojson", data: residentData });
      map.addLayer({ id: "resident-halo", type: "circle", source: "residents", paint: { "circle-radius": 7, "circle-color": "rgba(255,255,255,.72)", "circle-blur": 0.4 } });
      map.addLayer({ id: "residents", type: "circle", source: "residents", paint: { "circle-radius": 3.2, "circle-color": "#326fce", "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff" } });

      map.addSource("candidates", { type: "geojson", data: candidateData });
      map.addLayer({
        id: "candidate-halos", type: "circle", source: "candidates",
        paint: { "circle-radius": ["case", ["==", ["get", "id"], "b"], 23, 18], "circle-color": "#ffffff", "circle-opacity": 0.92, "circle-stroke-color": "rgba(17,28,26,.14)", "circle-stroke-width": 1 },
      });
      map.addLayer({
        id: "candidates", type: "circle", source: "candidates",
        paint: { "circle-radius": ["case", ["==", ["get", "id"], "b"], 16, 12], "circle-color": ["match", ["get", "id"], "a", "#2e78ff", "b", "#16a375", "#ef8350"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
      });
      map.addLayer({
        id: "candidate-labels", type: "symbol", source: "candidates",
        layout: { "text-field": ["get", "label"], "text-size": 13, "text-allow-overlap": true },
        paint: { "text-color": "#ffffff" },
      });

      map.on("mouseenter", "candidates", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "candidates", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", "candidates", (event) => {
        const id = event.features?.[0]?.properties?.id as SiteId | undefined;
        if (id) selectSiteRef.current(id);
      });
    });

    return () => {
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    (map.getSource("routes") as GeoJSONSource | undefined)?.setData(routeData(selectedSite));
    if (map.getLayer("candidates")) {
      map.setPaintProperty("candidate-halos", "circle-radius", ["case", ["==", ["get", "id"], selectedSite], 23, 18]);
      map.setPaintProperty("candidates", "circle-radius", ["case", ["==", ["get", "id"], selectedSite], 16, 12]);
    }
    map.easeTo({ center: siteCoordinates[selectedSite], duration: 700, zoom: 14.45 });
  }, [mapReady, selectedSite]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const visibility = (visible: boolean) => (visible ? "visible" : "none");
    const layerGroups: [boolean, string[]][] = [
      [layers.heat, ["heat-zones"]], [layers.residents, ["resident-halo", "residents"]],
      [layers.routes, ["route-casing", "routes"]], [layers.facilities, ["candidate-halos", "candidates", "candidate-labels"]],
    ];
    layerGroups.forEach(([visible, ids]) => ids.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility(visible));
    }));
  }, [layers, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    let opacity = 0.55;
    let direction = 1;
    const animate = () => {
      opacity += direction * 0.005;
      if (opacity >= 1 || opacity <= 0.55) direction *= -1;
      if (map.getLayer("routes")) map.setPaintProperty("routes", "line-opacity", opacity);
      animationRef.current = window.requestAnimationFrame(animate);
    };
    if (playing) animate();
    else if (map.getLayer("routes")) map.setPaintProperty("routes", "line-opacity", 0.92);
    return () => {
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [mapReady, playing]);

  return (
    <div className="map-canvas-wrap">
      <div ref={containerRef} className="map-canvas" />
      <div className="local-map-overlay" aria-hidden="true">
        <svg viewBox="0 0 900 620" preserveAspectRatio="xMidYMid slice">
          <g className="local-blocks">
            <path d="M40 70 160 30 210 105 92 145Z" /><path d="M225 20 335 0 370 82 255 112Z" />
            <path d="M395 0 515 8 520 92 405 86Z" /><path d="M550 16 680 45 650 125 535 96Z" />
            <path d="M710 55 850 115 805 190 675 135Z" /><path d="M20 185 145 155 185 235 58 270Z" />
            <path d="M190 140 310 112 340 205 225 235Z" /><path d="M365 118 490 122 485 218 365 210Z" />
            <path d="M530 133 645 155 620 245 512 218Z" /><path d="M680 175 800 225 755 302 645 255Z" />
            <path d="M35 300 170 265 195 350 70 390Z" /><path d="M220 260 335 235 350 330 238 350Z" />
            <path d="M380 245 490 250 485 345 375 335Z" /><path d="M525 270 630 292 610 375 505 350Z" />
            <path d="M650 315 765 355 725 438 625 395Z" /><path d="M55 420 175 385 205 470 92 510Z" />
            <path d="M235 380 350 360 365 455 250 470Z" /><path d="M395 375 500 380 495 475 385 465Z" />
            <path d="M530 405 635 430 615 520 510 490Z" /><path d="M650 455 750 500 710 580 615 535Z" />
          </g>
          <g className="local-roads-major">
            <path d="M-20 530 C220 445 470 345 940 185" /><path d="M80 -30 C210 150 400 335 790 660" />
          </g>
          <g className="local-roads-minor">
            <path d="M0 165 C230 105 475 80 900 165" /><path d="M-10 285 C250 225 500 210 920 315" />
            <path d="M0 405 C220 350 520 345 900 465" /><path d="M180 -20 C245 175 290 380 325 650" />
            <path d="M355 -20 C380 175 420 385 450 650" /><path d="M545 -20 C530 180 555 405 590 650" />
            <path d="M710 -20 C660 200 690 430 780 650" />
          </g>
          <g className={`overlay-route-lines ${playing ? "playing" : ""}`}>
            {overlayRoutes[selectedSite].map((path) => <path d={path} key={path} />)}
          </g>
          <g className="overlay-residents">
            {[[75,470],[145,80],[250,70],[720,110],[810,130],[590,540],[350,520],[120,350],[760,500],[300,180],[675,275]].map(([cx, cy]) => <circle cx={cx} cy={cy} key={`${cx}-${cy}`} r="5" />)}
          </g>
        </svg>
        <button className={`overlay-site site-a ${selectedSite === "a" ? "selected" : ""}`} onClick={() => onSelectSite("a")} aria-label="Select Site A">A</button>
        <button className={`overlay-site site-b ${selectedSite === "b" ? "selected" : ""}`} onClick={() => onSelectSite("b")} aria-label="Select Site B">B</button>
        <button className={`overlay-site site-c ${selectedSite === "c" ? "selected" : ""}`} onClick={() => onSelectSite("c")} aria-label="Select Site C">C</button>
        <span className="street-label street-label--one">Slauson Ave</span>
        <span className="street-label street-label--two">Central Ave</span>
        <span className="street-label street-label--three">E 60th St</span>
      </div>
      {mapError && !mapReady && <div className="map-error"><Trees size={24} /><strong>Neighborhood basemap unavailable</strong><span>Simulation controls remain available.</span></div>}
      <div className="synthetic-label"><Eye size={13} /> Sampled agents shown</div>
    </div>
  );
}
