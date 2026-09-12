import { runDemoSimulation } from "@/lib/demo-simulation/demo-client";
import { runFastApiSimulation } from "@/lib/demo-simulation/fastapi-client";
import type { SimulationConfig, SimulationPayload } from "@/lib/demo-simulation/types";

export async function runSimulation(config: SimulationConfig): Promise<SimulationPayload> {
  try {
    return await runFastApiSimulation(config);
  } catch {
    return runDemoSimulation(config);
  }
}
