"use client";

/**
 * The only way the rest of the app should reach the map.
 *
 * MapLibre and deck.gl are browser-only, so `CityMap` is loaded with
 * `ssr: false` (doc 04 section 2.3.5). Doing it here, once, means no page has
 * to remember it.
 */

import dynamic from "next/dynamic";

const CityMap = dynamic(() => import("./CityMap"), {
  ssr: false,
  loading: () => <div className="map-status">Starting the map…</div>,
});

export default function MapView() {
  return <CityMap />;
}
