# CivicSim web

Interactive frontend for the CivicSim neighborhood decision studio. The experience is organized as four cinematic stages backed by one persistent procedural city twin:

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
