import type { Analysis, Area, Assessment, LngLat, LocationSource, Report, SubmitResult } from "./types";

/** Same-origin proxy to the scan API; see next.config.ts. */
const BASE = "/scan-api";

async function parse<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) {
    let message = `${what} failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail?.message) message = body.detail.message;
    } catch {
      // Not every failure has a JSON body (e.g. the API is not running).
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function fetchArea(): Promise<Area> {
  return parse<Area>(await fetch(`${BASE}/area`), "Loading the neighborhood");
}

export async function analyzePhoto(file: File): Promise<Analysis> {
  const form = new FormData();
  form.append("photo", file);
  return parse<Analysis>(
    await fetch(`${BASE}/analyze`, { method: "POST", body: form }),
    "Analyzing the photo",
  );
}

export async function assessIssue(issueType: string, location: LngLat): Promise<Assessment> {
  return parse<Assessment>(
    await fetch(`${BASE}/assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue_type: issueType, location }),
    }),
    "Assessing the issue",
  );
}

export async function submitReport(body: {
  upload_id: string;
  issue_type: string;
  location: LngLat;
  location_source: LocationSource;
}): Promise<SubmitResult> {
  return parse<SubmitResult>(
    await fetch(`${BASE}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    "Sending the report",
  );
}

export async function fetchReports(): Promise<Report[]> {
  const body = await parse<{ reports: Report[] }>(await fetch(`${BASE}/reports`, { cache: "no-store" }), "Loading reports");
  return body.reports;
}

export async function deleteReport(id: string): Promise<void> {
  await parse<{ deleted: number }>(
    await fetch(`${BASE}/reports/${encodeURIComponent(id)}`, { method: "DELETE" }),
    "Deleting the report",
  );
}

export async function clearReports(): Promise<number> {
  const body = await parse<{ deleted: number }>(await fetch(`${BASE}/reports`, { method: "DELETE" }), "Clearing reports");
  return body.deleted;
}

export function reportPhotoUrl(id: string): string {
  return `${BASE}/reports/${encodeURIComponent(id)}/photo`;
}

export function reportRenderingUrl(id: string): string {
  return `${BASE}/reports/${encodeURIComponent(id)}/rendering`;
}

export function inBounds([lon, lat]: LngLat, [[west, south], [east, north]]: [LngLat, LngLat]) {
  return lon >= west && lon <= east && lat >= south && lat <= north;
}
