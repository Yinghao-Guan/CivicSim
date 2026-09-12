"use client";

import { ArrowUpRight, CircleDotDashed } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import Brand from "@/components/experience/Brand";
import { useExperience } from "@/components/experience/ExperienceProvider";

export default function HeroScreen() {
  const router = useRouter();
  const { reset, setVisualStage } = useExperience();
  const [entering, setEntering] = useState(false);
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
    timer.current = window.setTimeout(() => router.push("/setup"), 850);
  };

  return (
    <motion.main className={`hero-screen ${entering ? "is-entering" : ""}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}>
      <div className="hero-topline">
        <Brand />
        <div className="system-status"><span /> SOUTH LOS ANGELES · MODEL 01</div>
      </div>

      <div className="hero-index" aria-hidden="true">
        <span>34.00° N</span><span>118.24° W</span><span>LIVE TWIN / 24791</span>
      </div>

      <motion.section className="hero-copy" animate={entering ? { opacity: 0, y: -24 } : { opacity: 1, y: 0 }}>
        <p className="kicker"><CircleDotDashed size={13} /> PARTICIPATORY URBAN SIMULATION</p>
        <h1>Test city decisions<br />before they are <em>built.</em></h1>
        <p className="hero-subtitle">See how a neighborhood responds—who gains access, who gets left behind, and why.</p>
      </motion.section>

      <motion.button className="enter-button" onClick={enter} animate={entering ? { opacity: 0, scale: 0.92 } : { opacity: 1, scale: 1 }}>
        <span><small>01</small> ENTER CIVICSIM</span>
        <ArrowUpRight size={21} />
      </motion.button>

      <div className="hero-caption"><span>THE CITY IS NOT A BACKDROP.</span><strong>IT IS THE MODEL.</strong></div>
    </motion.main>
  );
}
