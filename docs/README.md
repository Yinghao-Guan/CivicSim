# CivicSim docs

| Doc | What it's for |
| --- | --- |
| [`01-product-concept.md`](./01-product-concept.md) | The full product vision: problem statement, target users, flagship cooling-center scenario, intervention modules, system architecture options, metrics, uncertainty/equity safeguards, roadmap, and research framing. Read this first for *why* CivicSim exists and *what* it should eventually do. |
| [`02-technical-stack-hackathon-mvp.md`](./02-technical-stack-hackathon-mvp.md) | The concrete stack decision for the hackathon build: Next.js + MapLibre/deck.gl on the frontend, FastAPI + NetworkX/GeoPandas on the backend, no database, local-first data. Includes a feasibility assessment and picks one option where doc 01 leaves several open (e.g. MapLibre vs. CesiumJS, no DB vs. PostGIS). Read this for *how* to build the MVP. |
| `03-api-contract.md` | The frontend/backend wire format: endpoints, field names, units, coordinate order, canonical site ids, and the change procedure. Owned by the backend workstream and **not on the `map` branch** — it arrives with the backend merge. Numbers 04 and 05 below were shifted to leave room for it. |
| [`04-map-rendering-and-demo-area.md`](./04-map-rendering-and-demo-area.md) | Decisions for the `map` milestone: the three-layer 2.5D rendering approach (context basemap, clickable local demo slice, interleaved deck.gl simulation layer), the demo area (around The Beehive in CD 9, expanding to CD 8/9/10 if time allows), confirmed VISION HACK: South LA event context, and hardware/performance notes. Read this before working on the map. |
| [`05-map-milestone-plan.md`](./05-map-milestone-plan.md) | The execution plan for the `map` milestone and the record of what each stage produced: M0 (demo area, council district, bounding box, height coverage), M1 (building extraction), M2 (context basemap), M3 (clickable slice), M4 (deck.gl occlusion), M5 (offline package and demo-day runbook). Also the cross-platform conventions and the open risks. Read this when working on the map, and §11 before integrating the backend. |

## Reading order

1. Start with `01-product-concept.md` for the problem, users, and end-state vision.
2. Move to `02-technical-stack-hackathon-mvp.md` for the actual hackathon build plan, milestone order, and what to explicitly cut.
3. Read `04-map-rendering-and-demo-area.md` before working on the map: rendering layers, demo area, and performance.
4. Follow `05-map-milestone-plan.md` while building the map: it sequences the work and records what every stage settled.

## Conventions

- Files are numbered in the order a new contributor should read them. The map docs were renumbered from 03/04 to 04/05 so that `03-api-contract.md`, written on the backend workstream, keeps its number; nothing else about them changed.
- Each doc states its **Status** near the top (e.g. "working concept," "accepted direction for the hackathon MVP") so it's clear what's settled vs. still open.
- When a later doc narrows a choice the concept doc left open, it says so explicitly and links back, rather than silently duplicating or contradicting it.
