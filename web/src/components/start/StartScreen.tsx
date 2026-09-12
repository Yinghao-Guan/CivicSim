"use client";

import { ArrowRight, Camera } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useExperience } from "@/components/experience/ExperienceProvider";
import { HERO_PALETTE } from "@/lib/hero-palette";

/** The resident scan app is a separate zone served under this origin (see next.config.ts). */
const BOARD_PATH = "/community/board";

type Destination = "twin" | "board";

const THERMAL = `linear-gradient(90deg, ${HERO_PALETTE.heat.map(({ at, color }) => `${color} ${at * 100}%`).join(", ")})`;

export default function StartScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { setVisualStage } = useExperience();
  const [leaving, setLeaving] = useState<Destination | null>(null);
  const [reportCount, setReportCount] = useState<number | null>(null);

  useEffect(() => {
    router.prefetch("/studio");
    // A live count is a nice touch, never a requirement: the board works without it.
    fetch("/scan-api/reports", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { reports: unknown[] } | null) => { if (body) setReportCount(body.reports.length); })
      .catch(() => {});
  }, [router]);

  const go = (destination: Destination) => {
    if (leaving) return;
    setLeaving(destination);
    const delay = reducedMotion ? 0 : 450;
    window.setTimeout(() => {
      if (destination === "twin") {
        setVisualStage("entering");
        router.push("/studio");
      } else {
        // /community is another app proxied under this origin, not a page of this one,
        // so it needs a full navigation rather than a client transition.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(BOARD_PATH);
      }
    }, delay);
  };

  const card = (index: number) => ({
    initial: { opacity: 0, y: reducedMotion ? 0 : 22 },
    animate: leaving ? { opacity: 0, y: reducedMotion ? 0 : -12 } : { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay: leaving ? 0 : 0.15 + index * 0.08, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <main className="start-screen">
      <header className="start-topline">
        <Link href="/" className="start-brand">CivicSim</Link>
        <span>South Park · Council District 9</span>
      </header>

      <motion.section className="start-intro" initial={{ opacity: 0, y: reducedMotion ? 0 : 14 }} animate={leaving ? { opacity: 0 } : { opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <p className="kicker">Two ways in</p>
        <h1>Test a decision, or hear<br />from the <em>people it affects.</em></h1>
      </motion.section>

      <div className="start-choices">
        <motion.button className="start-card start-card--twin" onClick={() => go("twin")} {...card(0)}>
          <span className="start-card__eyebrow">Simulate a decision</span>
          <span className="start-card__title">Launch the City Twin</span>
          <span className="start-card__body">
            Decide where South Park&apos;s next cooling center should open. Every modeled resident walks to each candidate site on real streets—see who is reached, and who is left out.
          </span>
          <span className="start-card__visual" aria-hidden="true">
            <i style={{ background: THERMAL }} />
            {["A", "B", "C"].map((site, index) => <b key={site} style={{ left: `${22 + index * 28}%` }}>{site}</b>)}
          </span>
          <span className="start-card__cta">Enter the twin <ArrowRight size={17} /></span>
        </motion.button>

        <motion.button className="start-card start-card--board" onClick={() => go("board")} {...card(1)}>
          <span className="start-card__eyebrow">Hear from residents</span>
          <span className="start-card__title">Open the Community Board</span>
          <span className="start-card__body">
            Street problems residents photographed on their phones—broken sidewalks, missing shade, blocked ramps—placed on the map with the fix and what repairing them would change.
          </span>
          <span className="start-card__visual start-card__visual--reports" aria-hidden="true">
            <Camera size={18} />
            <span>{reportCount === null ? "Live resident reports" : `${reportCount} report${reportCount === 1 ? "" : "s"} submitted`}</span>
          </span>
          <span className="start-card__cta">Open the board <ArrowRight size={17} /></span>
        </motion.button>
      </div>
    </main>
  );
}
