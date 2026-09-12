import MapView from "@/components/map/MapView";

import "./lab.css";
import { BUILDING_COUNT, DEMO_AREA_SWNE, VENUE } from "@/lib/demoArea.generated";

const [south, west, north, east] = DEMO_AREA_SWNE;

export default function Home() {
  return (
    <div className="lab-root">
    <main className="shell">
      <header className="shell-header">
        <div className="shell-title">
          <h1>CivicSim</h1>
          <p>Testing neighborhood decisions before they are built</p>
        </div>
        <dl className="shell-facts">
          <div>
            <dt>Demo area</dt>
            <dd>South Park, CD {VENUE.councilDistrict}</dd>
          </div>
          <div>
            <dt>Extent</dt>
            <dd>
              {west.toFixed(4)}, {south.toFixed(4)} → {east.toFixed(4)},{" "}
              {north.toFixed(4)}
            </dd>
          </div>
          <div>
            <dt>Buildings in slice</dt>
            <dd>{BUILDING_COUNT.toLocaleString("en-US")}</dd>
          </div>
        </dl>
      </header>

      <section className="shell-map">
        <MapView />
      </section>

      <footer className="shell-footer">
        <span className="shell-milestone">M2 — context basemap</span>
        <span>
          Layer 1 of 3. The surrounding city is drawn from vector tiles for
          context and is not interactive; the clickable demo slice is M3 and the
          simulation overlay is M4.
        </span>
      </footer>
    </main>
    </div>
  );
}
