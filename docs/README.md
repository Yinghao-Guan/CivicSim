# CivicSim docs

| Doc | What it's for |
| --- | --- |
| [`01-product-concept.md`](./01-product-concept.md) | The full product vision: problem statement, target users, flagship cooling-center scenario, intervention modules, system architecture options, metrics, uncertainty/equity safeguards, roadmap, and research framing. Read this first for *why* CivicSim exists and *what* it should eventually do. |
| [`02-technical-stack-hackathon-mvp.md`](./02-technical-stack-hackathon-mvp.md) | The concrete stack decision for the hackathon build: Next.js + MapLibre/deck.gl on the frontend, FastAPI + NetworkX/GeoPandas on the backend, no database, local-first data. Includes a feasibility assessment and picks one option where doc 01 leaves several open (e.g. MapLibre vs. CesiumJS, no DB vs. PostGIS). Read this for *how* to build the MVP. |
| [`03-map-rendering-and-demo-area.md`](./03-map-rendering-and-demo-area.md) | Decisions for the `map` milestone: the three-layer 2.5D rendering approach (context basemap, clickable local demo slice, interleaved deck.gl simulation layer), the demo area (around The Beehive in CD 9, expanding to CD 8/9/10 if time allows), confirmed VISION HACK: South LA event context, and hardware/performance notes. Read this before working on the map. |
| [`04-map-milestone-plan.md`](./04-map-milestone-plan.md) | The execution plan for the `map` milestone: stages M0-M5 with deliverables and done-criteria, cross-platform conventions, and the recorded M0 results (venue, council district, bounding box, building-height coverage). Read this when actually building the map. |

## Reading order

1. Start with `01-product-concept.md` for the problem, users, and end-state vision.
2. Move to `02-technical-stack-hackathon-mvp.md` for the actual hackathon build plan, milestone order, and what to explicitly cut.
3. Read `03-map-rendering-and-demo-area.md` before working on the map: rendering layers, demo area, and performance.
4. Follow `04-map-milestone-plan.md` while building the map: it sequences the work and records what M0 settled.

## Conventions

- Files are numbered in the order a new contributor should read them.
- Each doc states its **Status** near the top (e.g. "working concept," "accepted direction for the hackathon MVP") so it's clear what's settled vs. still open.
- When a later doc narrows a choice the concept doc left open, it says so explicitly and links back, rather than silently duplicating or contradicting it.
