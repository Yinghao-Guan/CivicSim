import type { Lens, Objective, SiteId, SiteResult } from "@/lib/experience-types";

export const SITE_NAMES: Record<SiteId, string> = {
  a: "South Park Recreation Center",
  b: "The Beehive",
  c: "Florence Library",
};

export const SITE_RESULTS: Record<SiteId, SiteResult> = {
  a: { population: 11130, vulnerable: 4020, wheelchair: 68, exposure: 15.7, capacity: 64, cost: "$310K" },
  b: { population: 12980, vulnerable: 5340, wheelchair: 82, exposure: 12.9, capacity: 93, cost: "$470K" },
  c: { population: 13410, vulnerable: 5110, wheelchair: 71, exposure: 14.1, capacity: 122, cost: "$390K" },
};

export const RECOMMENDATION_BY_LENS: Record<Lens, SiteId> = { all: "c", heat: "b", mobility: "b" };

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  access: "Maximize total access",
  vulnerability: "Prioritize vulnerable residents",
  balanced: "Balance access + equity",
};

export const LENS_LABELS: Record<Lens, string> = {
  all: "All residents",
  heat: "Heat vulnerable",
  mobility: "Mobility devices",
};

export const SIMULATION_STAGES = [
  "Loading neighborhood graph",
  "Sampling resident journeys",
  "Applying accessibility constraints",
  "Routing agents",
  "Calculating outcomes",
  "Running uncertainty checks",
] as const;
