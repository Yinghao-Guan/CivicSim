import * as THREE from "three";

/** A palette hex color as a linear-space GLSL literal. */
export function glslColor(hex: string) {
  const { r, g, b } = new THREE.Color(hex);
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
}
