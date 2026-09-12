# CivicSim — Hackathon Technical Stack & Map Architecture

**Status:** Accepted direction for the hackathon MVP
**Relationship to other docs:** This document makes concrete, scoped decisions within the boundaries set by [`01-product-concept.md`](./01-product-concept.md) — specifically its suggested stack (§19), prototype boundary (§18), and development roadmap (§24, Phase 0–1). Where the concept doc lists multiple options (e.g. MapLibre/deck.gl *or* CesiumJS; PostgreSQL/PostGIS as a "natural" store), this document picks one for the hackathon and explains why.

> For how the 2.5D city is layered, which demo area we use, and hardware/performance notes, see [`03-map-rendering-and-demo-area.md`](./03-map-rendering-and-demo-area.md).

---

## 0. Feasibility assessment

Overall verdict: **feasible, low-risk, and well-aligned with the existing concept doc.** This is not a new direction — it's a decisive resolution of choices the concept doc had deliberately left open, biased toward what a small team can actually ship in a hackathon.

| Idea | Feasibility | Notes |
| --- | --- | --- |
| Next.js (3000) + FastAPI (8000), no proxy, CORS-only | ✅ High | Standard, well-documented pattern. Removes a layer of complexity the concept doc's fuller architecture would eventually want (an API gateway), but that's the right cut for a local demo. |
| 2.5D city via MapLibre `fill-extrusion` on real building footprints, instead of manual/AI-generated 3D or CesiumJS | ✅ High | This *is* the concept doc's own "fastest polished prototype" option (§8.1, §19). Building extrusion from footprint + height is a standard, documented MapLibre technique — not a research risk. |
| deck.gl layered on top of MapLibre for agents/routes/heat | ✅ High | `@deck.gl/mapbox` interleaving with MapLibre is an established integration path, not experimental. |
| Buildings as structured, clickable, simulation-linked objects (not just visuals) | ✅ High | Directly matches the concept doc's "versioned city model" (§8.3) and multilayer graph (§9). This is the right instinct — geometry and simulation state must stay connected. |
| No database; local files + in-memory state at FastAPI startup | ✅ High | Matches the concept doc's own Phase 0/1 guidance and §18.1 prototype boundary. Correct call for a 1-day-to-1-week build; revisit PostGIS only if the project moves past the hackathon (concept doc §8.3, Phase 4). |
| Heavy preprocessing (OSM extraction, graph build, synthetic population) done ahead of the demo, live computation kept to "modify graph → route → aggregate" | ✅ High | This is the single most important feasibility lever. It's the standard way hackathon demos avoid on-stage network/compute failures, and it matches §18.2 ("real vs. preprocessed vs. mocked"). |
| Graph edges carry mode-specific cost attributes (shade, slope, curb ramps, heat exposure); interventions mutate attributes and trigger re-routing | ✅ High, with one caveat | This is exactly the concept doc's generalized route cost model (§9.2). Caveat: routing thousands of agents per request with plain NetworkX Dijkstra can get slow as the graph grows. Mitigated by the plan's own scope limits (one neighborhood slice, ~2,500 agents) — fine at that scale; would need optimization (contraction hierarchies, precomputed distance tables, or batching) if scope grows. |
| Visualize ~150 representative agents instead of animating all ~2,500 simulated | ✅ High | Sound performance/clarity tradeoff; simulation correctness is unaffected because the full population still drives the metrics. |
| Milestone order: map first → agents/routing → FastAPI wiring → AI last | ✅ High | De-risks the highest-uncertainty, most impressive-but-optional piece (AI) by sequencing it last, consistent with the concept doc's roadmap (§24) and "what to cut first" list (§26, which explicitly puts natural-language planning below the core loop). |
| Explicitly skipping auth, cloud infra, k8s, job queues, full-LA coverage | ✅ High | Matches concept doc §21/§26 almost item-for-item. |

**Residual risks to plan around, not blockers:**
- **Live venue Wi-Fi** for online vector tiles (the doc already flags this). Mitigate by bundling a local/offline tile package (e.g. pre-fetched PMTiles) as a fallback, not just "enough local geometry."
- **Preprocessing time budget.** OSM extraction + graph construction + synthetic population generation is real engineering work; timebox it explicitly in Phase 0 so it doesn't eat into simulation/UI time.
- **Routing performance at scale** (see caveat above) — a non-issue at "one neighborhood slice" scope, worth a one-line note in code so a future contributor doesn't naively scale agent count without noticing.

None of these risks require a different architecture — they're execution details to track during Phase 0–1.

---

## 1. Overall direction

CivicSim's hackathon build is a **local-first web application**:

- The product form is a web app.
- The live demo runs entirely on the team's laptop.
- Frontend on `localhost:3000`, simulation backend on `localhost:8000`.
- No production deployment, authentication, cloud infrastructure, or production database for the MVP.

```text
Browser
  ↓
Next.js + TypeScript        (localhost:3000)
  ↓
FastAPI + Python            (localhost:8000)
  ↓
Local geospatial data + graph + synthetic population
```

The goal is a polished web product without spending hackathon time turning it into a production SaaS.

---

## 2. Map strategy: real geospatial data, not a modeled city

We should **not**: model South LA buildings manually, use Blender, generate the city with AI, rely on a static rendered image, or use a photorealistic mesh as the primary simulation representation.

Instead, construct the visual city from real geospatial data:

```text
Real GIS / OpenStreetMap data
        ↓
Building footprints + roads + facilities
        ↓
MapLibre GL JS
        ↓
2.5D extruded neighborhood
```

The browser turns real 2D building polygons into 3D-looking buildings via extrusion — footprint + height → MapLibre `fill-extrusion` → a 2.5D building. This gives a real neighborhood model without traditional 3D modeling.

---

## 3. Why 2.5D instead of photorealistic 3D

Recommended: **MapLibre + deck.gl + structured geospatial data**, not CesiumJS + Google Photorealistic 3D Tiles.

Photorealistic 3D has stronger visual realism, but CivicSim needs a city that can be queried, styled, modified, and linked to simulation objects and graph nodes/edges. A building should represent a structured object:

```json
{
  "id": "building_204",
  "type": "library",
  "height": 14,
  "accessible": true,
  "cooling_center_candidate": true
}
```

That makes it possible to click a building, modify its role, and rerun the simulation.

| | Visual realism | Simulation usefulness | Editability | Semantic control |
| --- | :---: | :---: | :---: | :---: |
| Photorealistic 3D | ★★★★★ | ★★ | ★★ | ★★ |
| 2.5D vector city | ★★★★ | ★★★★★ | ★★★★★ | ★★★★★ |

For the hackathon, the 2.5D vector city wins decisively.

---

## 4. Recommended map stack

### 4.1 Base map

- **MapLibre GL JS**
- OpenStreetMap-derived vector data
- OpenFreeMap or another compatible vector-tile source

MapLibre handles roads, building footprints, labels, land use, parks, camera, pitch/bearing, and 2.5D building extrusion.

### 4.2 Building layer

Buildings come from real footprints (OpenStreetMap, LA/LA County GIS, or preprocessed local GeoJSON). Important attributes:

```text
building_id
geometry
height
building_type
facility_type
accessibility
candidate_site
```

```javascript
map.addLayer({
  id: "buildings",
  type: "fill-extrusion",
  source: "city",
  "source-layer": "building",
  paint: {
    "fill-extrusion-height": ["get", "height"]
  }
});
```

The result is a real 2.5D neighborhood rather than a manually modeled scene.

---

## 5. deck.gl's role

MapLibre renders the city; deck.gl renders the simulation. Both share the same map/camera.

```text
                WebGL Map
                    │
        ┌───────────┴───────────┐
        │                       │
    MapLibre                 deck.gl
        │                       │
        ├─ buildings            ├─ agents
        ├─ roads                ├─ routes
        ├─ labels               ├─ heat maps
        ├─ parks                ├─ accessibility
        └─ geography            ├─ interventions
                                 └─ simulation flows
```

Useful deck.gl layers: `ScatterplotLayer`, `PathLayer`, `TripsLayer`, `HeatmapLayer`, `GeoJsonLayer`, custom WebGL layers as needed.

---

## 6. Visual style

The city should not imitate Google Earth — it should look like a professional simulation/planning tool:

```text
Muted / dark buildings
+ warm neutral map
+ cyan simulation routes
+ orange/red heat exposure
+ green proposed interventions
+ soft animated agent flows
```

Goals: the city is recognizable, data layers are readable, proposal changes are visually obvious, agent behavior is immediately understandable, and baseline vs. proposal differences are clear. Simulation clarity beats photorealism.

---

## 7. Local data strategy

For the hackathon, critical simulation data should be local: neighborhood geometry, building/facility GeoJSON, the graph, synthetic population, candidate cooling centers, and simulation configuration all live on disk.

The polished basemap can use online vector tiles during development, but the live demo should have enough local geometry to remain functional if venue Wi-Fi is unreliable — and the simulation itself must never depend on downloading data during the demo.

---

## 8. Frontend stack

```text
Next.js
React
TypeScript
App Router
MapLibre GL JS
deck.gl
```

Optional: charting, panels, buttons, animation, icon libraries.

Frontend responsibilities: map rendering, 2.5D buildings, agent visualization, route animation, heat maps, scenario editing, intervention placement, comparison UI, metrics display, simulation loading states, AI command interface.

### Suggested App Router structure

```text
web/
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   └── scenario/
│
├── components/
│   ├── map/
│   ├── simulation/
│   ├── panels/
│   └── charts/
│
├── lib/
│   ├── api.ts
│   ├── map.ts
│   └── types.ts
│
└── public/
```

> **The core simulation should NOT be implemented inside Next.js Route Handlers.** Next.js is the visualization and interaction layer only.

---

## 9. Backend stack

```text
Python
FastAPI
NetworkX
NumPy
Pandas
GeoPandas
```

Potential later additions: OSMnx, Mesa, SciPy, OR-Tools.

Backend responsibilities: load the neighborhood graph, load synthetic residents, modify graph state, route agents, apply accessibility constraints, calculate heat exposure and accessibility, aggregate metrics, compare scenarios, optimization, uncertainty/repeated runs.

---

## 10. Frontend/backend separation

```text
User edits proposal → Next.js → POST /simulate → FastAPI
  → apply intervention → update graph → route synthetic agents
  → calculate metrics → return result → Next.js animates routes + updates charts
```

Example: user selects Site B → `POST /simulate` → Python routes 2,500 agents → computes population reached, wheelchair-accessible reach, heat exposure, travel time, capacity → JSON result → deck.gl visualization.

### No Next.js API proxy needed

```text
Browser → Next.js (3000) → FastAPI (8000)
```

The browser calls FastAPI directly; FastAPI enables CORS for `http://localhost:3000`. The extra `Next.js /api/simulate` proxy layer provides little value for a local hackathon prototype.

---

## 11. Minimal FastAPI surface

```http
GET  /baseline
POST /simulate
GET  /scenario/{id}
```

Example request:

```json
{
  "cooling_center": "site_b",
  "shade_segments": ["edge_18", "edge_19"]
}
```

Example response:

```json
{
  "scenario_id": "site_b",
  "metrics": {
    "population_reached": 12980,
    "wheelchair_access": 0.82,
    "average_heat_exposure": 12.9
  },
  "routes": [],
  "unreachable_agents": [],
  "heatmap": []
}
```

---

## 12. No database for the hackathon MVP

Avoid PostgreSQL, PostGIS, Redis, and job queues to start. Use local files and in-memory structures instead:

```text
civicsim/
│
├── web/                    # Next.js frontend
│
├── backend/
│   ├── main.py
│   ├── simulation/
│   │   ├── engine.py
│   │   ├── routing.py
│   │   ├── agents.py
│   │   └── metrics.py
│   └── data/
│       ├── graph.pkl
│       ├── agents.json
│       ├── facilities.json
│       └── scenario.json
│
└── data/
    ├── neighborhood.geojson
    ├── buildings.geojson
    ├── roads.geojson
    ├── sidewalks.geojson
    ├── transit.geojson
    └── heat.geojson
```

At FastAPI startup: load graph, agents, facilities, and environmental data; keep everything in memory. Simulation requests then operate on the already-loaded model.

---

## 13. Preprocess as much as possible

Do not perform expensive geospatial preparation during the live demo. Precompute and save locally:

```text
OpenStreetMap download
building extraction
road graph creation
sidewalk graph creation
facility extraction
synthetic population generation
candidate-site selection
environmental-layer processing
```

The live simulation should only do: `proposal → modify graph/destination → route agents → aggregate metrics`. The UI can show staged progress ("Generating synthetic journeys...", "Applying mobility constraints...", "Routing residents...", "Calculating equity metrics...") while the actual computation completes in a few seconds.

---

## 14. Simulation representation: geometry ↔ graph

The city exists in two connected representations: visual geographic objects and simulation graph objects.

```text
Visible sidewalk segment → graph edge e_103 → attributes:
  length, shade, slope, curb ramp, sidewalk quality, heat exposure, accessibility
```

Interventions modify graph attributes. Example — a curb-ramp improvement flips `wheelchair_accessible` from `false` to `true` on `edge_103`; rerunning the simulation lets wheelchair agents use the edge, which changes routes, accessibility metrics, and the map visualization.

**This connection between map geometry and simulation state is one of CivicSim's most important technical ideas.**

---

## 15. Synthetic agents

Agents live in Python simulation state:

```json
{
  "id": "agent_1382",
  "origin": "zone_07",
  "modes": ["walk", "bus"],
  "wheelchair": true,
  "heat_sensitivity": "high",
  "max_travel_time": 20
}
```

Python determines which route an agent can use, how long it takes, how much heat exposure occurs, whether the agent can reach the cooling center, and which infrastructure barriers block access.

The frontend does not need to animate every agent: 2,500 simulated agents can be represented by ~150 animated dots, keeping the interface smooth while preserving real simulation results.

---

## 16. Mental model

```text
MapLibre = "What does the neighborhood look like?"
deck.gl   = "What is happening in the neighborhood?"
Python    = "Why is it happening?"
```

```text
MapLibre                deck.gl                    FastAPI / Python
├─ roads                ├─ synthetic residents      ├─ graph
├─ buildings            ├─ routes                   ├─ agents
├─ parks                ├─ heatmaps                 ├─ routing
├─ labels               ├─ selected facilities      ├─ constraints
└─ geography            ├─ intervention effects     ├─ metrics
                         └─ before/after view        └─ scenario comparison
```

---

## 17. First hackathon map milestone

The first technical milestone is **not** AI. It is:

> Render one real South LA neighborhood in Next.js as an interactive 2.5D map.

```text
Next.js opens → MapLibre loads → South LA appears → real roads visible
  → real building footprints visible → buildings extruded to 2.5D
  → user can click one building → building metadata appears
```

Once this works, the core spatial platform exists. Next milestone: add candidate cooling centers → add synthetic residents → show routes → connect FastAPI → run real routing. Only after that: LLM planning agent, computer vision, optimization, advanced uncertainty.

---

## 18. Hackathon scope

We do **not** need to model all of Los Angeles. Use one neighborhood slice + one flagship scenario + three candidate cooling centers + a few synthetic agent types + walking/transit + a small number of meaningful metrics.

The technical goal is not "simulate Los Angeles perfectly" — it is "prove that changing a real neighborhood proposal produces meaningful changes in simulated resident outcomes."

---

## 19. Explicitly out of scope for the hackathon

```text
authentication              PostgreSQL / PostGIS
accounts                    Redis / job queues
microservices               Kubernetes
cloud simulation workers    production deployment
full Los Angeles coverage   photorealistic reconstruction
complex 3D modeling
```

These do not materially improve the core demo.

---

## 20. Local development setup

```bash
# Terminal 1
cd web
npm run dev        # http://localhost:3000

# Terminal 2
cd backend
uvicorn main:app --reload   # http://localhost:8000
```

```text
┌───────────────────────────────────────┐
│              Browser                  │
│        http://localhost:3000          │
└───────────────────┬───────────────────┘
                     ▼
┌───────────────────────────────────────┐
│              Next.js                  │
│ React / TypeScript / App Router       │
│ MapLibre / deck.gl / UI / charts      │
└───────────────────┬───────────────────┘
                     │ HTTP
                     ▼
┌───────────────────────────────────────┐
│              FastAPI                  │
│ NetworkX / GeoPandas / NumPy / Pandas │
│ Simulation Engine                     │
└───────────────────┬───────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼             ▼            ▼
   Local Graph     GeoJSON    Synthetic Agents
```

---

## 21. Final recommended stack

**Frontend:** Next.js, React, TypeScript, App Router, MapLibre GL JS, deck.gl
**Backend:** Python, FastAPI, NetworkX, NumPy, Pandas, GeoPandas
**Data:** OpenStreetMap, LA/LA County GIS data, local GeoJSON, local graph files, local synthetic population
**Optional later:** OSMnx, Mesa, OR-Tools, PostGIS, LLM tool calling, computer vision

---

## 22. Core technical principle

> **Build a real web product, but run it like a local simulation application.**

For the map specifically:

> **Do not search for a finished 3D model of South LA. Build a controllable 2.5D city from real geospatial data and place the simulation on top of it.**

And the key architectural separation:

```text
MapLibre        → renders the city
deck.gl         → renders the simulation
Next.js         → handles the product experience
FastAPI/Python  → performs the actual simulation
```
