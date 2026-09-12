"use client";

import { ArrowLeft, ArrowRight, Flame, MapPin } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import Brand from "@/components/experience/Brand";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { OBJECTIVE_LABELS, SITE_NAMES } from "@/data/demo-scenario";
import type { Objective, SiteId } from "@/lib/types";

const objectives: { id: Objective; label: string; note: string }[] = [
  { id: "access", label: "Total access", note: "Reach the most residents" },
  { id: "vulnerability", label: "Heat vulnerability", note: "Prioritize residents at highest risk" },
  { id: "balanced", label: "Access and equity", note: "Balance reach with route barriers" },
];

export default function SetupScreen() {
  const router = useRouter();
  const state = useExperience();
  const setVisualStage = state.setVisualStage;

  useEffect(() => {
    setVisualStage("setup");
    router.prefetch("/simulate");
  }, [router, setVisualStage]);

  const toggleCandidate = (site: SiteId) => {
    if (state.candidates.includes(site)) {
      if (state.candidates.length > 1) state.setCandidates(state.candidates.filter((value) => value !== site));
    } else state.setCandidates([...state.candidates, site]);
  };

  const next = () => {
    if (state.setupStep < 3) state.setSetupStep((state.setupStep + 1) as 2 | 3);
    else {
      state.setSimulationStatus("running");
      state.setVisualStage("simulate");
      router.push("/simulate");
    }
  };

  return (
    <main className="setup-screen app-stage">
      <header className="stage-header">
        <Brand compact />
        <div className="stage-title"><span>Scenario 01</span><strong>Cooling center placement</strong></div>
        <div className="step-counter">{state.setupStep}<span> / 3</span></div>
      </header>

      <section className="briefing-panel">
        <div className="step-progress" aria-label="Scenario progress">
          {(["Challenge", "Priority", "Sites"] as const).map((label, index) => {
            const step = (index + 1) as 1 | 2 | 3;
            return (
              <button
                className={step === state.setupStep ? "current" : step < state.setupStep ? "complete" : ""}
                disabled={step > state.setupStep}
                onClick={() => state.setSetupStep(step)}
                key={label}
              >
                <i />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        <AnimatePresence mode="wait">
          {state.setupStep === 1 && (
            <motion.div className="setup-step" key="challenge" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
              <p className="kicker">Step 1 · Civic challenge</p>
              <h1>One center.<br />Three possible futures.</h1>
              <p>South LA has funding for one new cooling center. Which location serves residents safely—and fairly—during extreme heat?</p>
              <div className="scenario-signal"><Flame size={18} /><div><small>Extreme heat scenario</small><strong>98°F · Tuesday · 2:00 PM</strong></div></div>
            </motion.div>
          )}

          {state.setupStep === 2 && (
            <motion.div className="setup-step" key="priorities" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
              <p className="kicker">Step 2 · Define the priority</p>
              <h1>What should this city optimize for?</h1>
              <div className="budget-control"><span>Available budget</span><div>{([300, 500, 700] as const).map((value) => <button className={state.budget === value ? "active" : ""} onClick={() => state.setBudget(value)} key={value}>${value}K</button>)}</div></div>
              <div className="objective-list">
                {objectives.map((objective) => {
                  return <button className={state.objective === objective.id ? "active" : ""} onClick={() => state.setObjective(objective.id)} key={objective.id}><span><strong>{objective.label}</strong><small>{objective.note}</small></span><i>{state.objective === objective.id ? "Selected" : "Select"}</i></button>;
                })}
              </div>
            </motion.div>
          )}

          {state.setupStep === 3 && (
            <motion.div className="setup-step" key="candidates" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
              <p className="kicker">Step 3 · Candidate sites</p>
              <h1>Activate the locations to test.</h1>
              <p>The model will route the same synthetic population to every active candidate.</p>
              <div className="candidate-list">
                {(["a", "b", "c"] as SiteId[]).map((site) => <button className={state.candidates.includes(site) ? "active" : ""} onClick={() => toggleCandidate(site)} key={site}><span className="candidate-letter">{site.toUpperCase()}</span><span><strong>{SITE_NAMES[site]}</strong><small>{site === "b" ? "Community venue" : site === "a" ? "Public recreation" : "Public library"}</small></span><i>{state.candidates.includes(site) ? "Included" : "Excluded"}</i></button>)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="setup-actions">
          <button className="back-button" onClick={() => state.setupStep === 1 ? router.push("/") : state.setSetupStep((state.setupStep - 1) as 1 | 2)}><ArrowLeft size={16} /> Back</button>
          <button className="primary-action" onClick={next}>{state.setupStep === 3 ? "Run simulation" : "Continue"}<ArrowRight size={17} /></button>
        </div>
      </section>

      <div className="setup-context">
        <MapPin size={14} /><span>South Los Angeles</span><i />
        <span>${state.budget}K budget</span><i /><span>{OBJECTIVE_LABELS[state.objective]}</span>
      </div>
    </main>
  );
}
