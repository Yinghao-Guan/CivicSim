"use client";

/**
 * Scenario state: everything the UI knows about the simulation.
 *
 * The backend owns every number here. This hook fetches, caches and selects;
 * it never computes a metric, never derives a route, and never falls back to
 * invented data when a request fails — a failed run shows as a failure
 * (doc 01 §13, AGENTS.md §9).
 *
 * Results are cached per scenario id because the backend's unshaded runs are
 * deterministic: re-running Site B cannot produce a different answer, so
 * re-selecting it should not cost a round trip.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, fetchBaseline, simulate } from "./api";
import type { CandidateSite, SimulationResponse } from "./contract";

/** Contract §3.2: the current-state scenario's canonical id. */
export const BASELINE_ID = "baseline";

export type LoadState = "loading" | "ready" | "failed";

export interface ScenarioState {
  load: LoadState;
  /** Why the baseline load failed, if it did. */
  loadError: string | null;
  candidates: CandidateSite[];
  /** Every scenario fetched so far, keyed by scenario id. */
  results: Record<string, SimulationResponse>;
  /** The scenario currently shown on the map. */
  activeId: string;
  active: SimulationResponse | null;
  /** Scenario id currently being simulated, if any. */
  running: string | null;
  /** Why the last run failed. Cleared when a run succeeds. */
  runError: string | null;
  select: (scenarioId: string) => void;
  runAllCandidates: () => void;
  retry: () => void;
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export function useScenarios(): ScenarioState {
  const [load, setLoad] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateSite[]>([]);
  const [results, setResults] = useState<Record<string, SimulationResponse>>({});
  const [activeId, setActiveId] = useState<string>(BASELINE_ID);
  const [running, setRunning] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Guards against setting state after unmount, which React StrictMode makes
  // easy to hit in development.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadBaseline = useCallback(async () => {
    setLoad("loading");
    setLoadError(null);
    try {
      const { baseline, candidates: sites } = await fetchBaseline();
      if (!alive.current) return;
      setCandidates(sites);
      setResults((prior) => ({ ...prior, [baseline.scenario_id]: baseline }));
      setActiveId(baseline.scenario_id);
      setLoad("ready");
    } catch (error) {
      if (!alive.current) return;
      setLoadError(describe(error));
      setLoad("failed");
    }
  }, []);

  useEffect(() => {
    void loadBaseline();
  }, [loadBaseline]);

  const run = useCallback(
    async (siteId: string): Promise<SimulationResponse | null> => {
      setRunning(siteId);
      setRunError(null);
      try {
        const result = await simulate({ cooling_center: siteId });
        if (!alive.current) return null;
        setResults((prior) => ({ ...prior, [result.scenario_id]: result }));
        return result;
      } catch (error) {
        if (alive.current) setRunError(describe(error));
        return null;
      } finally {
        if (alive.current) setRunning(null);
      }
    },
    [],
  );

  const select = useCallback(
    (scenarioId: string) => {
      setActiveId(scenarioId);
      if (results[scenarioId] || scenarioId === BASELINE_ID) return;
      void run(scenarioId);
    },
    [results, run],
  );

  /** Runs every candidate so the comparison table can be read at a glance. */
  const runAllCandidates = useCallback(() => {
    void (async () => {
      for (const site of candidates) {
        if (!results[site.id]) await run(site.id);
      }
    })();
  }, [candidates, results, run]);

  const active = useMemo(() => results[activeId] ?? null, [results, activeId]);

  return {
    load,
    loadError,
    candidates,
    results,
    activeId,
    active,
    running,
    runError,
    select,
    runAllCandidates,
    retry: () => void loadBaseline(),
  };
}
