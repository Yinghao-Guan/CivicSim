"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { BLOCKED_SEGMENTS, SITE_POSITIONS, SITE_ROUTES } from "@/data/twin-layout";
import type { Lens, SiteId, VisualStage } from "@/lib/experience-types";

function CityGrid() {
  return (
    <group>
      <gridHelper args={[34, 34, "#175d6d", "#0c303e"]} position={[0, 0, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]}>
        <planeGeometry args={[38, 38]} />
        <meshStandardMaterial color="#06131c" roughness={0.9} metalness={0.05} />
      </mesh>
    </group>
  );
}

function HeatFields() {
  const fields = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!fields.current) return;
    fields.current.children.forEach((child, index) => {
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = 0.08 + Math.sin(clock.elapsedTime * 0.55 + index) * 0.025;
    });
  });
  return (
    <group ref={fields}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-4.8, 0.035, 3.8]} scale={[3.5, 2.2, 1]}>
        <circleGeometry args={[1, 48]} /><meshBasicMaterial color="#ff7a42" transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[4.9, 0.04, -2.7]} scale={[2.7, 1.8, 1]}>
        <circleGeometry args={[1, 48]} /><meshBasicMaterial color="#f5a24c" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function RouteMeshes({ selectedSite, lens, stage }: { selectedSite: SiteId; lens: Lens; stage: VisualStage }) {
  const visible = stage === "simulate" || stage === "results";
  return (
    <group>
      {SITE_ROUTES[selectedSite].map((curve, index) => (
        <mesh key={`${selectedSite}-${index}`}>
          <tubeGeometry args={[curve, 42, 0.025, 5, false]} />
          <meshBasicMaterial color={lens === "mobility" ? "#4cf4ff" : "#17d9f4"} transparent opacity={visible ? 0.76 : 0.16} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function FlowParticles({ selectedSite, stage }: { selectedSite: SiteId; stage: VisualStage }) {
  const count = 54;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const offsets = useMemo(() => Array.from({ length: count }, (_, index) => (index * 0.173) % 1), []);
  const visible = stage === "simulate" || stage === "results" || stage === "hero";

  useFrame(({ clock }) => {
    if (!mesh.current || !visible) return;
    const routes = SITE_ROUTES[selectedSite];
    offsets.forEach((offset, index) => {
      const route = routes[index % routes.length];
      const t = (offset + clock.elapsedTime * 0.055) % 1;
      const point = route.getPointAt(t);
      dummy.position.copy(point);
      dummy.scale.setScalar(0.75 + Math.sin(index + clock.elapsedTime * 2) * 0.15);
      dummy.updateMatrix();
      mesh.current?.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} visible={visible}>
      <sphereGeometry args={[0.045, 6, 6]} />
      <meshBasicMaterial color="#bafaff" transparent opacity={0.92} blending={THREE.AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  );
}

function CandidateBeacons({ recommendedSite, stage }: { recommendedSite: SiteId; stage: VisualStage }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.children.forEach((child, index) => {
      const id = (["a", "b", "c"] as SiteId[])[index];
      const pulse = 1 + Math.sin(clock.elapsedTime * 2.2 + index) * 0.08;
      const base = id === recommendedSite ? 1.28 : 0.9;
      child.scale.setScalar(base * pulse);
    });
  });
  const show = stage !== "hero";
  return (
    <group ref={group} visible={show}>
      {(["a", "b", "c"] as SiteId[]).map((id) => {
        const active = id === recommendedSite;
        const position = SITE_POSITIONS[id];
        const color = active ? "#ffb65c" : "#32def4";
        return (
          <group key={id} position={position}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.2, 0.28, 36]} /><meshBasicMaterial color={color} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
            <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.018, 0.055, 1.05, 8]} /><meshBasicMaterial color={color} transparent opacity={0.72} blending={THREE.AdditiveBlending} /></mesh>
            <pointLight color={color} intensity={active ? 2.1 : 0.8} distance={3.5} decay={2} position={[0, 0.4, 0]} />
          </group>
        );
      })}
    </group>
  );
}

function BlockedSegments({ lens, stage }: { lens: Lens; stage: VisualStage }) {
  const visible = lens === "mobility" && stage === "results";
  return (
    <group visible={visible}>
      {BLOCKED_SEGMENTS.map(([start, end], index) => {
        const curve = new THREE.LineCurve3(start, end);
        return (
          <mesh key={index}>
            <tubeGeometry args={[curve, 8, 0.055, 6, false]} />
            <meshBasicMaterial color="#ff795f" transparent opacity={0.95} blending={THREE.AdditiveBlending} />
          </mesh>
        );
      })}
    </group>
  );
}

function PointCloud() {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const array = new Float32Array(420 * 3);
    for (let i = 0; i < 420; i += 1) {
      const angle = i * 2.399;
      const radius = 7 + (i % 37) * 0.18;
      array[i * 3] = Math.cos(angle) * radius;
      array[i * 3 + 1] = 0.4 + (i % 19) * 0.12;
      array[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return array;
  }, []);
  useFrame((_, delta) => { if (points.current) points.current.rotation.y += delta * 0.006; });
  return (
    <points ref={points}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#50ddec" size={0.025} transparent opacity={0.28} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

export default function CitySystems(props: { selectedSite: SiteId; recommendedSite: SiteId; lens: Lens; stage: VisualStage }) {
  return (
    <>
      <CityGrid />
      <HeatFields />
      <PointCloud />
      <RouteMeshes selectedSite={props.selectedSite} lens={props.lens} stage={props.stage} />
      <FlowParticles selectedSite={props.selectedSite} stage={props.stage} />
      <CandidateBeacons recommendedSite={props.recommendedSite} stage={props.stage} />
      <BlockedSegments lens={props.lens} stage={props.stage} />
    </>
  );
}
