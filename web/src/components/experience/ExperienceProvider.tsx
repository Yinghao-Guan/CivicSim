"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { RECOMMENDATION_BY_LENS } from "@/data/demo-scenario";
import type { Lens, Objective, ScenarioState, SiteId, VisualStage } from "@/lib/experience-types";

type ExperienceContextValue = ScenarioState & {
  setBudget: (value: 300 | 500 | 700) => void;
  setObjective: (value: Objective) => void;
  setLens: (value: Lens) => void;
  setCandidates: (value: SiteId[]) => void;
  setSelectedSite: (value: SiteId) => void;
  setSetupStep: (value: 1 | 2 | 3) => void;
  setSimulationStep: (value: number) => void;
  setSimulationStatus: (value: ScenarioState["simulationStatus"]) => void;
  setVisualStage: (value: VisualStage) => void;
  reset: () => void;
};

const initialState: ScenarioState = {
  budget: 500,
  objective: "balanced",
  lens: "all",
  candidates: ["a", "b", "c"],
  selectedSite: "c",
  recommendedSite: "c",
  setupStep: 1,
  simulationStep: 0,
  simulationStatus: "idle",
  visualStage: "hero",
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(initialState);

  const setBudget = useCallback((budget: 300 | 500 | 700) => setState((current) => ({ ...current, budget })), []);
  const setObjective = useCallback((objective: Objective) => setState((current) => ({ ...current, objective })), []);
  const setLens = useCallback((lens: Lens) => setState((current) => {
    const recommendedSite = RECOMMENDATION_BY_LENS[lens];
    return { ...current, lens, recommendedSite, selectedSite: recommendedSite };
  }), []);
  const setCandidates = useCallback((candidates: SiteId[]) => setState((current) => ({ ...current, candidates })), []);
  const setSelectedSite = useCallback((selectedSite: SiteId) => setState((current) => ({ ...current, selectedSite })), []);
  const setSetupStep = useCallback((setupStep: 1 | 2 | 3) => setState((current) => ({ ...current, setupStep })), []);
  const setSimulationStep = useCallback((simulationStep: number) => setState((current) => ({ ...current, simulationStep })), []);
  const setSimulationStatus = useCallback((simulationStatus: ScenarioState["simulationStatus"]) => setState((current) => ({ ...current, simulationStatus })), []);
  const setVisualStage = useCallback((visualStage: VisualStage) => setState((current) => ({ ...current, visualStage })), []);
  const reset = useCallback(() => setState(initialState), []);

  const value = useMemo<ExperienceContextValue>(() => ({
    ...state,
    setBudget, setObjective, setLens, setCandidates, setSelectedSite, setSetupStep,
    setSimulationStep, setSimulationStatus, setVisualStage, reset,
  }), [state, setBudget, setObjective, setLens, setCandidates, setSelectedSite, setSetupStep, setSimulationStep, setSimulationStatus, setVisualStage, reset]);

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience() {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("useExperience must be used inside ExperienceProvider");
  return value;
}
