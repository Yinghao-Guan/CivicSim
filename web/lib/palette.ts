/**
 * The CivicSim palette, from doc 02 section 6.
 *
 *   muted / dark buildings + warm neutral map + cyan simulation routes
 *   + orange/red heat exposure + green proposed interventions
 *
 * The point is that this reads as a planning and simulation tool, not as
 * Google Earth: the city recedes into a warm neutral ground so that the
 * simulation layers on top of it are the brightest thing on screen.
 *
 * Kept in TypeScript because MapLibre paint properties need real values, not
 * CSS variables. `app/globals.css` mirrors these for the surrounding UI; if
 * you change one, change both.
 */

export const palette = {
  /** Warm neutral ground — the base the whole map sits on. */
  land: "#e9e3d8",
  landAlt: "#e3dccf",

  water: "#b9c6cc",
  waterLine: "#a8b8bf",

  park: "#cfd6bd",
  parkDark: "#c2cbad",

  roadMinor: "#f4f0e8",
  roadMajor: "#fbf8f2",
  roadCasing: "#d3ccbe",
  rail: "#d8d0c2",

  /**
   * Layer 1 — context buildings from vector tiles. Deliberately recessive:
   * these exist to give the slice somewhere to sit, and must not compete
   * with it.
   */
  contextBuilding: "#c9c1b2",
  contextBuildingTop: "#d2cabb",

  /** Layer 2 — the demo slice. Darker and more present. Used from M3. */
  sliceBuilding: "#8d8778",
  sliceBuildingTop: "#9a9384",
  sliceBuildingHover: "#6f6a5d",
  sliceBuildingSelected: "#4a463c",

  /** Facilities that could become cooling centers. */
  facility: "#7d6f9c",

  /** Layer 3 — simulation. The brightest things on the map. */
  simulation: "#15b8b0",
  simulationSoft: "#7fd8d3",
  heat: "#e2622f",
  heatHot: "#c3341c",
  intervention: "#3f9e63",

  /** UI chrome — dark, so the warm map reads as the lit surface. */
  chrome: "#22201d",
  chromeRaised: "#2d2a26",
  chromeBorder: "#3d3931",
  ink: "#f2efe9",
  inkMuted: "#a8a29a",
  inkFaint: "#6f6a62",
} as const;

/** Label colours, kept apart because they are tuned against `land`. */
export const labelPalette = {
  text: "#4d4741",
  textHalo: "#efeae0",
  textMuted: "#6f6960",
} as const;
