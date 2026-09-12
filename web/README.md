# CivicSim — web

The frontend: Next.js (App Router, TypeScript) + MapLibre GL JS, with deck.gl
arriving in M4. Next renders the product; it never runs the simulation
(doc 02 §8).

```bash
npm install
npm run dev        # http://localhost:3000
```

`npm run build` writes to the same `.next/` the dev server uses — stop the dev
server first, or it will start throwing `ENOENT … _buildManifest.js.tmp`.

## Flags

Copy `.env.example` to `.env.local` and edit it. `NEXT_PUBLIC_*` values are
inlined at build time, so **restart the dev server** after a change.

| Flag | Default | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_OFFLINE_TILES` | `off` | `on` serves the basemap from `public/offline` instead of the network |
| `NEXT_PUBLIC_OCCLUSION_PROBE` | `on` | `off` hides the M4 probe line |
| `NEXT_PUBLIC_MAX_PIXEL_RATIO` | `2` | Drop to `1.5` if pitched views stutter on a high-DPI display |

For demo day, follow the runbook in [`../docs/04-map-milestone-plan.md`](../docs/04-map-milestone-plan.md) §8.4 —
the step that matters is turning Wi-Fi **off** and reloading.

## Layout

```text
app/                    shell: layout, page, global CSS
components/map/         MapView (ssr:false wrapper) -> CityMap (the map itself)
lib/palette.ts          doc 02 §6 palette; globals.css mirrors it for the UI
lib/mapStyle.ts         layer ① — hand-written context basemap style
lib/map.ts              camera, venue annotation; layer ② source seam lands in M3
lib/types.ts            BuildingProperties, mirroring the M1 script's output
lib/api.ts              FastAPI client seam (backend is a later milestone)
lib/demoArea.generated.ts   GENERATED — edit scripts/demo_area.py instead
public/data/            generated artifacts the browser fetches
public/offline/         offline basemap package (42 tiles + glyphs)
```

## Two rules that are easy to get wrong

- **MapLibre and deck.gl are browser-only.** Map components need `"use client"`
  and must be reached through `MapView`, which loads them with
  `dynamic(..., { ssr: false })`. See doc 03 §2.3.5.
- **`lib/demoArea.generated.ts` is generated.** The demo area is defined once in
  `scripts/demo_area.py`; run `python scripts/build_buildings.py` to regenerate.

The three-layer rendering approach, the demo area, and the milestone plan are in
[`../docs`](../docs) — start with `04-map-milestone-plan.md`.
