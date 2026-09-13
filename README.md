# CivicSim

**Test city decisions before they are built.** CivicSim is a participatory urban simulation for South Park, Los Angeles (Council District 9), built at VISION HACK: South LA. It shows how a neighborhood decision plays out — who gains access, who gets left behind, and why — and lets residents feed real street problems back into the same model.

The flagship scenario: the city can fund **one more cooling center**. Where should it go?

## What it does

**City Twin** (`/studio`) — the real South Park map with 4,887 OpenStreetMap buildings and a street-heat field from the model.

- Compares three real candidate sites — Augustus F. Hawkins Natural Park, Mary McLeod Bethune Swimming Pool and Slauson Senior Multipurpose Center — by walking every modeled resident to each one along real streets.
- The reveal: Slauson reaches the most residents (3,240), but only 11% of wheelchair users have an accessible route; switch the population lens and Bethune Pool (89%) becomes the stronger choice.
- Residents can edit a proposal: shade the walk to Bethune Pool and re-run to see heat exposure fall from 2.5 to 1.0 minutes.
- Click any building to see the walk to its nearest cooling centers today.
- **Ask CivicSim**: a planning assistant (OpenAI) that recommends a site for a goal in plain language. It can only cite numbers the simulation computed.

**Community Board** (`/community/board`) — residents photograph a street problem on their phone (`/community`). Gemini reads the photo, the report is placed on the model, and the board shows the recommended fix, the responsible office and — for accessibility or shade problems — what fixing it changes in the simulation. A bike-lane request returns an AI concept rendering of the street.

Every number on screen comes from the deterministic simulation backend; the AI features never invent metrics. The neighborhood graph and population are synthetic and illustrative, and setup costs are estimates, not city figures.

## Architecture

```text
Browser ── http://localhost:3000 ── web/        Next.js 16: hero, /start, /studio (MapLibre + deck.gl)
                │   /community/*  ─────────────► scan/web/   Next.js 15 on :3001 (basePath /community)
                │   /scan-api/*   ─────────────► scan/api/   FastAPI on :8001 (Gemini, reports)
                └── direct calls  ─────────────► backend/    FastAPI on :8000 (simulation, heat, AI planner)
```

Everything is opened through port 3000; it proxies the scan app and its API, so one origin (and one HTTPS tunnel) serves the laptop and phones. The basemap is served from local files, so the demo does not need the internet except for the two AI services.

## Repository

```text
backend/    simulation engine and API: scenarios, shade intervention, street heat, nearest cooling, Ask CivicSim
web/        main web app (see web/README.md)
scan/       resident reporting: scan/api and scan/web (see scan/README.md)
scripts/    data preparation: OSM buildings, offline tiles, streets, cooling places
docs/       product concept, stack, API contract, map rendering, milestone plan (see docs/README.md)
```

## Running it

### Prerequisites (once)

- Node.js 20.9 or newer, [uv](https://docs.astral.sh/uv/) (it installs Python 3.13 for you)
- Optional: `cloudflared` to let phones reach the laptop

```bash
cd backend && uv sync && cd ..
cd scan/api && uv sync && cd ../..
cd web && npm install && cd ..
cd scan/web && npm install && cd ../..
```

### API keys (once, per machine)

Both files are gitignored. Copy the templates and fill them in:

```bash
cp backend/.env.example backend/.env      # OPENAI_API_KEY — Ask CivicSim
cp scan/api/.env.example scan/api/.env    # GEMINI_API_KEY — photo reading and bike-lane concepts
```

Without a key only that AI feature is unavailable; the simulation and the rest of the app still work.

### Start the four services

One terminal each (they are also defined in `.claude/launch.json` as `backend`, `scan-api`, `scan-web` and `web`):

```bash
cd backend   && uv run --env-file .env uvicorn main:app --port 8000
cd scan/api  && uv run uvicorn scan_api.main:app --port 8001
cd scan/web  && npm run dev
cd web       && npm run dev
```

Then open **http://localhost:3000**. Check that these load:

| URL | What you should see |
| --- | --- |
| `http://localhost:3000` | Hero |
| `http://localhost:3000/start` | Choose the City Twin or the Community Board |
| `http://localhost:3000/studio` | Heat map with the scenario panel (a retry panel means `backend` is down) |
| `http://localhost:3000/community/board` | Community Board |
| `http://localhost:3000/community` | Phone reporting page |
| `http://localhost:8001/health` | `"gemini_configured": true` |

The dev servers compile each page on first visit, so open each one once before a demo. After changing a `.env` file, restart that service.

### Phones

```bash
cloudflared tunnel --url http://localhost:3000
```

Open `https://<tunnel>/community` on the phone. To make the board's QR code point at the tunnel while the laptop stays on `localhost`, put `NEXT_PUBLIC_PHONE_URL=https://<tunnel>/community` in `scan/web/.env.local` and restart `scan/web`. Quick-tunnel URLs change every time `cloudflared` restarts.

## Demo shortcuts

- In the City Twin results, `1`–`3` pick a site and `L` cycles Everyone → Heat-vulnerable → Wheelchair users.
- The Community Board opens on a waiting screen and jumps to each new report; older ones are under **Earlier reports**. **Clear all reports** wipes test data.
- On the phone, a missing curb ramp pinned right next to Augustus F. Hawkins Natural Park changes Hawkins' wheelchair access from 0% to 89%.

## Tests

```bash
cd backend && uv run pytest
cd scan/api && uv run pytest
cd web && npm run lint && npm run build
cd scan/web && npm run typecheck
```

## Data and credits

Buildings, streets and facilities © OpenStreetMap contributors (ODbL); basemap tiles from OpenMapTiles / OpenFreeMap. Built with Next.js, React, Three.js, MapLibre GL, deck.gl, FastAPI and NetworkX, with OpenAI and Google Gemini for the AI features.
