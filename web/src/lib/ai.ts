/**
 * Client for `POST /ai/recommend` (contract section 19).
 *
 * The assistant returns words and one site id. Every number on screen comes
 * from `evidence`, which the backend attaches from the deterministic run — so
 * nothing the model writes can become a figure the audience reads.
 */

import { apiPost } from "./api";
import type { SimulationMetrics } from "./contract";

export type SuggestedAction = "none" | "add_site_b_shade";

export interface SiteEvidence {
  site_id: string;
  name: string;
  metrics: SimulationMetrics;
}

export interface AiRecommendation {
  recommended_site: string;
  summary: string;
  tradeoff: string;
  suggested_action: SuggestedAction | string;
  /** Authoritative metrics for every candidate. Display these, not the prose. */
  evidence: SiteEvidence[];
  model: string;
  /**
   * `live` when the model answered this request, `cached` when it was
   * unreachable and a previously validated reply was served.
   *
   * Cached output must be shown as cached. Evidence is fresh either way.
   */
  source: "live" | "cached" | string;
  /** Capture date for a cached reply; null when live. */
  captured_at: string | null;
}

export function askCivicSim(goal: string): Promise<AiRecommendation> {
  return apiPost<AiRecommendation>("/ai/recommend", { goal });
}

/** One-tap starting points, so the demo never depends on live typing. */
export const GOAL_PRESETS: ReadonlyArray<{ label: string; goal: string }> = [
  {
    label: "Maximize overall access",
    goal: "Reach as many residents as possible overall.",
  },
  {
    label: "Prioritize mobility accessibility",
    goal: "Prioritise mobility-constrained residents; do not leave wheelchair users behind.",
  },
  {
    label: "Reduce heat exposure",
    goal: "Reduce the heat residents are exposed to on the way, while keeping access equitable.",
  },
  {
    label: "Avoid over-capacity options",
    goal: "Avoid sites where modeled demand would exceed the building's capacity.",
  },
];
