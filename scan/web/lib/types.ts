/** Mirrors scan/api/scan_api/main.py responses. Coordinates are [lon, lat]. */

export type LngLat = [number, number];
export type Severity = "low" | "medium" | "high";
export type Intervention = "shade" | "accessibility_repair" | null;

export interface AreaSegment {
  edge_id: string;
  path: LngLat[];
  wheelchair_accessible: boolean;
}

export interface Area {
  bounds: [LngLat, LngLat];
  center: LngLat;
  venue: { name: string; location: LngLat };
  segments: AreaSegment[];
  sites: { id: string; name: string; location: LngLat }[];
  issue_types: { id: string; label: string; intervention: Intervention; kind: "issue" | "request" }[];
}

export interface DetectedIssue {
  type: string;
  severity: Severity;
  confidence: number;
  summary: string;
}

export interface Analysis {
  upload_id: string;
  photo: { width: number; height: number };
  exif_location: LngLat | null;
  exif_in_area: boolean | null;
  detection: {
    is_street_scene: boolean;
    scene: string;
    issues: DetectedIssue[];
    model: string;
  } | null;
  detection_error: string | null;
}

export interface Metrics {
  population_reached: number;
  heat_vulnerable_reached: number;
  wheelchair_access: number;
  average_heat_exposure: number;
  capacity_utilization: number | null;
}

export interface RoutePath {
  agent_id: string;
  profile: string;
  path: LngLat[];
}

export interface Assessment {
  status: "outside_area" | "modeled" | "not_modeled";
  location: LngLat;
  issue: { id: string; label: string; fix: string; agency: string; intervention: Intervention };
  segment: {
    edge_id: string;
    path: LngLat[];
    distance_m: number;
    wheelchair_accessible: boolean;
    heat_exposure: number;
  } | null;
  change: { kind: string; edge_id: string; changed: boolean; description: string } | null;
  scenarios: { scenario_id: string; label: string; before: Metrics; after: Metrics }[];
  headline: {
    scenario_id: string;
    label: string;
    metric: keyof Metrics;
    before: number;
    after: number;
  } | null;
  routes: { scenario_id: string; before: RoutePath[]; after: RoutePath[] } | null;
  warnings: string[];
}

export type LocationSource = "exif" | "device" | "manual";

export interface SubmitResult {
  id: string;
  status: Assessment["status"];
  created_at: string;
}

export interface Report {
  id: string;
  created_at: string;
  location: LngLat;
  location_source: LocationSource;
  issue_type: string;
  /** The model's finding for the confirmed type; null when picked by hand. */
  detected: DetectedIssue | null;
  scene: string | null;
  model: string | null;
  assessment: Assessment;
  /** Present for requests (a bike lane): filled in by a background job. */
  proposal: Proposal | null;
}

export interface Effect {
  group: string;
  effect: string;
}

export interface StreetAnalysis {
  is_street: boolean;
  street_summary: string;
  travel_lanes: number | null;
  has_street_parking: boolean | null;
  existing_bike_facility: string;
  recommended_design: string;
  design_label: string;
  design_rationale: string;
  space_source: string;
  space_source_label: string;
  side_of_street: string;
  benefits: Effect[];
  tradeoffs: Effect[];
  open_questions: string[];
  model: string;
}

export interface Proposal {
  state: "queued" | "analyzing" | "rendering" | "done" | "error";
  error?: string;
  analysis?: StreetAnalysis;
  rendering?: { model: string } | null;
  rendering_error?: string | null;
}
