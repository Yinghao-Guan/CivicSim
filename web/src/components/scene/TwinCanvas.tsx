"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useExperience } from "@/components/experience/ExperienceProvider";
import CitySystems from "@/components/scene/CitySystems";
import ProceduralCity from "@/components/scene/ProceduralCity";
import type { VisualStage } from "@/lib/types";

const cameraTargets: Record<VisualStage, { position: THREE.Vector3; lookAt: THREE.Vector3 }> = {
  hero: { position: new THREE.Vector3(12.5, 9.5, 14), lookAt: new THREE.Vector3(0, 0.3, 0) },
  entering: { position: new THREE.Vector3(7.8, 7.5, 9.6), lookAt: new THREE.Vector3(0, 0.15, 0) },
  setup: { position: new THREE.Vector3(8.8, 9.8, 11.2), lookAt: new THREE.Vector3(0, 0.1, 0) },
  simulate: { position: new THREE.Vector3(1.5, 13.8, 8.4), lookAt: new THREE.Vector3(0, 0, 0.4) },
  results: { position: new THREE.Vector3(8.7, 10.2, 11.8), lookAt: new THREE.Vector3(0.3, 0.15, 0.6) },
};

function CameraRig({ stage }: { stage: VisualStage }) {
  const { camera } = useThree();
  const cameraRef = useRef(camera);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const target = cameraTargets[stage];
    const activeCamera = cameraRef.current;
    activeCamera.position.x = THREE.MathUtils.damp(activeCamera.position.x, target.position.x, 2.6, delta);
    activeCamera.position.y = THREE.MathUtils.damp(activeCamera.position.y, target.position.y, 2.6, delta);
    activeCamera.position.z = THREE.MathUtils.damp(activeCamera.position.z, target.position.z, 2.6, delta);
    lookAt.lerp(target.lookAt, 1 - Math.exp(-3.2 * delta));
    activeCamera.lookAt(lookAt);
  });
  return null;
}

function VisibilityController() {
  const { setFrameloop, invalidate } = useThree();
  useEffect(() => {
    const update = () => {
      const visible = document.visibilityState === "visible";
      setFrameloop(visible ? "always" : "never");
      if (visible) invalidate();
    };
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [invalidate, setFrameloop]);
  return null;
}

function Scene() {
  const { selectedSite, recommendedSite, lens, visualStage } = useExperience();
  return (
    <>
      <fog attach="fog" args={["#061018", 11, 31]} />
      <ambientLight intensity={0.72} color="#7fb8c5" />
      <directionalLight position={[-5, 12, 5]} intensity={1.35} color="#a4efff" />
      <directionalLight position={[8, 5, -8]} intensity={0.68} color="#ffbd77" />
      <VisibilityController />
      <CameraRig stage={visualStage} />
      <group position={[1.6, -1.35, 0]} rotation={[0, -0.12, 0]}>
        <CitySystems selectedSite={selectedSite} recommendedSite={recommendedSite} lens={lens} stage={visualStage} />
        <ProceduralCity stage={visualStage} />
      </group>
    </>
  );
}

export default function TwinCanvas() {
  return (
    <div className="twin-canvas" aria-hidden="true">
      <Canvas camera={{ position: [12.5, 9.5, 14], fov: 43, near: 0.1, far: 80 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <Scene />
      </Canvas>
    </div>
  );
}
