"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { BUILDINGS } from "@/data/twin-layout";
import type { VisualStage } from "@/lib/experience-types";

export default function ProceduralCity({ stage }: { stage: VisualStage }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    BUILDINGS.forEach((building, index) => {
      dummy.position.set(...building.position);
      dummy.scale.set(...building.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.set(building.tone > 0.8 ? "#1c5960" : building.tone > 0.45 ? "#173d49" : "#122c38");
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [color, dummy]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const targetRotation = stage === "hero" ? 0.16 : 0;
    groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, targetRotation, 2.2, delta);
    if (stage === "hero") groupRef.current.rotation.y += delta * 0.012;
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, BUILDINGS.length]} castShadow={false} receiveShadow={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.72} metalness={0.28} emissive="#071821" emissiveIntensity={0.7} />
      </instancedMesh>
    </group>
  );
}
