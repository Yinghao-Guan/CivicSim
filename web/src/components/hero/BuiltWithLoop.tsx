"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { STACK_ICON_PATHS } from "@/components/hero/stack-icons";

type StackItem = { label: string; href: string; icon: keyof typeof STACK_ICON_PATHS };

const ITEMS: StackItem[] = [
  { label: "Next.js", href: "https://nextjs.org", icon: "nextjs" },
  { label: "React", href: "https://react.dev", icon: "react" },
  { label: "Three.js", href: "https://threejs.org", icon: "threejs" },
  { label: "FastAPI", href: "https://fastapi.tiangolo.com", icon: "fastapi" },
];

/** Pixels per second. */
const SPEED = 34;
/** Seconds for the loop to ease to a stop on hover, or back up to speed. */
const EASE = 0.3;
const COPIES = 3;

function Sequence({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="built-with__sequence" aria-hidden={hidden || undefined}>
      {ITEMS.map(({ label, href, icon }) => (
        <li key={label}>
          <a href={href} target="_blank" rel="noreferrer" tabIndex={hidden ? -1 : undefined} className="built-with__item">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={STACK_ICON_PATHS[icon]} /></svg>
            <span>{label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function BuiltWithLoop() {
  const reducedMotion = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);

  useEffect(() => {
    const trackElement = track.current;
    if (!trackElement || reducedMotion) return;
    let frame = 0;
    let last = performance.now();
    let offset = 0;
    let velocity = SPEED;

    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      // Ease toward the target speed so hovering glides to a stop instead of snapping.
      velocity += ((hovered.current ? 0 : SPEED) - velocity) * (1 - Math.exp(-delta / EASE));
      const sequenceWidth = trackElement.scrollWidth / COPIES;
      if (sequenceWidth > 0) {
        offset = (offset + velocity * delta) % sequenceWidth;
        trackElement.style.transform = `translate3d(${-offset}px, 0, 0)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  return (
    <div className="built-with">
      <p className="built-with__label">
        Built at <a href="https://www.hacker.fund/visionhack/" target="_blank" rel="noreferrer">VISION HACK: South LA</a> with
      </p>
      <div
        className="built-with__viewport"
        onPointerEnter={() => { hovered.current = true; }}
        onPointerLeave={() => { hovered.current = false; }}
        onFocus={() => { hovered.current = true; }}
        onBlur={() => { hovered.current = false; }}
      >
        <div ref={track} className="built-with__track">
          {Array.from({ length: reducedMotion ? 1 : COPIES }, (_, index) => <Sequence key={index} hidden={index > 0} />)}
        </div>
      </div>
    </div>
  );
}
