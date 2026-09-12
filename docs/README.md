# CivicSim docs

| Doc | What it's for |
| --- | --- |
| [`01-product-concept.md`](./01-product-concept.md) | The full product vision: problem statement, target users, flagship cooling-center scenario, intervention modules, system architecture options, metrics, uncertainty/equity safeguards, roadmap, and research framing. Read this first for *why* CivicSim exists and *what* it should eventually do. |
| [`02-technical-stack-hackathon-mvp.md`](./02-technical-stack-hackathon-mvp.md) | The concrete stack decision for the hackathon build: Next.js + MapLibre/deck.gl on the frontend, FastAPI + NetworkX/GeoPandas on the backend, no database, local-first data. Includes a feasibility assessment and picks one option where doc 01 leaves several open (e.g. MapLibre vs. CesiumJS, no DB vs. PostGIS). Read this for *how* to build the MVP. |

## Reading order

1. Start with `01-product-concept.md` for the problem, users, and end-state vision.
2. Move to `02-technical-stack-hackathon-mvp.md` for the actual hackathon build plan, milestone order, and what to explicitly cut.

## Conventions

- Files are numbered in the order a new contributor should read them.
- Each doc states its **Status** near the top (e.g. "working concept," "accepted direction for the hackathon MVP") so it's clear what's settled vs. still open.
- When a later doc narrows a choice the concept doc left open, it says so explicitly and links back, rather than silently duplicating or contradicting it.
