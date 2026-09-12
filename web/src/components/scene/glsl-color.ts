import * as THREE from "three";

import { HERO_PALETTE } from "@/lib/hero-palette";

/** A palette hex color as a linear-space GLSL literal. */
export function glslColor(hex: string) {
  const { r, g, b } = new THREE.Color(hex);
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
}

/** GLSL `vec3 thermal(float t)` blending smoothly through the hero heat ramp. */
export const thermalGlsl = /* glsl */ `
  vec3 thermal(float t) {
    vec3 color = ${glslColor(HERO_PALETTE.heat[0].color)};
${HERO_PALETTE.heat.slice(1).map((stop, index) => `    color = mix(color, ${glslColor(stop.color)}, smoothstep(${HERO_PALETTE.heat[index].at.toFixed(2)}, ${stop.at.toFixed(2)}, t));`).join("\n")}
    return color;
  }
`;
