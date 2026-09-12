# CivicSim web

Interactive frontend for the CivicSim neighborhood decision studio: Next.js (App Router, TypeScript), a React Three Fiber hero, and MapLibre GL JS with an interleaved deck.gl overlay for the real neighborhood. Next renders the product; the FastAPI backend in `../backend` owns every simulation number.

- `/` — opening hero
- `/studio` — the real South Park map: brief, candidates, run, and the results dashboard on live backend data
- `/community/board` — resident reports (the scan app in `../scan/web`, proxied as a zone; its phone page is `/community`)
- `/lab` — integration workbench: the live map and scenario panel on their own

`/setup`, `/simulate` and `/results` redirect to `/studio`.

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

## Demo day

1. `cd backend && uv run uvicorn main:app --port 8000` — the studio shows a retry panel until it answers.
   For resident reports also run `cd scan/api && uv run uvicorn scan_api.main:app --port 8001` and `cd scan/web && npm run dev` (port 3001). This app proxies `/community/*` to 3001 and `/scan-api/*` to 8001; override with `SCAN_WEB_URL` / `SCAN_API_URL`.
2. In `web/`, set `NEXT_PUBLIC_OFFLINE_TILES=on` in `.env.local`, then `npm run build && npm start` (or `npm run dev`).
3. Turn Wi-Fi off and reload `/studio` once to confirm the basemap still draws.
4. In the results dashboard, `1`–`3` pick a site and `L` cycles Everyone → Heat-vulnerable → Wheelchair users. The reveal: open on Slauson (most residents), press `L` twice, then follow "Show Mary McLeod Bethune Swimming Pool".

Every number in the studio comes from the backend. The street heat field is the backend's `heatmap` — each segment's modeled heat exposure over its travel time — smoothed for drawing.

## Layout

```text
src/app/                    routes; /lab keeps the map workbench and its own CSS
src/components/scene/       R3F hero
src/components/studio/      StudioScreen (panel flow) and StudioMap (heat-survey map)
src/lib/studio-map.ts       paper restyle of the basemap, white slice, heat field from `heatmap`
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

`FadeGroup` fades the sculpture out on entry before the studio map fades in. Narrow layouts place the sculpture below the copy. Reduced motion holds a finished test of the recommended site instead of cycling, and hidden tabs stop rendering. `HeroSceneFallback` preserves the same idea while WebGL loads or is unavailable.
