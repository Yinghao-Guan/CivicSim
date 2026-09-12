"use client";

import { useCallback, useRef, useState } from "react";

/** Drag the divider to wipe between the resident's photo and the concept. */
export default function BeforeAfter({ before, after, alt }: { before: string; after: string; alt: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50);
  // Frame follows the photo's own shape (portrait phone shots included).
  const [ratio, setRatio] = useState<number | null>(null);
  const dragging = useRef(false);

  const move = useCallback((clientX: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  return (
    <div
      ref={frame}
      className="before-after"
      style={ratio ? { aspectRatio: String(ratio) } : undefined}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && move(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <img src={after} alt={`${alt}, concept`} draggable={false} />
      <img
        src={before}
        alt={`${alt}, today`}
        draggable={false}
        className="ba-before"
        onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      />
      <span className="ba-label left">Today</span>
      <span className="ba-label right">Concept</span>
      <div className="ba-divider" style={{ left: `${split}%` }}>
        <span className="ba-handle">⇆</span>
      </div>
    </div>
  );
}
