# CivicSim web

Interactive frontend for the CivicSim neighborhood decision studio. The experience is organized as four stages sharing one persistent WebGL canvas:

- `/` — opening hero
- `/setup` — guided experiment briefing
- `/simulate` — live simulation choreography
- `/results` — living comparison workspace

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

- `npm run dev` — start the local Next.js development server
- `npm run lint` — run ESLint
- `npm run build` — create and type-check a production build

The current UI uses illustrative scenario data and labels it as such. It attempts to call `http://localhost:8000/simulate` (override with `NEXT_PUBLIC_SIM_API_URL`) and falls back to a fixed, precomputed demo run after 1.5 seconds. The procedural Three.js city and its SVG fallback are local, so the core presentation does not depend on network tiles.

## Hero visual

The homepage pairs a flowing street network with a floating neighborhood sculpture that acts out the product in miniature. `FlowingCityGrid` draws street lines, junctions, traveling points, and sparse ground faces in four GPU draw calls. `NeighborhoodSculpture` cycles through the scenario's three candidate lots (A, B, C): a pin moves to each lot, a facility rises, a walking-reach ring expands, buildings inside it sharpen, residents walk to the site along streets, the heat map cools inside the ring, and homes left outside are marked in ink. Colors come from `HERO_PALETTE`: paper and graphite, a thermal ramp for heat, and a single vermilion mark for the decision. `BuiltWithLoop` credits the event and stack below the call to action. The caption under the sculpture follows the site being tested via `heroSiteCycle`. Everything is authored geometry, not a downloaded or geographically accurate city model.

`FadeGroup` fades the sculpture out on entry and fades the scenario city in on `/setup`. Narrow layouts place the sculpture below the copy. Reduced motion holds a finished test of the recommended site instead of cycling, and hidden tabs stop rendering. `HeroSceneFallback` preserves the same idea while WebGL loads or is unavailable.
