"use client";

import { ArrowLeft, ArrowRight, Check, CircleDollarSign, Flame, MapPin, Scale, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import Brand from "@/components/experience/Brand";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { OBJECTIVE_LABELS, SITE_NAMES } from "@/data/demo-scenario";
import type { Objective, SiteId } from "@/lib/types";

const objectives: { id: Objective; icon: typeof Users; label: string; note: string }[] = [
  { id: "access", icon: Users, label: "Total access", note: "Reach the most residents" },
  { id: "vulnerability", icon: Flame, label: "Vulnerability", note: "Prioritize highest heat risk" },
  { id: "balanced", icon: Scale, label: "Access + equity", note: "Balance reach and barriers" },
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
        <div className="stage-title"><span>EXPERIMENT / 01</span><strong>COOLING CENTER PLACEMENT</strong></div>
        <div className="step-counter">0{state.setupStep}<span>/ 03</span></div>
      </header>

      <section className="briefing-panel">
        <div className="step-progress">{[1, 2, 3].map((step) => <i className={step <= state.setupStep ? "active" : ""} key={step} />)}</div>
        <AnimatePresence mode="wait">
          {state.setupStep === 1 && (
            <motion.div className="setup-step" key="challenge" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
              <p className="kicker">STEP 01 · CIVIC CHALLENGE</p>
              <h1>One center.<br />Three possible futures.</h1>
              <p>South LA has funding for one new cooling center. Which location serves residents safely—and fairly—during extreme heat?</p>
              <div className="scenario-signal"><Flame size={18} /><div><small>EXTREME HEAT SCENARIO</small><strong>98°F · Tuesday · 2:00 PM</strong></div></div>
            </motion.div>
          )}

          {state.setupStep === 2 && (
            <motion.div className="setup-step" key="priorities" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
              <p className="kicker">STEP 02 · DEFINE PRIORITY</p>
              <h1>What should this city optimize for?</h1>
              <div className="budget-control"><span><CircleDollarSign size={15} /> BUDGET</span><div>{([300, 500, 700] as const).map((value) => <button className={state.budget === value ? "active" : ""} onClick={() => state.setBudget(value)} key={value}>${value}K</button>)}</div></div>
              <div className="objective-list">
                {objectives.map((objective) => {
                  const Icon = objective.icon;
                  return <button className={state.objective === objective.id ? "active" : ""} onClick={() => state.setObjective(objective.id)} key={objective.id}><Icon size={18} /><span><strong>{objective.label}</strong><small>{objective.note}</small></span>{state.objective === objective.id && <Check size={16} />}</button>;
                })}
              </div>
            </motion.div>
          )}

          {state.setupStep === 3 && (
            <motion.div className="setup-step" key="candidates" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
              <p className="kicker">STEP 03 · CANDIDATE SITES</p>
              <h1>Activate the locations to test.</h1>
              <p>The model will route the same synthetic population to every active candidate.</p>
              <div className="candidate-list">
                {(["a", "b", "c"] as SiteId[]).map((site) => <button className={state.candidates.includes(site) ? "active" : ""} onClick={() => toggleCandidate(site)} key={site}><span className="candidate-letter">{site.toUpperCase()}</span><span><strong>{SITE_NAMES[site]}</strong><small>{site === "b" ? "Community venue" : site === "a" ? "Public recreation" : "Public library"}</small></span><i>{state.candidates.includes(site) ? "ACTIVE" : "OFF"}</i></button>)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="setup-actions">
          <button className="back-button" onClick={() => state.setupStep === 1 ? router.push("/") : state.setSetupStep((state.setupStep - 1) as 1 | 2)}><ArrowLeft size={16} /> BACK</button>
          <button className="primary-action" onClick={next}>{state.setupStep === 3 ? "RUN THE CITY" : "CONTINUE"}<ArrowRight size={17} /></button>
        </div>
      </section>

      <div className="setup-context">
        <MapPin size={14} /><span>SOUTH LOS ANGELES</span><i />
        <span>{state.budget}K BUDGET</span><i /><span>{OBJECTIVE_LABELS[state.objective].toUpperCase()}</span>
      </div>
    </main>
  );
}
