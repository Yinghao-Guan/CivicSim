# CivicSim — Hackathon API Contract

**Status:** Frozen v1 contract for frontend/backend integration  
**Purpose:** Let the Next.js/MapLibre/deck.gl frontend and FastAPI simulation backend develop independently against the same stable interface.  
**Related docs:** `01-product-concept.md`, `02-technical-stack-hackathon-mvp.md`, `AGENTS.md`

---

## 0. Contract authority

This file does **not** replace the product or technical-stack documents.

It narrows their accepted hackathon direction into the exact interface shared by the frontend and backend.

The contract follows these existing decisions:

- local-first web application;
- frontend at `http://localhost:3000`;
- FastAPI backend at `http://localhost:8000`;
- browser calls FastAPI directly;
- no Next.js API proxy;
- no database for the hackathon MVP;
- local/preprocessed graph, facilities, environmental layers, and synthetic population;
- live simulation performs proposal → graph/destination change → routing → metric aggregation;
- MapLibre renders the city;
- deck.gl renders routes/agents/heat layers;
- Python/FastAPI owns simulation truth.

If this file conflicts with `02-technical-stack-hackathon-mvp.md`, stop and resolve the conflict rather than silently changing either side.

Once frontend implementation depends on this contract, changes require agreement from both workstreams.

---

## 1. Base URL and transport

Backend base URL:

```text
http://localhost:8000
```

Frontend origin:

```text
http://localhost:3000
```

FastAPI must allow CORS from the frontend origin during local development.

All API payloads use JSON.

No authentication is required for the hackathon MVP.

---

## 2. Core API surface

The initial contract intentionally matches the minimal FastAPI surface already selected in `02-technical-stack-hackathon-mvp.md`.

```http
GET  /baseline
POST /simulate
GET  /scenario/{id}
POST /ai/recommend
```

Do not add additional endpoints merely for architectural cleanliness.

An AI/planning endpoint was not part of the original frozen v1 contract. It is now added, additively, as `POST /ai/recommend` (section 19). The endpoints above are unchanged.

AI is a P1 layer and must consume deterministic simulation results rather than replace them.

---

## 3. Shared conventions

### 3.1 Coordinates

Every coordinate sent to the frontend uses GeoJSON/deck.gl order:

```text
[longitude, latitude]
```

Example:

```json
[-118.2914, 34.0128]
```

Never send `[latitude, longitude]`.

### 3.2 IDs

IDs are lowercase strings using underscores.

Canonical cooling-center IDs:

```text
site_a
site_b
site_c
```

Baseline identifier:

```text
baseline
```

Facility IDs and graph edge IDs remain opaque strings, for example:

```text
facility_b
edge_18
edge_103
```

The frontend must not infer meaning by parsing IDs.

### 3.3 Numeric units

- accessibility ratios: `0.0` to `1.0`
- capacity utilization: ratio where values above `1.0` mean over capacity
- travel time: minutes
- heat exposure: modeled minutes
- setup cost: integer USD when shown
- paths: arrays of `[longitude, latitude]`

### 3.4 Stable fields

For successful responses:

- defined object fields should remain present;
- use `[]` for an empty list;
- use `null` when a value is intentionally unavailable;
- do not silently rename fields.

This keeps frontend mock data and live backend data interchangeable.

---

## 4. Candidate site schema

Candidate cooling centers connect the visual building/facility layer to the simulation destination.

```json
{
  "id": "site_b",
  "facility_id": "facility_b",
  "name": "Site B",
  "location": [-118.2914, 34.0128],
  "capacity": 180,
  "estimated_setup_cost": 470000,
  "accessible_entrance": true
}
```

Field definitions:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable scenario-facing site ID |
| `facility_id` | string | Building/facility object linked to the map |
| `name` | string | Human-readable display name |
| `location` | `[number, number]` | `[longitude, latitude]` |
| `capacity` | integer | Demo capacity assumption |
| `estimated_setup_cost` | integer or null | Illustrative/preprocessed USD estimate |
| `accessible_entrance` | boolean | Whether the candidate entrance is modeled accessible |

Cost values may be illustrative for the hackathon and must be presented as estimates rather than official city costs.

---

## 5. `GET /baseline`

### Purpose

Return the canonical current-state simulation plus the three candidate sites needed by the frontend.

The baseline represents access **before adding the proposed new cooling center**.

### Request

```http
GET /baseline
```

No request body.

### Response — `200 OK`

```json
{
  "baseline": {
    "scenario_id": "baseline",
    "selected_site": null,
    "interventions": {
      "shade_segments": []
    },
    "metrics": {
      "population_reached": 8420,
      "heat_vulnerable_reached": 3120,
      "wheelchair_access": 0.61,
      "average_heat_exposure": 18.4,
      "capacity_utilization": null
    },
    "routes": [],
    "unreachable_agents": [],
    "heatmap": [],
    "run": {
      "model_version": "south_la_demo_2026_09",
      "population_version": "demo_pop_1",
      "seed": 24791,
      "agent_count": 500,
      "route_sample_count": 0
    },
    "warnings": []
  },
  "candidates": [
    {
      "id": "site_a",
      "facility_id": "facility_a",
      "name": "Site A",
      "location": [-118.3000, 34.0100],
      "capacity": 180,
      "estimated_setup_cost": 310000,
      "accessible_entrance": true
    },
    {
      "id": "site_b",
      "facility_id": "facility_b",
      "name": "Site B",
      "location": [-118.2914, 34.0128],
      "capacity": 180,
      "estimated_setup_cost": 470000,
      "accessible_entrance": true
    },
    {
      "id": "site_c",
      "facility_id": "facility_c",
      "name": "Site C",
      "location": [-118.2820, 34.0080],
      "capacity": 180,
      "estimated_setup_cost": 390000,
      "accessible_entrance": true
    }
  ]
}
```

The values above are contract examples, not required real-world estimates.

The backend may use different actual demo values as long as the schema and demo invariants remain stable.

---

## 6. `POST /simulate`

### Purpose

Run the actual proposal-dependent simulation for one candidate cooling center and optional shade intervention.

The request shape intentionally follows the accepted technical-stack document.

### Request

```http
POST /simulate
Content-Type: application/json
```

```json
{
  "cooling_center": "site_b",
  "shade_segments": ["edge_18", "edge_19"]
}
```

### Request schema

| Field | Type | Required | Meaning |
| --- | --- | :---: | --- |
| `cooling_center` | string | yes | `site_a`, `site_b`, or `site_c` |
| `shade_segments` | string[] | no | Graph edge IDs receiving the supported shade intervention |

If `shade_segments` is omitted, it behaves as:

```json
[]
```

Do not add frontend-controlled agent count, seed, routing weights, or model parameters to this v1 request. Demo-critical simulation configuration stays controlled by the backend.

### Response — `200 OK`

```json
{
  "scenario_id": "site_b",
  "selected_site": "site_b",
  "interventions": {
    "shade_segments": ["edge_18", "edge_19"]
  },
  "metrics": {
    "population_reached": 12980,
    "heat_vulnerable_reached": 5340,
    "wheelchair_access": 0.82,
    "average_heat_exposure": 12.9,
    "capacity_utilization": 0.93
  },
  "routes": [
    {
      "agent_id": "agent_001",
      "profile": "mobility_constrained",
      "mode": "walk",
      "travel_time": 11.4,
      "heat_exposure": 7.8,
      "path": [
        [-118.2960, 34.0150],
        [-118.2934, 34.0142],
        [-118.2914, 34.0128]
      ]
    }
  ],
  "unreachable_agents": [
    {
      "agent_id": "agent_087",
      "profile": "mobility_constrained",
      "origin": [-118.3050, 34.0050],
      "reason": "accessibility_barrier"
    }
  ],
  "heatmap": [],
  "run": {
    "model_version": "south_la_demo_2026_09",
    "population_version": "demo_pop_1",
    "seed": 24791,
    "agent_count": 500,
    "route_sample_count": 150
  },
  "warnings": [
    "Six curb transitions have unverified accessibility status"
  ]
}
```

`scenario_id` is an opaque server-generated or canonical string. The frontend may display it for debugging but must not derive UI logic by parsing it.

---

## 7. Metrics schema

The hackathon frontend should depend on these five primary metrics.

```json
{
  "population_reached": 12980,
  "heat_vulnerable_reached": 5340,
  "wheelchair_access": 0.82,
  "average_heat_exposure": 12.9,
  "capacity_utilization": 0.93
}
```

### `population_reached`

Modeled/estimated residents able to reach the relevant cooling resource within the demo's 15-minute access threshold.

This may be computed using weighted synthetic agents. It is **not required to equal `agent_count`**.

### `heat_vulnerable_reached`

Modeled/estimated heat-vulnerable residents meeting the same access threshold.

### `wheelchair_access`

Share of the modeled mobility-constrained population with a valid accessible route.

Range:

```text
0.0–1.0
```

### `average_heat_exposure`

Average modeled heat exposure in minutes across relevant reached journeys.

### `capacity_utilization`

Estimated demand divided by modeled site capacity.

Examples:

```text
0.93 = 93% utilization
1.22 = 122% utilization / over capacity
```

Baseline may use `null` when capacity utilization is not meaningfully comparable.

---

## 8. Representative route schema

The backend may simulate hundreds or thousands of agents while returning only a representative subset for animation.

This follows the accepted plan to visualize roughly 150 agents rather than every simulated journey.

```json
{
  "agent_id": "agent_001",
  "profile": "mobility_constrained",
  "mode": "walk",
  "travel_time": 11.4,
  "heat_exposure": 7.8,
  "path": [
    [-118.2960, 34.0150],
    [-118.2934, 34.0142],
    [-118.2914, 34.0128]
  ]
}
```

Fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `agent_id` | string | Synthetic agent identifier |
| `profile` | string | Agent profile used by simulation |
| `mode` | string | `walk` for P0; may later be `transit` without changing this schema |
| `travel_time` | number | Minutes |
| `heat_exposure` | number | Modeled minutes |
| `path` | coordinate[] | Ordered route coordinates |

Supported profile names for the demo:

```text
general
heat_vulnerable
mobility_constrained
transit_dependent
```

**As implemented (2026-09-12):** `path` is drawn along real OpenStreetMap streets (`backend/data/streets.json`, built by `scripts/build_streets.py`). Each modeled edge becomes the shortest street walk between its two node locations; `travel_time`, `heat_exposure` and accessibility still come from the modeled graph, so the drawn line is presentation only.

P0 routing may use walking only. Lightweight/preprocessed transit is a later P1 enhancement; full or real-time transit simulation is out of scope unless explicitly approved.

---

## 9. Unreachable agent schema

Unreachable agents remain visible because they are important to the equity story.

```json
{
  "agent_id": "agent_087",
  "profile": "mobility_constrained",
  "origin": [-118.3050, 34.0050],
  "reason": "accessibility_barrier"
}
```

Recommended reason values:

```text
accessibility_barrier
time_limit
no_route
capacity
```

The frontend should treat unknown future reason strings as displayable text rather than crashing.

---

## 10. Heatmap schema

`heatmap` is retained because it already appears in the accepted minimal response design.

P0 may return:

```json
[]
```

If populated later, use:

```json
[
  {
    "position": [-118.2914, 34.0128],
    "weight": 0.76
  }
]
```

`weight` is normalized for visualization and does not itself represent an official city measurement.

**As implemented (2026-09-12):** the backend populates `heatmap` from the walking graph. Each street segment's weight is its modeled heat exposure divided by its travel time — the share of that walk spent in unshaded heat, 0.0–1.0 — sampled roughly every 40 m along the segment's street-following drawn line. Heat is a property of the neighborhood, so the baseline and every candidate return the same points. The schema is unchanged.

---

## 11. Run metadata

Run metadata supports reproducibility and the assumptions/provenance drawer without requiring a production model-card system.

```json
{
  "model_version": "south_la_demo_2026_09",
  "population_version": "demo_pop_1",
  "seed": 24791,
  "agent_count": 500,
  "route_sample_count": 150
}
```

Rules:

- demo-critical runs should use a deterministic seed;
- `agent_count` is the number of simulated agents, not necessarily the estimated population count;
- `route_sample_count` is the number of representative routes returned to the frontend;
- metrics are computed from the full simulated population, not only returned route samples.

---

## 12. `GET /scenario/{id}`

### Purpose

Retrieve an already available scenario result from local/in-memory state.

This supports frontend comparison without adding a database.

### Request

```http
GET /scenario/site_b
```

### Response — `200 OK`

Return the same simulation-result schema used by `POST /simulate`.

```json
{
  "scenario_id": "site_b",
  "selected_site": "site_b",
  "interventions": {
    "shade_segments": []
  },
  "metrics": {
    "population_reached": 12980,
    "heat_vulnerable_reached": 5340,
    "wheelchair_access": 0.82,
    "average_heat_exposure": 12.9,
    "capacity_utilization": 0.93
  },
  "routes": [],
  "unreachable_agents": [],
  "heatmap": [],
  "run": {
    "model_version": "south_la_demo_2026_09",
    "population_version": "demo_pop_1",
    "seed": 24791,
    "agent_count": 500,
    "route_sample_count": 0
  },
  "warnings": []
}
```

The implementation may preload canonical scenarios or retain results in memory after simulation.

Because the hackathon MVP has no database, dynamically created in-memory scenarios may disappear when FastAPI restarts.

The frontend must not depend on persistent server storage.

---

## 12a. `GET /cooling/nearest` (added 2026-09-12)

Added with agreement from both workstreams for the "click a building" lookup. It is independent of the scenario simulation and changes no existing endpoint.

```http
GET /cooling/nearest?lon=-118.25747&lat=33.9853&limit=3
```

Returns the cooling places (the facilities M1 marked eligible: schools, Slauson Senior Multipurpose Center, Mary McLeod Bethune Swimming Pool — `backend/data/cooling_places.json`) ordered by walking distance along real OpenStreetMap streets.

```json
{
  "origin": [-118.25747, 33.9853],
  "places": [
    {
      "id": "mary_mcleod_bethune_swimming_pool",
      "name": "Mary McLeod Bethune Swimming Pool",
      "facility_type": "sports_centre",
      "location": [-118.25328, 33.98418],
      "walk_metres": 512.4,
      "walk_minutes": 6.1,
      "path": [[-118.25747, 33.9853], [-118.2571, 33.9851]]
    }
  ]
}
```

`walk_minutes` assumes 1.4 m/s. A location outside the demo area returns `400` with code `outside_demo_area`.

---

## 13. Errors

Keep error behavior simple and predictable.

### Invalid candidate or intervention — `400`

```json
{
  "detail": {
    "code": "invalid_scenario",
    "message": "Unknown cooling center 'site_x'."
  }
}
```

### Scenario not found — `404`

```json
{
  "detail": {
    "code": "scenario_not_found",
    "message": "Scenario 'site_x' was not found."
  }
}
```

### Invalid request shape — `422`

FastAPI's standard request-validation response is acceptable.

Do not add a custom global error framework for the hackathon.

The frontend should show a concise user-facing failure state and preserve the last successful visualization.

---

## 14. Required demo invariants

These are product/demo requirements, not arbitrary hard-coded response values.

The purpose-built demo dataset and real routing logic should produce:

```text
Site C total access > Site B total access
Site B wheelchair access > Site C wheelchair access
```

In test form:

```python
assert site_c.metrics.population_reached > site_b.metrics.population_reached
assert site_b.metrics.wheelchair_access > site_c.metrics.wheelchair_access
```

The result must come from the graph, agent constraints, and simulation inputs.

Do not hard-code metric outputs merely to satisfy the invariant.

A supported intervention such as shade should also produce a measurable, proposal-dependent change when applied.

---

## 15. Frontend mocking rules

The frontend may build immediately against static JSON matching this contract.

Recommended mock fixtures:

```text
baseline.json
site_a.json
site_b.json
site_c.json
site_b_shade.json
```

When the real FastAPI backend is ready, integration should require replacing the mock data source with HTTP calls rather than rewriting frontend data handling.

The mock fixtures and backend responses must use the same field names and units.

---

## 16. Contract-change procedure

This contract exists specifically to prevent two-person hackathon integration drift.

Do not silently change:

- endpoints;
- field names;
- field types;
- metric names;
- coordinate order;
- canonical site IDs;
- units;
- route schema.

If a change becomes necessary:

1. identify the concrete blocker;
2. propose the smallest contract change;
3. notify both frontend and backend workstreams;
4. update this file first;
5. update mock fixtures;
6. update backend and frontend;
7. verify integration.

Prefer additive changes over breaking changes.

---

## 17. Explicit non-goals of v1 API

The initial API does not need:

- authentication;
- accounts;
- database persistence;
- WebSockets;
- server-sent events;
- job queues;
- cloud workers;
- production pagination;
- general-purpose scenario CRUD;
- full city-model APIs;
- live traffic;
- live heat forecasts;
- real-time transit;
- computer-vision upload endpoints;
- production optimization endpoints.

Those are product/future architecture concerns, not requirements for the winning hackathon demo.

---

## 18. Integration acceptance check

Frontend/backend integration is considered successful when:

1. `GET /baseline` loads without frontend transformation hacks.
2. Candidate A/B/C locations can be displayed on the map.
3. `POST /simulate` for `site_a`, `site_b`, and `site_c` returns valid results.
4. Returned route paths render correctly using `[longitude, latitude]`.
5. Frontend metrics update directly from the response.
6. Site C wins the total-access comparison.
7. Site B wins the mobility-accessibility comparison.
8. A supported shade intervention changes at least one real metric or route.
9. Backend failure produces a visible frontend error instead of breaking the app.
10. No integration step requires modifying the agreed response schema.

At that point, the core CivicSim demo loop is integration-ready.
---

## 19. `POST /ai/recommend`

**Added after v1, additively.** Sections 1–18 are unchanged; a client that
ignores this endpoint keeps working exactly as before.

### Purpose

Interpret a user's stated priorities and recommend one of the existing
candidate sites, with the tradeoff stated in plain language.

### Trust boundary

The simulation stays the only source of numbers (`AGENTS.md` §8). The model is
given already-computed results and may return only bounded semantic fields: a
site id from the canonical set, two pieces of prose, and one action drawn from
a fixed list. **The response schema has no numeric fields**, so the model
cannot return a metric. The backend attaches the authoritative metrics from the
deterministic run after validating the model's reply.

An unrecognised site or action is rejected, not passed through.

### Request

```json
{ "goal": "reach as many people as possible without leaving wheelchair users behind" }
```

| Field | Type | Required | Meaning |
| --- | --- | :---: | --- |
| `goal` | string | yes | The user's priorities, free text, 1–500 characters |

### Response — `200 OK`

```json
{
  "recommended_site": "site_b",
  "summary": "Site B serves mobility-constrained residents far better...",
  "tradeoff": "It reaches fewer residents overall than Site C.",
  "suggested_action": "add_site_b_shade",
  "evidence": [
    {
      "site_id": "site_a",
      "name": "Site A",
      "metrics": {
        "population_reached": 1300,
        "heat_vulnerable_reached": 400,
        "wheelchair_access": 0.0,
        "average_heat_exposure": 8.54,
        "capacity_utilization": 0.22
      }
    }
  ],
  "model": "gpt-6-astra"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `recommended_site` | string | `site_a`, `site_b` or `site_c` |
| `summary` | string | Why this site fits the stated priorities |
| `tradeoff` | string | What the choice gives up |
| `suggested_action` | string | `none` or `add_site_b_shade` |
| `evidence` | object[] | Authoritative metrics for **every** candidate, from the simulation |
| `model` | string | Model that produced the semantic fields |
| `source` | string | `live` or `cached` (see below) |
| `captured_at` | string or null | Capture date when `source` is `cached`; null when `live` |

`evidence` entries reuse the metrics schema from section 7 unchanged. The
frontend must display numbers from `evidence`, never from `summary` or
`tradeoff`.

`suggested_action` of `add_site_b_shade` is a prompt for the user to run the
existing `POST /simulate` shade flow (section 6). It does not itself change any
scenario, and the AI never produces a simulation result.

### Cached fallback

If the assistant is unreachable and the `goal` matches one of the four preset
goals character for character, the endpoint serves a previously validated
reply from that model instead of failing, with `source` set to `cached` and
`captured_at` set to its capture date.

A cached reply carries the same four semantic fields and **no metric values**.
`evidence` is still computed fresh from the deterministic simulation for that
request, exactly as for a live answer, so displayed numbers are never stale.

A client must show cached output as cached. It must never be presented as a
live model response.

Free text that is not an exact preset goal does **not** fall back. It returns
the error below, because selecting a canned answer for an unseen goal would be
guessing.

### Errors

The assistant is optional. When it is unavailable the rest of the API is
unaffected.

```json
{
  "detail": {
    "code": "ai_unavailable",
    "message": "OPENAI_API_KEY is not set, so Ask CivicSim is unavailable."
  }
}
```

Returned as `503`. Causes include a missing API key, a timeout, a provider
error, or a model refusal. The frontend should show an assistant-only failure
state and leave the simulation UI working.

An empty or overlong `goal` is a standard `422`.
