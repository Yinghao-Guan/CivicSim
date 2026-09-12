"use client";

import { Accessibility, AlertTriangle, ArrowRight, Flame, Info, RotateCcw, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import Brand from "@/components/experience/Brand";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { LENS_LABELS, OBJECTIVE_LABELS, SITE_NAMES, SITE_RESULTS } from "@/data/demo-scenario";
import type { Lens, SiteId } from "@/lib/experience-types";

const lenses: { id: Lens; label: string; icon: typeof Users }[] = [
  { id: "all", label: "All residents", icon: Users },
  { id: "heat", label: "Heat vulnerable", icon: Flame },
  { id: "mobility", label: "Mobility devices", icon: Accessibility },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function ResultsScreen() {
  const router = useRouter();
  const state = useExperience();
  const [revealKey, setRevealKey] = useState(0);
  const [showMethod, setShowMethod] = useState(false);
  const result = SITE_RESULTS[state.selectedSite];
  const mobility = state.lens === "mobility";
  const { setLens, setSelectedSite, setSimulationStatus, setVisualStage } = state;

  const changeLens = useCallback((lens: Lens) => {
    if (lens === state.lens) return;
    setLens(lens);
    setRevealKey((value) => value + 1);
  }, [setLens, state.lens]);

  useEffect(() => {
    setVisualStage("results");
    if (state.simulationStatus === "idle") setSimulationStatus("fallback");

    const handleKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "l") changeLens(state.lens === "mobility" ? "all" : "mobility");
      if (["1", "2", "3"].includes(event.key)) setSelectedSite(({ "1": "a", "2": "b", "3": "c" } as const)[event.key as "1" | "2" | "3"]);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [changeLens, setSelectedSite, setSimulationStatus, setVisualStage, state.lens, state.simulationStatus]);

  const resetDemo = () => {
    state.reset();
    router.push("/");
  };

  const primaryMetric = state.lens === "mobility" ? `${result.wheelchair}%` : state.lens === "heat" ? formatNumber(result.vulnerable) : formatNumber(result.population);
  const primaryLabel = state.lens === "mobility" ? "Accessible reach" : state.lens === "heat" ? "Vulnerable residents reached" : "Residents within 15 minutes";

  return (
    <main className={`results-screen app-stage ${mobility ? "mobility-reveal" : ""}`}>
      <header className="results-header">
        <Brand compact />
        <div className="results-run-status"><span className={state.simulationStatus === "fallback" ? "fallback" : ""} />{state.simulationStatus === "fallback" ? "Precomputed demo run" : "Simulation complete"}</div>
        <button className="reset-button" onClick={resetDemo}><RotateCcw size={14} /> Reset demo</button>
      </header>

      <section className="scenario-plaque">
        <p className="kicker">Scenario 01</p>
        <h1>Cooling center<br />placement</h1>
        <div><span>South Los Angeles</span><span>${state.budget}K budget</span><span>{OBJECTIVE_LABELS[state.objective]}</span></div>
      </section>

      <section className="results-panel">
        <div className="winner-heading">
          <span className="winner-index">{state.recommendedSite.toUpperCase()}</span>
          <div><small>Strongest for {LENS_LABELS[state.lens]}</small><h2>{SITE_NAMES[state.recommendedSite]}</h2></div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div className="headline-metric" key={`${state.lens}-${state.selectedSite}-${revealKey}`} initial={{ opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.48 }}>
            <small>{primaryLabel}</small><strong>{primaryMetric}</strong><span>{mobility ? "+21 pts vs baseline" : state.lens === "heat" ? "+2,220 vs baseline" : "+59% vs baseline"}</span>
          </motion.div>
        </AnimatePresence>

        <div className="supporting-metrics">
          <div><small>Heat exposure</small><strong>{result.exposure} min</strong></div>
          <div><small>Demand / capacity</small><strong className={result.capacity > 100 ? "warning" : ""}>{result.capacity}%</strong></div>
          <div><small>Setup cost</small><strong>{result.cost}</strong></div>
        </div>

        <div className="site-selector">
          {(["a", "b", "c"] as SiteId[]).map((site) => <button className={state.selectedSite === site ? "active" : ""} onClick={() => state.setSelectedSite(site)} key={site}><span>{site.toUpperCase()}</span><div><strong>Site {site.toUpperCase()}</strong><small>{SITE_RESULTS[site][state.lens === "all" ? "population" : state.lens === "heat" ? "vulnerable" : "wheelchair"]}{state.lens === "mobility" ? "% accessible" : " reached"}</small></div>{state.recommendedSite === site && <em>Recommended</em>}</button>)}
        </div>
      </section>

      <AnimatePresence>
        {mobility && (
          <motion.aside className="equity-callout" initial={{ opacity: 0, x: 36 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ delay: 0.62, duration: 0.48 }}>
            <AlertTriangle size={17} />
            <div><small>The recommendation changed</small><strong>Site C reaches more people overall, but inaccessible route segments weaken mobility access. Site B restores connected access to 82%.</strong></div>
            <ArrowRight size={16} />
          </motion.aside>
        )}
      </AnimatePresence>

      <nav className="lens-control" aria-label="Population lens">
        <span>Population lens</span>
        <div>
          {lenses.map((lens) => { const Icon = lens.icon; return <button className={state.lens === lens.id ? "active" : ""} onClick={() => changeLens(lens.id)} key={lens.id}><Icon size={15} />{lens.label}</button>; })}
        </div>
        <button className="method-button" onClick={() => setShowMethod(true)}><Info size={14} /> Model assumptions</button>
      </nav>

      <AnimatePresence>
        {showMethod && (
          <motion.aside className="method-overlay" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
            <button onClick={() => setShowMethod(false)} aria-label="Close model assumptions"><X size={16} /></button>
            <p className="kicker">Model transparency</p>
            <h2>What this run assumes</h2>
            <dl>
              <div><dt>Population</dt><dd>2,500 seeded synthetic journeys</dd></div>
              <div><dt>Modes</dt><dd>Walking and public transit</dd></div>
              <div><dt>Accessibility</dt><dd>Unverified curb transitions excluded</dd></div>
              <div><dt>Uncertainty</dt><dd>30 sensitivity repetitions</dd></div>
            </dl>
            <small>Illustrative prototype results—not a forecast or engineering study.</small>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="scene-labels" aria-hidden="true">
        <span className="scene-site-label label-a"><i>A</i>SOUTH PARK REC</span>
        <span className="scene-site-label label-b"><i>B</i>THE BEEHIVE</span>
        <span className="scene-site-label label-c"><i>C</i>FLORENCE LIBRARY</span>
      </div>
    </main>
  );
}
