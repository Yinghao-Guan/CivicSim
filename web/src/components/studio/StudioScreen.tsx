"use client";

import { ArrowLeft, ArrowRight, Check, Loader2, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { StudioLens, StudioStage } from "@/components/studio/StudioMap";
import { THERMAL_GRADIENT } from "@/lib/studio-map";
import { BASELINE_ID, useScenarios } from "@/lib/useScenarios";

const StudioMap = dynamic(() => import("@/components/studio/StudioMap"), {
  ssr: false,
  loading: () => <div className="studio-map" />,
});

const integer = new Intl.NumberFormat("en-US");
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const letter = (index: number) => String.fromCharCode(65 + index);

const panelMotion = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.35 },
};

export default function StudioScreen() {
  const scenarios = useScenarios();
  const { load, loadError, candidates, results, running, runError, select, runAllCandidates, retry } = scenarios;
  const reducedMotion = Boolean(useReducedMotion());
  const [stage, setStage] = useState<StudioStage>("brief");
  const [focusSiteId, setFocusSiteId] = useState<string | null>(null);
  const [lens] = useState<StudioLens>("all");

  const baseline = results[BASELINE_ID] ?? null;
  const allRun = candidates.length > 0 && candidates.every((site) => results[site.id]);
  const scenario = focusSiteId ? results[focusSiteId] ?? null : null;

  // The run finishes on its own; results open once every candidate has an answer.
  useEffect(() => {
    if (stage !== "running" || !allRun) return;
    const timer = window.setTimeout(() => setStage("results"), reducedMotion ? 0 : 700);
    return () => window.clearTimeout(timer);
  }, [allRun, reducedMotion, stage]);

  const runSimulation = () => {
    setStage("running");
    setFocusSiteId((current) => current ?? candidates[candidates.length - 1]?.id ?? null);
    runAllCandidates();
  };

  const focusSite = (siteId: string) => {
    setFocusSiteId(siteId);
    if (stage === "brief") setStage("sites");
    if (results[siteId]) select(siteId);
  };

  const heatRange = useMemo(() => {
    const weights = baseline?.heatmap.map((point) => point.weight) ?? [];
    return weights.length ? [Math.min(...weights), Math.max(...weights)] : null;
  }, [baseline]);

  return (
    <main className="studio">
      <StudioMap
        stage={stage}
        candidates={candidates}
        heatmap={baseline?.heatmap ?? []}
        scenario={scenario}
        focusSiteId={focusSiteId}
        lens={lens}
        reducedMotion={reducedMotion}
        onSelectSite={focusSite}
      />

      <header className="studio-topbar">
        <Link href="/" className="studio-brand">CivicSim</Link>
        <span>South Park · Council District 9</span>
      </header>

      <section className="studio-panel" aria-live="polite">
        <AnimatePresence mode="wait">
          {load === "loading" && (
            <motion.div key="loading" className="studio-step" {...panelMotion}>
              <p className="studio-kicker">Connecting</p>
              <h1>Loading the neighborhood model…</h1>
            </motion.div>
          )}

          {load === "failed" && (
            <motion.div key="failed" className="studio-step" {...panelMotion}>
              <p className="studio-kicker">Simulation offline</p>
              <h1>The model isn&apos;t answering.</h1>
              <p className="studio-body">{loadError}</p>
              <p className="studio-note">Start it with <code>cd backend &amp;&amp; uv run uvicorn main:app</code>, then retry.</p>
              <button className="studio-cta" onClick={retry}><RotateCcw size={16} /> Retry</button>
            </motion.div>
          )}

          {load === "ready" && stage === "brief" && (
            <motion.div key="brief" className="studio-step" {...panelMotion}>
              <p className="studio-kicker">Scenario 01 · Extreme heat</p>
              <h1>One cooling center.<br />Three possible sites.</h1>
              <p className="studio-body">South Park is funding one new cooling center. Where it opens decides who can walk to relief during a heat wave—and who can&apos;t.</p>
              {baseline && (
                <div className="studio-stat">
                  <strong>{integer.format(baseline.metrics.population_reached)}</strong>
                  <span>modeled residents reach today&apos;s cooling center within 15 minutes</span>
                </div>
              )}
              {heatRange && (
                <figure className="studio-legend">
                  <figcaption>Street heat · share of each walk in unshaded heat</figcaption>
                  <i style={{ background: THERMAL_GRADIENT }} />
                  <div><span>Cooler</span><span>{Math.round(heatRange[0] * 100)}–{Math.round(heatRange[1] * 100)}% exposed</span><span>Hotter</span></div>
                </figure>
              )}
              <button className="studio-cta" onClick={() => setStage("sites")}>Meet the three sites <ArrowRight size={17} /></button>
            </motion.div>
          )}

          {load === "ready" && stage === "sites" && (
            <motion.div key="sites" className="studio-step" {...panelMotion}>
              <p className="studio-kicker">Candidates</p>
              <h1>Three places that could open their doors.</h1>
              <ol className="studio-sites">
                {candidates.map((site, index) => (
                  <li key={site.id}>
                    <button className={site.id === focusSiteId ? "is-active" : ""} onClick={() => setFocusSiteId(site.id)}>
                      <span className="studio-letter">{letter(index)}</span>
                      <span className="studio-site">
                        <strong>{site.name}</strong>
                        <small>
                          Capacity {integer.format(site.capacity)}
                          {site.estimated_setup_cost !== null && <> · est. {currency.format(site.estimated_setup_cost)}</>}
                          {" · "}{site.accessible_entrance ? "Accessible entrance" : "No accessible entrance"}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="studio-note">Setup costs are illustrative estimates, not city figures.</p>
              <div className="studio-actions">
                <button className="studio-back" onClick={() => setStage("brief")}><ArrowLeft size={15} /> Back</button>
                <button className="studio-cta" onClick={runSimulation}>Run the simulation <ArrowRight size={17} /></button>
              </div>
            </motion.div>
          )}

          {load === "ready" && stage === "running" && (
            <motion.div key="running" className="studio-step" {...panelMotion}>
              <p className="studio-kicker">Simulating</p>
              <h1>Walking every resident to every site.</h1>
              <ol className="studio-progress">
                {candidates.map((site, index) => {
                  const done = Boolean(results[site.id]);
                  return (
                    <li key={site.id} className={done ? "is-done" : running === site.id ? "is-running" : ""}>
                      <span className="studio-letter">{done ? <Check size={13} /> : running === site.id ? <Loader2 size={13} className="spin" /> : letter(index)}</span>
                      {site.name}
                    </li>
                  );
                })}
              </ol>
              {runError && <p className="studio-error">{runError}</p>}
            </motion.div>
          )}

          {load === "ready" && stage === "results" && scenario && (
            <motion.div key="results" className="studio-step" {...panelMotion}>
              <p className="studio-kicker">Results</p>
              <h1>{candidates.find((site) => site.id === focusSiteId)?.name}</h1>
              <div className="studio-stat">
                <strong>{integer.format(scenario.metrics.population_reached)}</strong>
                <span>modeled residents reach it within 15 minutes</span>
              </div>
              <div className="studio-actions">
                {candidates.map((site, index) => (
                  <button key={site.id} className={`studio-chip ${site.id === focusSiteId ? "is-active" : ""}`} onClick={() => focusSite(site.id)}>{letter(index)}</button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </main>
  );
}
