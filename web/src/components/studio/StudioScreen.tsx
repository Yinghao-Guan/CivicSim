"use client";

import { Accessibility, ArrowLeft, ArrowRight, Check, Flame, Loader2, MapPin, RotateCcw, TriangleAlert, Users, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { StudioLens, StudioStage } from "@/components/studio/StudioMap";
import type { CandidateSite, Coordinate, SimulationResponse } from "@/lib/contract";
import { FACILITY_LABELS, fetchNearestCooling, type NearestCooling } from "@/lib/cooling";
import { THERMAL_GRADIENT } from "@/lib/studio-map";
import { BASELINE_ID, useScenarios } from "@/lib/useScenarios";

const StudioMap = dynamic(() => import("@/components/studio/StudioMap"), {
  ssr: false,
  loading: () => <div className="studio-map" />,
});

const integer = new Intl.NumberFormat("en-US");
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const letter = (index: number) => String.fromCharCode(65 + index);

const percent = (value: number) => `${Math.round(value * 100)}%`;

type LensSpec = {
  id: StudioLens;
  label: string;
  icon: typeof Users;
  /** Reads the lens's headline metric straight off a backend response. */
  value: (scenario: SimulationResponse) => number;
  format: (value: number) => string;
  caption: string;
  share: boolean;
};

const LENSES: LensSpec[] = [
  { id: "all", label: "Everyone", icon: Users, value: (s) => s.metrics.population_reached, format: (v) => integer.format(v), caption: "residents reach it within 15 minutes", share: false },
  { id: "heat_vulnerable", label: "Heat-vulnerable", icon: Flame, value: (s) => s.metrics.heat_vulnerable_reached, format: (v) => integer.format(v), caption: "heat-vulnerable residents reach it within 15 minutes", share: false },
  { id: "mobility_constrained", label: "Wheelchair users", icon: Accessibility, value: (s) => s.metrics.wheelchair_access, format: percent, caption: "of wheelchair users have an accessible route", share: true },
];

/** The site with the larger backend number under a lens. Nothing is recomputed. */
function leaderFor(lens: LensSpec, candidates: CandidateSite[], results: Record<string, SimulationResponse>) {
  return candidates.reduce<CandidateSite | null>((best, site) => {
    const scenario = results[site.id];
    if (!scenario) return best;
    return !best || lens.value(scenario) > lens.value(results[best.id]) ? site : best;
  }, null);
}

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
  const [lens, setLens] = useState<StudioLens>("all");
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [nearby, setNearby] = useState<NearestCooling | null>(null);
  const [nearbyState, setNearbyState] = useState<"idle" | "loading" | "failed">("idle");
  const [nearbyError, setNearbyError] = useState<string | null>(null);

  const pickLocation = (location: Coordinate) => {
    setNearbyState("loading");
    setNearbyError(null);
    fetchNearestCooling(location)
      .then((result) => { setNearby(result); setNearbyState("idle"); })
      .catch((error: unknown) => { setNearbyError(error instanceof Error ? error.message : "Lookup failed"); setNearbyState("failed"); });
  };

  const clearNearby = () => { setNearby(null); setNearbyState("idle"); setNearbyError(null); };

  const baseline = results[BASELINE_ID] ?? null;
  const allRun = candidates.length > 0 && candidates.every((site) => results[site.id]);
  const scenario = focusSiteId ? results[focusSiteId] ?? null : null;

  const lensSpec = LENSES.find((spec) => spec.id === lens) ?? LENSES[0];
  const overallLeader = allRun ? leaderFor(LENSES[0], candidates, results) : null;
  const lensLeader = allRun ? leaderFor(lensSpec, candidates, results) : null;
  const flipped = Boolean(overallLeader && lensLeader && overallLeader.id !== lensLeader.id);

  // The run finishes on its own; results open on the overall leader once every candidate has an answer.
  useEffect(() => {
    if (stage !== "running" || !allRun) return;
    const timer = window.setTimeout(() => {
      if (overallLeader) setFocusSiteId(overallLeader.id);
      setStage("results");
    }, reducedMotion ? 0 : 700);
    return () => window.clearTimeout(timer);
  }, [allRun, overallLeader, reducedMotion, stage]);

  // Presenter shortcuts: 1-3 pick a site, L cycles the population lens.
  useEffect(() => {
    if (stage !== "results") return;
    const onKey = (event: KeyboardEvent) => {
      const site = candidates[Number(event.key) - 1];
      if (site) setFocusSiteId(site.id);
      if (event.key.toLowerCase() === "l") {
        setLens((current) => LENSES[(LENSES.findIndex((spec) => spec.id === current) + 1) % LENSES.length].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [candidates, stage]);

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
        nearby={nearby}
        onSelectSite={focusSite}
        onPickLocation={pickLocation}
      />

      {load === "ready" && (
        <aside className={`studio-nearby${nearby || nearbyState !== "idle" ? " is-open" : ""}`} aria-live="polite">
          {!nearby && nearbyState === "idle" && (
            <p className="studio-nearby__hint"><MapPin size={14} /> Click any building to find the nearest cooling centers on foot.</p>
          )}
          {nearbyState === "loading" && <p className="studio-nearby__hint"><Loader2 size={14} className="spin" /> Walking the streets from here…</p>}
          {nearbyState === "failed" && <p className="studio-nearby__hint">{nearbyError}</p>}
          {nearby && nearbyState === "idle" && (
            <>
              <header>
                <div>
                  <small>From this building</small>
                  <strong>{nearby.places[0] ? `${Math.round(nearby.places[0].walk_minutes)} min to cooling` : "No cooling center on foot"}</strong>
                </div>
                <button onClick={clearNearby} aria-label="Clear location"><X size={15} /></button>
              </header>
              <ol>
                {nearby.places.map((place, rank) => (
                  <li key={place.id} className={rank === 0 ? "is-closest" : ""}>
                    <span className="studio-nearby__rank">{rank + 1}</span>
                    <span className="studio-nearby__name">
                      <strong>{place.name}</strong>
                      <small>{FACILITY_LABELS[place.facility_type] ?? place.facility_type} · {integer.format(Math.round(place.walk_metres))} m</small>
                    </span>
                    <b>{Math.round(place.walk_minutes)}<small> min</small></b>
                  </li>
                ))}
              </ol>
              <p className="studio-note">Walking along real streets at 1.4 m/s.</p>
            </>
          )}
        </aside>
      )}

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
              <h1>One more cooling center.<br />Three possible sites.</h1>
              <p className="studio-body">South Park&apos;s cooling centers are a long, hot walk from many homes. The city can fund one more—where it opens decides who can walk to relief during a heat wave, and who can&apos;t.</p>
              <div className="studio-stat studio-stat--cooling">
                <strong>7</strong>
                <span>cooling centers in the area today—schools, a senior center and a public pool, shown in blue. Click any building to see how far relief is on foot.</span>
              </div>
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
            <motion.div key="results" className="studio-step studio-results" {...panelMotion}>
              <p className="studio-kicker">Results · {candidates.length} sites simulated</p>

              <div className="studio-lenses" role="tablist" aria-label="Whose experience to examine">
                {LENSES.map((spec) => {
                  const Icon = spec.icon;
                  return (
                    <button key={spec.id} role="tab" aria-selected={spec.id === lens} className={spec.id === lens ? "is-active" : ""} onClick={() => setLens(spec.id)}>
                      <Icon size={14} /> {spec.label}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={`${lens}-${focusSiteId}`} className="studio-headline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
                  <small>{candidates.find((site) => site.id === focusSiteId)?.name}</small>
                  <strong>{lensSpec.format(lensSpec.value(scenario))}</strong>
                  <span>{lensSpec.caption}</span>
                </motion.div>
              </AnimatePresence>

              <ol className="studio-compare">
                {candidates.map((site, index) => {
                  const run = results[site.id];
                  if (!run) return null;
                  const value = lensSpec.value(run);
                  const max = lensSpec.share ? 1 : Math.max(...candidates.map((c) => (results[c.id] ? lensSpec.value(results[c.id]) : 0)), 1);
                  return (
                    <li key={site.id}>
                      <button className={site.id === focusSiteId ? "is-active" : ""} onClick={() => setFocusSiteId(site.id)}>
                        <span className="studio-letter">{letter(index)}</span>
                        <span className="studio-compare__body">
                          <span className="studio-compare__label">
                            <strong>{site.name}</strong>
                            {lensLeader?.id === site.id && <em>Leads</em>}
                          </span>
                          <span className="studio-bar"><motion.i animate={{ width: `${(value / max) * 100}%` }} transition={{ duration: reducedMotion ? 0 : 0.6 }} /></span>
                        </span>
                        <b>{lensSpec.format(value)}</b>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <AnimatePresence>
                {flipped && overallLeader && lensLeader && (
                  <motion.aside className="studio-flip" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ delay: reducedMotion ? 0 : 0.35 }}>
                    <TriangleAlert size={16} />
                    <div>
                      <strong>The recommendation flips.</strong>
                      <p>
                        {overallLeader.name} reaches the most residents overall ({integer.format(results[overallLeader.id].metrics.population_reached)}), but for {lensSpec.label.toLowerCase()} it falls to {lensSpec.format(lensSpec.value(results[overallLeader.id]))}. {lensLeader.name} reaches {lensSpec.format(lensSpec.value(results[lensLeader.id]))}.
                      </p>
                      {focusSiteId !== lensLeader.id && (
                        <button onClick={() => setFocusSiteId(lensLeader.id)}>Show {lensLeader.name} <ArrowRight size={13} /></button>
                      )}
                    </div>
                  </motion.aside>
                )}
              </AnimatePresence>

              <dl className="studio-facts">
                <div><dt>Heat exposure en route</dt><dd>{scenario.metrics.average_heat_exposure.toFixed(1)} min</dd></div>
                <div><dt>Capacity used</dt><dd className={(scenario.metrics.capacity_utilization ?? 0) > 1 ? "is-warning" : ""}>{scenario.metrics.capacity_utilization === null ? "—" : percent(scenario.metrics.capacity_utilization)}</dd></div>
                <div><dt>Blocked by barriers</dt><dd>{scenario.unreachable_agents.filter((agent) => agent.reason === "accessibility_barrier").length} of {scenario.run.agent_count} agents</dd></div>
                <div><dt>Beyond 15 minutes</dt><dd>{scenario.unreachable_agents.filter((agent) => agent.reason === "time_limit").length} of {scenario.run.agent_count} agents</dd></div>
              </dl>

              <div className="studio-assumptions">
                <button onClick={() => setShowAssumptions((open) => !open)}>{showAssumptions ? "Hide" : "Model"} assumptions</button>
                {showAssumptions && (
                  <ul>
                    {scenario.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    <li>Model {scenario.run.model_version} · population {scenario.run.population_version} · {scenario.run.agent_count} synthetic agents</li>
                  </ul>
                )}
              </div>

              <div className="studio-actions">
                <button className="studio-back" onClick={() => setStage("sites")}><ArrowLeft size={15} /> Sites</button>
                <Link className="studio-back" href="/"><RotateCcw size={14} /> Start over</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </main>
  );
}
