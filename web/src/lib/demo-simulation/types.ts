import type { Lens, Objective, SiteId, SiteResult } from "@/lib/experience-types";

export type SimulationConfig = {
  budget: number;
  objective: Objective;
  lens: Lens;
  candidates: SiteId[];
};

export type SimulationPayload = {
  scenarioId: string;
  source: "live" | "demo";
  sites: Record<SiteId, SiteResult>;
};
