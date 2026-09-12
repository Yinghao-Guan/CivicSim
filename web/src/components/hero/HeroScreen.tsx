"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import Brand from "@/components/experience/Brand";
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
    router.prefetch("/setup");
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [reset, router]);

  const enter = () => {
    if (entering) return;
    setEntering(true);
    setVisualStage("entering");
    timer.current = window.setTimeout(() => router.push("/setup"), reducedMotion ? 200 : 850);
  };

  return (
    <motion.main className={`hero-screen ${entering ? "is-entering" : ""}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}>
      <div className="hero-topline">
        <Brand />
        <div className="system-status">South Los Angeles / Scenario 01</div>
      </div>

      <motion.section className="hero-copy" animate={entering ? { opacity: 0, y: reducedMotion ? 0 : -24 } : { opacity: 1, y: 0 }}>
        <p className="kicker">Participatory urban simulation</p>
        <h1>Test city decisions<br />before they<br /> <em>are built.</em></h1>
        <p className="hero-subtitle">See how a neighborhood responds—who gains access, who gets left behind, and why.</p>
        <button className="enter-button" onClick={enter} disabled={entering}>
          <span>Enter the simulation</span>
          <ArrowRight size={19} />
        </button>
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
