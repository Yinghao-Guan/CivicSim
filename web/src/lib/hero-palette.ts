/**
 * Hero colors. The ground is paper and the linework graphite; color appears only
 * where it carries meaning: a thermal ramp for surface heat that cools inside the
 * tested site's reach, vermilion for the decision, and ink for homes left outside it.
 * CSS tokens for the page live in globals.css.
 */
export const HERO_PALETTE = {
  grid: { line: "#3b3a35", node: "#2a2925", packet: "#2a2925", face: "#8d8a80", alpha: 0.7 },
  board: { slab: "#f4f1ea", base: "#23221f", underlay: "#8f8b80", street: "#77746b" },
  building: { fill: "#faf8f3", low: "#77746b", high: "#4a4843", reached: "#161512", edge: "#e2462a", window: "#bdb9ae" },
  lot: { idle: "#6d6a61", active: "#e2462a", label: "#3a3934" },
  facility: { line: "#e2462a", fill: "#e2462a" },
  pin: { line: "#e2462a", fill: "#e2462a", hole: "#f4f1ea" },
  reach: { ring: "#e2462a", route: "#e2462a", resident: "#161512" },
  home: { rest: "#a29f95", reached: "#e2462a", missed: "#161512" },
  /** Thermal ramp from relieved ground to the hottest blocks. */
  heat: { cool: "#79b0d2", mild: "#f2e2a0", warm: "#f0ad4c", hot: "#e46a3a", peak: "#b8325a" },
} as const;
