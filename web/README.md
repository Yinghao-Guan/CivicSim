# CivicSim web

Interactive frontend for the CivicSim neighborhood decision studio.

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

The current UI uses illustrative scenario data and labels it as such. MapLibre loads the OpenFreeMap basemap when available; a local vector fallback preserves the core demo when tiles or WebGL rendering are unavailable.
