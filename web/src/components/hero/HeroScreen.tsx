"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import BuiltWithLoop from "@/components/hero/BuiltWithLoop";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { SITE_NAMES, SITE_RESULTS } from "@/data/demo-scenario";
import { heroSiteCycle } from "@/lib/animation/hero-site-cycle";

export default function HeroScreen() {
  const router = useRouter();
  const { reset, setVisualStage } = useExperience();
  const [entering, setEntering] = useState(false);
  const reducedMotion = useReducedMotion();
  const testedSite = useSyncExternalStore(heroSiteCycle.subscribe, heroSiteCycle.get, heroSiteCycle.getServer);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    reset();
    router.prefetch("/studio");
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [reset, router]);

  const enter = () => {
    if (entering) return;
    setEntering(true);
    setVisualStage("entering");
    timer.current = window.setTimeout(() => router.push("/studio"), reducedMotion ? 200 : 850);
  };

  return (
    <motion.main className={`hero-screen ${entering ? "is-entering" : ""}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}>
      {/* The wordmark leads the copy on this page, so the corner brand steps aside. */}
      <div className="hero-topline">
        <div className="system-status">South Los Angeles / Scenario 01</div>
      </div>

      <motion.section className="hero-copy" animate={entering ? { opacity: 0, y: reducedMotion ? 0 : -24 } : { opacity: 1, y: 0 }}>
        <p className="kicker">Participatory urban simulation</p>
        <h1 className="hero-wordmark">CivicSim</h1>
        <p className="hero-tagline">Test city decisions<br /> before they <em>are built.</em></p>
        <p className="hero-subtitle">See how a neighborhood responds—who gains access, who gets left behind, and why.</p>
        <button className="enter-button" onClick={enter} disabled={entering}>
          <span>Enter the simulation</span>
          <ArrowRight size={17} strokeWidth={2.2} />
        </button>
        <BuiltWithLoop />
      </motion.section>

      <div className="hero-caption">One neighborhood. Many possible futures.</div>
      <motion.p className="hero-model-caption" animate={{ opacity: entering ? 0 : 1 }}>
        <span className="hero-model-kicker">Testing site {testedSite.toUpperCase()} of 3</span>
        <span key={testedSite} className="hero-model-site">
          {SITE_NAMES[testedSite]}
          <span>{SITE_RESULTS[testedSite].population.toLocaleString("en-US")} residents within reach · illustrative</span>
        </span>
      </motion.p>
    </motion.main>
  );
}
