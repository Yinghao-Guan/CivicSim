import { SITE_RESULTS } from "@/data/demo-scenario";
import type { SimulationConfig, SimulationPayload } from "@/lib/demo-simulation/types";

export async function runDemoSimulation(config: SimulationConfig): Promise<SimulationPayload> {
  void config;
  return { scenarioId: "south-la-cooling-demo", source: "demo", sites: SITE_RESULTS };
}
