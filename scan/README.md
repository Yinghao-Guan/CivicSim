# CivicSim Scan (experimental)

Photograph a street issue → locate it → detect what's wrong → show the fix and
what fixing it changes in the neighborhood model.

**Isolation rule:** everything lives in `scan/`. Nothing outside it is edited,
and the main app (`web/`, `backend/`) does not know this exists. To drop the
feature, delete `scan/`.

```
scan/api   FastAPI on :8001   photo → EXIF GPS + Gemini detection; issue + location → fix + modeled impact
scan/web   Next.js on :3001   /community        phone: Photo → Location → Issue → Submit
                              /community/board  desktop: live list of reports with fix + modeled impact
```

The phone never shows the impact. Submitting stores the report (JSON + photo in
`scan/api/.reports/`, gitignored, survives restarts) with its assessment
computed at submit time; `/board` polls every 2.5 s and jumps to new arrivals.

`scan/api` imports `backend/`'s simulation engine read-only (graph, cohort,
routing, metrics), so impact numbers come from the same code the demo runs.
`scan/web/public/offline` is a symlink to `web/public/offline` (basemap tiles).

## Run

```bash
cd scan/api
cp .env.example .env        # put GEMINI_API_KEY in it
uv sync
uv run uvicorn scan_api.main:app --port 8001
```

```bash
cd scan/web
npm install
npm run dev                 # http://localhost:3001
```

Without a Gemini key everything still works except automatic detection: the
Issue step falls back to picking the type by hand.

### Inside the main app

`scan/web` has `basePath: "/community"`. The main web app on :3000 proxies
`/community/*` to it and `/scan-api/*` to the API, so the studio and the board
share one origin: the studio's chooser links straight to `/community/board`.

### On a phone

Geolocation ("Use my current location") only works over HTTPS. Tunnel the web
app; the API is proxied through it at `/scan-api`, so one tunnel is enough:

```bash
cloudflared tunnel --url http://localhost:3000
```

Open `https://<tunnel>/community/board` on the laptop, or keep the laptop on
`http://localhost:3000` and set `NEXT_PUBLIC_PHONE_URL=https://<tunnel>/community`
in `scan/web/.env.local` (restart `scan/web`) so the board's QR code still points
phones at the tunnel. Its QR code points phones at the
same tunnel, so the audience can scan it straight off the screen. "Clear all
reports" at the bottom of the board wipes test data before a demo.

Note: iOS Safari and Android's photo picker usually strip GPS from uploads, so
expect the manual pin / current-location path on phones. Photos uploaded from
a laptop keep their EXIF.

## How impact works

| Issue types | Modeled change | Numbers |
| --- | --- | --- |
| `lack_of_shade` | `apply_shade` on the nearest modeled segment | re-run baseline + sites A/B/C |
| `sidewalk_damage`, `missing_curb_ramp`, `sidewalk_obstruction` | nearest segment becomes wheelchair-passable | re-run baseline + sites A/B/C |
| everything else | none | fix + responsible office only, labeled "not simulated" |

Good demo spots (the synthetic graph's barriers):

- `edge_07`, the stepped crossing between the middle and east clusters → Site C
  wheelchair access 11% → 37%.
- `edge_04`, Site A's stepped entrance → Site A wheelchair access 0% → 89%.
- `edge_03`, the street into Site B → shade lowers Site B's average heat exposure.

## Requests: "Add a bike lane"

On the phone's Issue step, **Add a bike lane** is offered as a request rather
than a detected problem. Submitting it queues a background job
(`scan_api/proposal.py`):

1. `GEMINI_MODEL` reads the street from the photo (lanes, parking, existing
   facility) and picks a design from a fixed list (protected / buffered /
   painted / greenway), where the space comes from, who gains, what it trades
   off, and what to check on site.
2. `GEMINI_IMAGE_MODEL` (default `gemini-3.1-flash-image`) edits the photo into
   a concept rendering at the photo's aspect ratio.

The board shows a draggable Today/Concept wipe plus the design and tradeoffs,
labeled as an AI reading of one photo. The simulation has no cycling mode, so
no modeled numbers are shown. End to end takes ~15-20 s.

## Tests

```bash
cd scan/api && uv run pytest
cd scan/web && npm run typecheck
```

## If we integrate

1. Move the accessibility-repair intervention into `backend/simulation/interventions.py`
   and extend the API contract (`docs/03-api-contract.md`) with it.
2. Move the page into `web/app/scan/` and reuse `web/lib/mapStyle.ts`.
3. Show reported issues as a layer on the main map, each linking to its re-run scenario.
