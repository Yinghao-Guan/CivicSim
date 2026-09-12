"use client";

import { Check, FastForward } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import Brand from "@/components/experience/Brand";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { SIMULATION_STAGES } from "@/data/demo-scenario";
import { runSimulation } from "@/lib/simulation/client";

export default function SimulationScreen() {
  const router = useRouter();
  const state = useExperience();
  const { setLens, setSimulationStatus, setSimulationStep, setVisualStage } = state;

  useEffect(() => {
    setVisualStage("simulate");
    setSimulationStatus("running");
    setSimulationStep(0);
    router.prefetch("/results");
    let resultSource: "live" | "demo" = "demo";
    void runSimulation({ budget: state.budget, objective: state.objective, lens: state.lens, candidates: state.candidates })
      .then((result) => { resultSource = result.source; });

    const timers = SIMULATION_STAGES.slice(1).map((_, index) => window.setTimeout(() => setSimulationStep(index + 1), (index + 1) * 620));
    const finish = window.setTimeout(() => {
      setLens("all");
      setSimulationStatus(resultSource === "live" ? "complete" : "fallback");
      setVisualStage("results");
      router.push("/results");
    }, 3950);

    return () => { timers.forEach(window.clearTimeout); window.clearTimeout(finish); };
  }, [router, setLens, setSimulationStatus, setSimulationStep, setVisualStage, state.budget, state.candidates, state.lens, state.objective]);

  const skip = () => {
    state.setLens("all");
    state.setSimulationStatus("complete");
    state.setVisualStage("results");
    router.push("/results");
  };

  return (
    <main className="simulation-screen app-stage">
      <header className="stage-header"><Brand compact /><div className="stage-title"><span>Live model run</span><strong>South LA · Extreme heat</strong></div><button className="skip-button" onClick={skip}>Skip <FastForward size={14} /></button></header>
      <div className="simulation-readout">
        <span className="run-number">Run 24791</span>
        <AnimatePresence mode="wait">
          <motion.div key={state.simulationStep} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.28 }}>
            <small>0{state.simulationStep + 1} / 06</small>
            <h1>{SIMULATION_STAGES[state.simulationStep]}</h1>
          </motion.div>
        </AnimatePresence>
        <div className="simulation-progress"><i style={{ width: `${((state.simulationStep + 1) / SIMULATION_STAGES.length) * 100}%` }} /></div>
      </div>
      <ol className="stage-sequence">
        {SIMULATION_STAGES.map((label, index) => <li className={index < state.simulationStep ? "complete" : index === state.simulationStep ? "active" : ""} key={label}><span>{index < state.simulationStep ? <Check size={12} /> : index + 1}</span>{label}</li>)}
      </ol>
      <div className="simulation-stats"><div><small>Residents</small><strong>2,500</strong></div><div><small>Repetitions</small><strong>30</strong></div><div><small>Active sites</small><strong>{state.candidates.length}</strong></div></div>
    </main>
  );
}
