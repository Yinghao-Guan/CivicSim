export type SiteId = "a" | "b" | "c";
export type Lens = "all" | "heat" | "mobility";
export type Objective = "access" | "vulnerability" | "balanced";
export type VisualStage = "hero" | "entering" | "setup" | "simulate" | "results";

export type SiteResult = {
  population: number;
  vulnerable: number;
  wheelchair: number;
  exposure: number;
  capacity: number;
  cost: string;
};

export type ScenarioState = {
  budget: 300 | 500 | 700;
  objective: Objective;
  lens: Lens;
  candidates: SiteId[];
  selectedSite: SiteId;
  recommendedSite: SiteId;
  setupStep: 1 | 2 | 3;
  simulationStep: number;
  simulationStatus: "idle" | "running" | "complete" | "fallback";
  visualStage: VisualStage;
};
