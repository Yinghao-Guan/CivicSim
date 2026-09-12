import { runDemoSimulation } from "@/lib/simulation/demo-client";
import { runFastApiSimulation } from "@/lib/simulation/fastapi-client";
import type { SimulationConfig, SimulationPayload } from "@/lib/simulation/types";

export async function runSimulation(config: SimulationConfig): Promise<SimulationPayload> {
  try {
    return await runFastApiSimulation(config);
  } catch {
    return runDemoSimulation(config);
  }
}
