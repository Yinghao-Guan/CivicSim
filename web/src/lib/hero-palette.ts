/**
 * Hero colors. The ground is paper and the architecture graphite; color appears only
 * where it carries meaning: a thermal ramp for surface heat (on the background grid and
 * the neighborhood, cooling inside the tested site's reach), vermilion for the decision,
 * and ink for homes left outside it.
 * CSS tokens for the page live in globals.css.
 */
export const HERO_PALETTE = {
  /** Grid lines and junctions take their color from the heat ramp; packets and faces stay neutral. */
  grid: { packet: "#2a2925", face: "#8d8a80", alpha: 0.7 },
  board: { slab: "#f4f1ea", base: "#23221f", underlay: "#8f8b80", street: "#77746b" },
  building: { fill: "#faf8f3", low: "#77746b", high: "#4a4843", reached: "#161512", edge: "#e2462a", window: "#bdb9ae" },
  lot: { idle: "#6d6a61", active: "#e2462a", label: "#3a3934" },
  facility: { line: "#e2462a", fill: "#e2462a" },
  pin: { line: "#e2462a", fill: "#e2462a", hole: "#f4f1ea" },
  reach: { ring: "#e2462a", route: "#e2462a", resident: "#161512" },
  home: { rest: "#a29f95", reached: "#e2462a", missed: "#161512" },
  /** Thermal ramp shared by the heat field and the background grid, from cool ground to the hottest blocks. */
  heat: [
    { at: 0, color: "#3f6fb8" },
    { at: 0.2, color: "#2e9db0" },
    { at: 0.38, color: "#5cb36b" },
    { at: 0.55, color: "#e3c44a" },
    { at: 0.72, color: "#ec8a36" },
    { at: 0.87, color: "#dc4a2f" },
    { at: 1, color: "#a8284f" },
  ],
} as const;
