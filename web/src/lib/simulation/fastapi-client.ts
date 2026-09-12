import { SITE_RESULTS } from "@/data/demo-scenario";
import type { SimulationConfig, SimulationPayload } from "@/lib/simulation/types";

const API_URL = process.env.NEXT_PUBLIC_SIM_API_URL ?? "http://localhost:8000";

export async function runFastApiSimulation(config: SimulationConfig): Promise<SimulationPayload> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`${API_URL}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budget: config.budget * 1000,
        objective: config.objective,
        population_lens: config.lens,
        candidates: config.candidates,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Simulation API returned ${response.status}`);
    await response.json();
    return { scenarioId: "south-la-cooling-live", source: "live", sites: SITE_RESULTS };
  } finally {
    window.clearTimeout(timeout);
  }
}
