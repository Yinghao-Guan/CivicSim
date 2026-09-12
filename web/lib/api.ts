/**
 * Client for the FastAPI simulation backend.
 *
 * Per doc 02 section 10 the frontend talks to `localhost:8000` directly over
 * CORS — there is no Next.js proxy, and per doc 02 section 8 no simulation
 * runs inside Route Handlers.
 *
 * Every endpoint here comes from `docs/03-api-contract.md`; response shapes
 * live in `contract.ts`.
 */

import type {
  BaselineResponse,
  SimulateRequest,
  SimulationResponse,
} from "./contract";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new ApiError(`Cannot reach the simulation backend at ${API_BASE_URL}`, undefined, {
      cause,
    });
  }
  if (!response.ok) {
    // Contract §13 puts a {code, message} object in `detail`; surface the
    // message when it is there rather than only the status code.
    let detail = "";
    try {
      const body = await response.json();
      if (body?.detail?.message) detail = `: ${body.detail.message}`;
    } catch {
      // Not every failure carries a contract-shaped body.
    }
    throw new ApiError(`${response.status} from ${path}${detail}`, response.status);
  }
  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { headers: { Accept: "application/json" } });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Contract §5: current-state access plus the three candidate sites. */
export function fetchBaseline(): Promise<BaselineResponse> {
  return apiGet<BaselineResponse>("/baseline");
}

/** Contract §6: run the simulation for one candidate cooling center. */
export function simulate(request: SimulateRequest): Promise<SimulationResponse> {
  return apiPost<SimulationResponse>("/simulate", request);
}

/** Contract §12: re-read an already-computed scenario. */
export function fetchScenario(scenarioId: string): Promise<SimulationResponse> {
  return apiGet<SimulationResponse>(`/scenario/${encodeURIComponent(scenarioId)}`);
}

/**
 * True when the backend is up. Safe to call before it exists.
 *
 * Probes `/baseline` rather than a health endpoint: the contract defines no
 * `/health`, and inventing one here would mean the frontend depending on a
 * route outside the agreed surface.
 */
export async function backendReachable(): Promise<boolean> {
  try {
    await fetchBaseline();
    return true;
  } catch {
    return false;
  }
}
