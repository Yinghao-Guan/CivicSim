# CivicSim — Map Rendering Approach, Demo Area & Hardware Notes

**Status:** Accepted direction for the `map` milestone (decided 2026-09-12)
**Relationship to other docs:** This document narrows three things [`02-technical-stack-hackathon-mvp.md`](./02-technical-stack-hackathon-mvp.md) left underspecified: *how* the 2.5D city is layered so buildings stay clickable and simulation-linked (§4–§5 of doc 02), *which* neighborhood slice the demo uses (doc 02 §18 only says "one neighborhood slice"), and what the rendering approach demands of local hardware. It also records what we confirmed about the event itself, since that shaped the area choice.

---

## 1. Event context (confirmed)

CivicSim is being built for **VISION HACK: South LA** — Saturday, September 12, 2026, at the SoLa Technology & Entrepreneurship Center at The Beehive (E. 60th St., South LA), produced by Hacker Fund as part of the City of LA's Vision Lab program.

What we confirmed:

- **Council Districts 8, 9, and 10 are a participant eligibility rule, not a project requirement.** The event page says the hackathon "is open to youth ages 14-30 from LA Council Districts 8, 9, and 10." We found no rule restricting which neighborhood a project may target.
- **The specific challenge is announced at the opening ceremony** by the Los Angeles Mayor's Office. No detailed challenge, rubric, or rules page for this event was found beforehand.
- **Do not confuse this event with "VISION HACK – Pi Day"** (March 14, 2026). That separate event's Devpost page (`vision-hack.devpost.com`) is the source of the "three parts of the digital divide" theme, the weighted judging rubric (Impact 25%, Design Thesis 25%, Pitch 20%, Process 15%, Technical 15%), and its originality rules. The South LA pages only mention "bridge the digital divide" as a general series mission. Treat on-site announcements as authoritative for this event.

Sources: [Hacker Fund event page](https://www.hacker.fund/visionhack/), [Luma series page](https://luma.com/visionhack), [Pi Day Devpost (different event)](https://vision-hack.devpost.com/).

---

## 2. Rendering approach: 2.5D, in three layers

We keep doc 02's decision — **MapLibre `fill-extrusion` for the city, deck.gl for the simulation** — and reject CesiumJS + Google Photorealistic 3D Tiles (monolithic mesh with no per-building semantics, API key required, terms restrict offline caching, heavier to render, and South LA is flat and low-rise so depth adds little information).

### 2.1 The gap in doc 02

Doc 02 §4.2 shows buildings coming from a vector-tile source (`"source-layer": "building"`), but also requires buildings to be clickable, carry attributes like `cooling_center_candidate`, and map to simulation objects. Tile-provided buildings have no stable IDs we control and cannot carry those attributes. Both requirements cannot be satisfied by one layer, so the city is split into three.

### 2.2 Layer structure

| Layer | Content | Implementation |
| --- | --- | --- |
| ① Context basemap | Surrounding roads, labels, parks, distant buildings | OpenFreeMap vector tiles; tile buildings extruded for visual context only, not interactive |
| ② Demo slice (core) | Buildings in the chosen slice with `building_id`, `height`, `facility_type`, `candidate_site`, … | Preprocessed **local GeoJSON** as a MapLibre `geojson` source, drawn with `fill-extrusion`; click/hover/highlight via `promoteId` + `feature-state` |
| ③ Simulation | Agents, routes, heat, intervention effects | deck.gl `MapboxOverlay` with `interleaved: true`, so routes and agents are correctly occluded by extruded buildings |

### 2.3 Implementation details

1. **Building heights.** Much of LA's OSM building data came from the LA County (LARIAC) import and often carries `height`; coverage for the slice must be checked. Fallback order: `height` → `building:levels × 3 m` → default ~5 m. Height accuracy affects appearance only, not simulation results.
2. **Offline fallback.** Export the demo area basemap as **PMTiles** served from `public/`. Layers ② and ③ are already local, so the demo survives unreliable venue Wi-Fi.
3. **No shade from rendering.** MapLibre does not compute real shadows. Shade and heat exposure are backend edge attributes; the frontend only visualizes them.
4. **No terrain.** The area is flat. Slope, if used, is computed by the backend from a DEM and stored on graph edges.
5. **Next.js.** MapLibre and deck.gl are browser-only: map components use `"use client"` and are loaded with `dynamic(..., { ssr: false })`.

**Not pursued:** Three.js custom layers, re-rendering all buildings in deck.gl, CesiumJS.

---

## 3. Demo area

### 3.1 Decision

Start with a **~3 km² slice around The Beehive** (confirmed CD 9; South Park neighborhood). If time allows, **expand toward full coverage of Council Districts 8, 9, and 10**.

> **Amended 2026-09-12 by M0.** This section originally specified ~1.5–2 km². Surveying the area showed that a 2 km² box contains only **one** facility plausible as a cooling center (the Mary McLeod Bethune pool), which cannot support the three candidate sites doc 01 §18.1 requires. The box was enlarged to 3.00 km² to include the Slauson Senior Multipurpose Center and Slauson Recreation Center cluster. Exact coordinates and measurements: [`04-map-milestone-plan.md`](./04-map-milestone-plan.md) §3.

### 3.2 Why

1. **Inside CD 8/9/10** — the participants' own communities, and relevant to Mayor's Office judges.
2. **Strong fit for the cooling-center scenario** — South LA east of the 110 is among the city's lowest-canopy, most heat-vulnerable, most transit-dependent areas, which supports the "total reach vs. vulnerable-resident reach" reveal in doc 01 §5.
3. **Demo narrative** — "this is the neighborhood we are sitting in."
4. **Flat terrain** — the wheelchair reveal in doc 01 relies on curb ramps and sidewalk condition, not slope, so flatness does not interfere.
5. **Plausible candidate facilities** — recreation centers, branch libraries, and schools nearby; final candidates to be chosen from OSM data.

**Boundary note:** east toward the Alameda corridor is largely industrial with few residents. Keep the slice on the residential side so synthetic origins are distributed realistically.

### 3.3 Alternatives considered

- **Vermont Square (CD 8/9 border)** — already referenced in doc 01 examples (`vermont_square_07`, "west of Vermont Avenue"); heavy bus corridor; farther from the venue.
- **Leimert Park / Crenshaw (CD 8)** — recognizable, K Line stations; higher canopy and income, so a weaker heat-equity story.

### 3.4 Verified when building the slice

**All four items resolved by M0 on 2026-09-12.** Results are recorded in [`04-map-milestone-plan.md`](./04-map-milestone-plan.md) §3; summarized here:

- **Council district — confirmed CD 9** (Curren D. Price Jr.), by point query against two City of LA boundary layers.
- **Venue address — 1000 E. 60th St.** (`33.98530, -118.25747`). OSM carries `The Beehive` as a named `amenity=conference_centre` at this point; 950 E. 60th St. is a separate address point ~190 m west.
- **Height coverage — 96.2%** of buildings carry `height`, with LiDAR-derived decimal values. The fallback chain is a safety net, not a load-bearing path.
- **Bounding box — drawn and recorded.** The Alameda rail corridor turned out to be 2.16 km east of the venue, outside any box at this scale, so the §3.2 boundary note did not constrain the result; the box was instead shaped to lower its industrial/warehouse building share.

---

## 4. Hardware and performance

### 4.1 No high-end hardware required

2.5D extrusion turns each footprint into a simple prism — a handful of triangles, no textures, no complex lighting. This is far lighter than photorealistic 3D. Reference development machine: Apple M4 (10-core CPU / 10-core GPU), 24 GB RAM — comfortably sufficient.

| Stage | Scale (rough estimate) | Pressure point | Expectation |
| --- | --- | --- | --- |
| Beehive slice | 3.00 km², ~4,900 buildings (measured) | Negligible | Smooth |
| deck.gl simulation layer | ~150 animated agents, hundreds of routes | Negligible | Smooth |
| Backend routing | ~2,500 agents with NetworkX | Single-core CPU | Seconds |
| CD 8/9/10 expansion | 100+ km², possibly hundreds of thousands of buildings | **Data loading strategy**, not GPU | Requires pipeline change (below) |

### 4.2 Design for expansion from the start

- **Buildings:** a single GeoJSON with hundreds of thousands of features costs hundreds of MB of browser memory and seconds of parsing on any machine. At district scale, tile the data with **tippecanoe → PMTiles** so only the visible area loads. The data pipeline should make switching layer ② from GeoJSON to tiles straightforward.
- **Routing:** district-scale graphs will be slow in NetworkX; move to igraph or precomputed distance tables if expanding (consistent with the caveat in doc 02 §0).

### 4.3 High-DPI displays and demo-day checklist

- WebGL renders at the device pixel ratio; a 3840×2400 external display is ~9M pixels per frame. If pitched views with heavy heatmaps stutter, cap MapLibre's `pixelRatio` at ~1.5.
- On demo day: plug in power, disable Low Power Mode (it throttles the GPU), and confirm browser hardware acceleration is enabled.

---

## 5. Next steps on the `map` branch

> These four steps are sequenced, with done-criteria and cross-platform notes, in [`04-map-milestone-plan.md`](./04-map-milestone-plan.md). The open items in §3.4 above are resolved there in §3.

1. Scaffold `web/` (Next.js, App Router, TypeScript); load MapLibre with OpenFreeMap, pitched camera on the Beehive area.
2. Write a preprocessing script that extracts the slice's buildings from OSM into `buildings.geojson` with IDs, heights (with fallbacks), and facility attributes.
3. Render the slice with `fill-extrusion`; clicking a building shows its attributes in a side panel.
4. Attach an empty deck.gl `MapboxOverlay` (interleaved) and confirm correct occlusion against buildings.
