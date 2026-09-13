# CivicSim web

Interactive frontend for the CivicSim neighborhood decision studio: Next.js (App Router, TypeScript), a React Three Fiber hero, and MapLibre GL JS with an interleaved deck.gl overlay for the real neighborhood. Next renders the product; the FastAPI backend in `../backend` owns every simulation number.

- `/` — opening hero; its call to action opens `/start`
- `/start` — choose a way in: the City Twin or the Community Board
- `/studio` — the City Twin: the real South Park map, brief, candidates, run, and the results dashboard on live backend data
- `/community/board` — the Community Board: resident street reports from `../scan/web`, served through this app (see below)
- `/lab` — integration workbench: the live map and scenario panel on their own

`/setup`, `/simulate` and `/results` redirect to `/studio`.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
```

The studio needs the backend on `http://localhost:8000` and the Community Board needs the scan app; see the root [`README.md`](../README.md) for starting all four services.

`npm run build` writes to the same `.next/` the dev server uses — stop the dev server first.

## Commands

- `npm run dev` — start the local Next.js development server
- `npm run lint` — run ESLint
- `npm run build` — create and type-check a production build

## Flags

Copy `.env.example` to `.env.local` and edit it. `NEXT_PUBLIC_*` values are inlined at build time, so **restart the dev server** after a change.

| Flag | Default | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_OFFLINE_TILES` | `on` | `off` loads the basemap from the network instead of `public/offline`, for panning beyond the demo area |
| `NEXT_PUBLIC_OCCLUSION_PROBE` | `on` | `off` hides the M4 probe line on `/lab` |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Backend the studio calls |
| `NEXT_PUBLIC_MAX_PIXEL_RATIO` | `2` | Drop to `1.5` if pitched views stutter on a high-DPI display |

## Community Board (multi-zone)

`../scan/web` is a separate Next app with `basePath: "/community"`. This app rewrites `/community/*` to it (`SCAN_WEB_URL`, default `http://localhost:3001`) and `/scan-api/*` to the scan API (`SCAN_API_URL`, default `http://localhost:8001`), so the board, the phone page and both APIs share one origin — and one HTTPS tunnel for phones. Open the board at `http://localhost:3000/community/board`, not on port 3001.

## Demo notes

- Start all four services as described in the root [`README.md`](../README.md).
- The basemap is served offline by default; turn Wi-Fi off and reload `/studio` once to confirm it still draws.
- In the results dashboard, `1`–`3` pick a site and `L` cycles Everyone → Heat-vulnerable → Wheelchair users. The reveal: open on Slauson (most residents), press `L` twice, then follow "Show Mary McLeod Bethune Swimming Pool". With Bethune Pool selected, "Add shade and re-run" and Ask CivicSim follow.

Every number in the studio comes from the backend. The street heat field is the backend's `heatmap` — each segment's modeled heat exposure over its travel time — smoothed for drawing.

## Layout

```text
src/app/                    routes; /lab keeps the map workbench and its own CSS
src/components/scene/       R3F hero
src/components/studio/      StudioScreen (panel flow) and StudioMap (heat-survey map)
src/lib/studio-map.ts       paper restyle of the basemap, white slice, heat field from `heatmap`
src/components/map/         MapView (ssr:false wrapper) -> CityMap (the map itself)
src/components/start/       /start chooser
src/components/panels/      map workbench panels and PlannerCard (Ask CivicSim)
src/lib/cooling.ts, ai.ts   nearest-cooling and Ask CivicSim clients
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

`FadeGroup` fades the sculpture out on entry before the studio map fades in. Narrow layouts place the sculpture below the copy. Reduced motion holds a finished test of the recommended site instead of cycling, and hidden tabs stop rendering. `HeroSceneFallback` preserves the same idea while WebGL loads or is unavailable.
