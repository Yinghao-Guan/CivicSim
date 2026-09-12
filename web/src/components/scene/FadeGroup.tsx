"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

type FadeGroupProps = {
  children: React.ReactNode;
  /** Opacity the subtree settles toward. */
  visible?: boolean;
  /** Start transparent and fade in on mount. */
  appear?: boolean;
  rate?: number;
  reducedMotion?: boolean;
};

type FadeState = { opacity: number; transparent: boolean };

/**
 * Fades every material in a subtree. Components that animate their own opacity
 * write `material.userData.baseOpacity`; shader materials expose `uOpacity`.
 * Once fully visible the materials are restored and the group stops touching them.
 */
export default function FadeGroup({ children, visible = true, appear = false, rate = 4.5, reducedMotion = false }: FadeGroupProps) {
  const group = useRef<THREE.Group>(null);
  const fade = useRef(appear && !reducedMotion ? 0 : 1);
  const settled = useRef(false);

  useFrame((_, delta) => {
    if (!group.current) return;
    const target = visible ? 1 : 0;
    fade.current = reducedMotion ? target : THREE.MathUtils.damp(fade.current, target, rate, Math.min(delta, 0.05));
    if (Math.abs(fade.current - target) < 0.002) fade.current = target;
    const done = fade.current === 1;
    if (done && settled.current) return;
    settled.current = done;

    group.current.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (!material) return;
      for (const item of Array.isArray(material) ? material : [material]) {
        const original = (item.userData.fadeOriginal ??= { opacity: item.opacity, transparent: item.transparent }) as FadeState;
        const base = item.userData.baseOpacity ?? original.opacity;
        if (item instanceof THREE.ShaderMaterial && item.uniforms.uOpacity) {
          item.uniforms.uOpacity.value = fade.current;
          continue;
        }
        item.opacity = base * fade.current;
        item.transparent = done ? original.transparent : true;
      }
    });
  });

  return <group ref={group}>{children}</group>;
}
