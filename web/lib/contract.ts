/**
 * TypeScript mirror of `docs/03-api-contract.md`.
 *
 * This file is a *mirror*, not a design. Field names, types, units and
 * coordinate order come from the contract and must not be changed here to
 * make frontend code more convenient — the contract's §16 exists precisely to
 * stop the two sides drifting. If something needs to change, change the
 * contract first, then the backend, then this file.
 *
 * Kept apart from `types.ts`, which holds our own map-side types, so that the
 * boundary between "agreed with the backend" and "ours to change" stays
 * visible. See `docs/05-map-milestone-plan.md` §11.3.
 *
 * Coordinates are always `[longitude, latitude]`.
 */

export type Coordinate = [number, number];

/** Contract §3: agent profiles the backend may report. */
export type AgentProfile =
  | "general"
  | "heat_vulnerable"
  | "mobility_constrained"
  | "transit_dependent";

/** Contract §9: why an agent could not reach the destination. */
export type UnreachableReason =
  | "accessibility_barrier"
  | "time_limit"
  | "no_route"
  | "capacity";

/** Contract §4. */
export interface CandidateSite {
  id: string;
  facility_id: string;
  name: string;
  location: Coordinate;
  capacity: number;
  estimated_setup_cost: number | null;
  accessible_entrance: boolean;
}

/** Contract §7. `wheelchair_access` is a share in 0..1, not a percentage. */
export interface SimulationMetrics {
  population_reached: number;
  heat_vulnerable_reached: number;
  wheelchair_access: number;
  average_heat_exposure: number;
  capacity_utilization: number | null;
}

/** Contract §8. `path` drops straight into a deck.gl PathLayer. */
export interface AgentRoute {
  agent_id: string;
  profile: AgentProfile | string;
  mode: string;
  travel_time: number;
  heat_exposure: number;
  path: Coordinate[];
}

/** Contract §9. */
export interface UnreachableAgent {
  agent_id: string;
  profile: AgentProfile | string;
  origin: Coordinate;
  reason: UnreachableReason | string;
}

/** Contract §10. Unused in P0, but part of the agreed shape. */
export interface HeatmapPoint {
  position: Coordinate;
  weight: number;
}

/** Contract §11. */
export interface RunMetadata {
  model_version: string;
  population_version: string;
  /**
   * Null when the run consumed no random seed.
   *
   * The demo cohort is enumerated rather than sampled, so the current backend
   * is deterministic without one and reports `null`. A run that does sample
   * must report the seed it used.
   */
  seed: number | null;
  agent_count: number;
  route_sample_count: number;
}

/** Contract §6 and §12: the shared result shape. */
export interface SimulationResponse {
  scenario_id: string;
  selected_site: string | null;
  interventions: {
    shade_segments: string[];
  };
  metrics: SimulationMetrics;
  routes: AgentRoute[];
  unreachable_agents: UnreachableAgent[];
  heatmap: HeatmapPoint[];
  run: RunMetadata;
  warnings: string[];
}

/** Contract §5. */
export interface BaselineResponse {
  baseline: SimulationResponse;
  candidates: CandidateSite[];
}

/** Contract §6. Agent count, seed and routing weights stay backend-owned. */
export interface SimulateRequest {
  cooling_center: string;
  shade_segments?: string[];
}

/** Contract §13: the body of `detail` in a 400 or 404. */
export interface ApiErrorDetail {
  code: string;
  message: string;
}
