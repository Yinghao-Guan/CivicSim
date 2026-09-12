"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { useExperience } from "@/components/experience/ExperienceProvider";
import CitySystems from "@/components/scene/CitySystems";
import FadeGroup from "@/components/scene/FadeGroup";
import FlowingCityGrid from "@/components/scene/FlowingCityGrid";
import NeighborhoodSculpture from "@/components/scene/NeighborhoodSculpture";
import ProceduralCity from "@/components/scene/ProceduralCity";
import SceneFallback from "@/components/scene/SceneFallback";
import type { VisualStage } from "@/lib/types";

const cameraTargets: Record<VisualStage, { position: THREE.Vector3; lookAt: THREE.Vector3 }> = {
  hero: { position: new THREE.Vector3(0, 6.5, 16), lookAt: new THREE.Vector3(0, 0, 0) },
  entering: { position: new THREE.Vector3(0, 5.5, 13.5), lookAt: new THREE.Vector3(1, 0, 0) },
  setup: { position: new THREE.Vector3(8.8, 9.8, 11.2), lookAt: new THREE.Vector3(0, 0.1, 0) },
  simulate: { position: new THREE.Vector3(1.5, 13.8, 8.4), lookAt: new THREE.Vector3(0, 0, 0.4) },
  results: { position: new THREE.Vector3(8.7, 10.2, 11.8), lookAt: new THREE.Vector3(0.3, 0.15, 0.6) },
};

function CameraRig({ stage, reducedMotion }: { stage: VisualStage; reducedMotion: boolean }) {
  const { camera } = useThree();
  const cameraRef = useRef(camera);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const target = cameraTargets[stage];
    const activeCamera = cameraRef.current;
    if (reducedMotion) {
      activeCamera.position.copy(target.position);
      activeCamera.lookAt(target.lookAt);
      lookAt.copy(target.lookAt);
      return;
    }
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

/** The hero palette is authored as exact colors; the scenario city is tuned for ACES. */
function ToneMapping({ enabled }: { enabled: boolean }) {
  const { gl } = useThree();
  const renderer = useRef(gl);
  useEffect(() => {
    renderer.current.toneMapping = enabled ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  }, [enabled]);
  return null;
}

function HeroModel({ entering, reducedMotion }: { entering: boolean; reducedMotion: boolean }) {
  const { size } = useThree();
  return (
    <>
      <ToneMapping enabled={false} />
      <FlowingCityGrid reducedMotion={reducedMotion} exiting={entering} />
      <FadeGroup visible={!entering} reducedMotion={reducedMotion}>
        <NeighborhoodSculpture compact={size.width < 769} reducedMotion={reducedMotion} />
      </FadeGroup>
    </>
  );
}

function Scene() {
  const { selectedSite, recommendedSite, lens, visualStage } = useExperience();
  const reducedMotion = Boolean(useReducedMotion());
  const isHero = visualStage === "hero" || visualStage === "entering";
  return (
    <>
      <fog attach="fog" args={["#061018", 11, 31]} />
      <ambientLight intensity={0.72} color="#7fb8c5" />
      <directionalLight position={[-5, 12, 5]} intensity={1.35} color="#a4efff" />
      <directionalLight position={[8, 5, -8]} intensity={0.68} color="#ffbd77" />
      <VisibilityController />
      <CameraRig stage={visualStage} reducedMotion={reducedMotion} />
      {isHero ? <HeroModel entering={visualStage === "entering"} reducedMotion={reducedMotion} /> : (
        <FadeGroup appear rate={2.4} reducedMotion={reducedMotion}>
          <ToneMapping enabled />
          <group position={[1.6, -1.35, 0]} rotation={[0, -0.12, 0]}>
            <CitySystems selectedSite={selectedSite} recommendedSite={recommendedSite} lens={lens} stage={visualStage} />
            <ProceduralCity stage={visualStage} />
          </group>
        </FadeGroup>
      )}
    </>
  );
}

// R3F reports a failed context asynchronously, outside the error boundary, so probe first.
function supportsWebGL() {
  const context = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
  context?.getExtension("WEBGL_lose_context")?.loseContext();
  return Boolean(context);
}

export default function TwinCanvas() {
  const { visualStage } = useExperience();
  const [webgl] = useState(supportsWebGL);
  const [initialPosition] = useState<[number, number, number]>(() => visualStage === "hero" ? [0, 6.5, 16] : [8.8, 9.8, 11.2]);
  if (!webgl) return <SceneFallback />;
  return (
    <div className="twin-canvas" aria-hidden="true">
      <Canvas camera={{ position: initialPosition, fov: 43, near: 0.1, far: 80 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <Scene />
      </Canvas>
    </div>
  );
}
