# CivicSim web

Interactive frontend for the CivicSim neighborhood decision studio: Next.js (App Router, TypeScript), a React Three Fiber hero, and MapLibre GL JS with an interleaved deck.gl overlay for the real neighborhood. Next renders the product; the FastAPI backend in `../backend` owns every simulation number.

- `/` — opening hero
- `/setup` — guided experiment briefing
- `/simulate` — live simulation choreography
- `/results` — living comparison workspace
- `/lab` — integration workbench: the live map and scenario panel on their own

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
```

Start the backend for live results (`cd ../backend && uv run uvicorn main:app --reload`; it serves `http://localhost:8000`).

`npm run build` writes to the same `.next/` the dev server uses — stop the dev server first.

## Commands

- `npm run dev` — start the local Next.js development server
- `npm run lint` — run ESLint
- `npm run build` — create and type-check a production build

## Flags

Copy `.env.example` to `.env.local` and edit it. `NEXT_PUBLIC_*` values are inlined at build time, so **restart the dev server** after a change.

| Flag | Default | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_OFFLINE_TILES` | `off` | `on` serves the basemap from `public/offline` instead of the network |
| `NEXT_PUBLIC_OCCLUSION_PROBE` | `on` | `off` hides the M4 probe line |
| `NEXT_PUBLIC_MAX_PIXEL_RATIO` | `2` | Drop to `1.5` if pitched views stutter on a high-DPI display |

For demo day, follow the runbook in [`../docs/05-map-milestone-plan.md`](../docs/05-map-milestone-plan.md) §8.4 — the step that matters is turning Wi-Fi **off** and reloading.

## Layout

```text
src/app/                    routes; /lab keeps the map workbench and its own CSS
src/components/scene/       R3F hero and scenario twin
src/components/map/         MapView (ssr:false wrapper) -> CityMap (the map itself)
src/components/panels/      map workbench panels
src/lib/api.ts, contract.ts FastAPI client and a mirror of docs/03-api-contract.md
src/lib/useScenarios.ts     fetches, caches and selects backend scenarios
src/lib/map*.ts, simulation.ts  basemap style, slice layers, deck.gl overlay
src/lib/demoArea.generated.ts   GENERATED — edit scripts/demo_area.py instead
public/data/                generated artifacts the browser fetches
public/offline/             offline basemap package (42 tiles + glyphs)
```

## Two rules that are easy to get wrong

- **MapLibre and deck.gl are browser-only.** Map components need `"use client"` and must be reached through `MapView`, which loads them with `dynamic(..., { ssr: false })`. See doc 04 §2.3.5.
- **`src/lib/demoArea.generated.ts` is generated.** The demo area is defined once in `scripts/demo_area.py`; run `python scripts/build_buildings.py` to regenerate.

## Hero visual

The homepage pairs a flowing street network with a floating neighborhood sculpture that acts out the product in miniature. `FlowingCityGrid` draws street lines, junctions, traveling points, and sparse ground faces in four GPU draw calls. `NeighborhoodSculpture` cycles through the scenario's three candidate lots (A, B, C): a pin moves to each lot, a facility rises, a walking-reach ring expands, buildings inside it sharpen, residents walk to the site along streets, the heat map cools inside the ring, and homes left outside are marked in ink. Colors come from `HERO_PALETTE`: paper and graphite, a thermal ramp for heat, and a single vermilion mark for the decision. `BuiltWithLoop` credits the event and stack below the call to action. The caption under the sculpture follows the site being tested via `heroSiteCycle`. Everything is authored geometry, not a downloaded or geographically accurate city model.

`FadeGroup` fades the sculpture out on entry and fades the scenario city in on `/setup`. Narrow layouts place the sculpture below the copy. Reduced motion holds a finished test of the recommended site instead of cycling, and hidden tabs stop rendering. `HeroSceneFallback` preserves the same idea while WebGL loads or is unavailable.
