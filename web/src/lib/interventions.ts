/**
 * The one intervention the demo supports: shade over the walk to Site B.
 *
 * These edge ids are opaque handles agreed with the backend, which validates
 * them against its own allow-list and rejects anything else. The contract says
 * the frontend must not infer meaning by parsing an id (§3.2), so they are
 * listed here as constants and never taken apart.
 *
 * Nothing about the result is predicted here. The button sends these ids, the
 * backend re-runs the simulation over a shaded copy of the graph, and the
 * panel shows whatever comes back.
 */

/** The site whose approach can be shaded. */
export const SHADE_SITE_ID = "site_b";

/** The streets residents walk to reach Site B. */
export const SITE_B_APPROACH_SEGMENTS = [
  "edge_01",
  "edge_02",
  "edge_03",
  "edge_05",
] as const;

/** Human-readable label for what the segments above cover. */
export const SHADE_LABEL = "shade over the approach streets";
