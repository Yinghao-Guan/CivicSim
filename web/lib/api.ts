/**
 * Client for the FastAPI simulation backend.
 *
 * Per doc 02 section 10 the frontend talks to `localhost:8000` directly over
 * CORS — there is no Next.js proxy, and per doc 02 section 8 no simulation
 * runs inside Route Handlers. The backend itself is a later milestone; this
 * file exists so that when it lands, there is one place for its base URL.
 */

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

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { Accept: "application/json" } });
  } catch (cause) {
    throw new ApiError(`Cannot reach the simulation backend at ${API_BASE_URL}`, undefined, {
      cause,
    });
  }
  if (!response.ok) {
    throw new ApiError(`${response.status} from ${path}`, response.status);
  }
  return (await response.json()) as T;
}

/** True when the backend is up. Safe to call before it exists. */
export async function backendReachable(): Promise<boolean> {
  try {
    await apiGet("/health");
    return true;
  } catch {
    return false;
  }
}
