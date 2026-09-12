"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { seededRandom } from "@/lib/animation/seeded-random";

type FlowingCityGridProps = {
  opacity?: number;
  reducedMotion?: boolean;
  exiting?: boolean;
};

const SPACING = 1.35;
const EXTENT = 14;

const surface = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vGround;

  float elevation(vec2 ground) {
    return -2.5
      + sin(ground.x * 0.38 + ground.y * 0.18 + uTime * 0.32) * 0.48
      + cos(ground.y * 0.37 - uTime * 0.26) * 0.22;
  }

  float edgeFade(vec2 ground) {
    float radius = length((ground + vec2(0.0, 3.0)) / vec2(22.0, 24.0));
    return 1.0 - smoothstep(0.42, 1.0, radius);
  }
`;

const lineVertex = /* glsl */ `
  ${surface}
  attribute float aWeight;
  varying float vWeight;

  void main() {
    vGround = position.xz;
    vWeight = aWeight;
    gl_Position = projectionMatrix * modelViewMatrix
      * vec4(position.x, elevation(vGround), position.z, 1.0);
  }
`;

const lineFragment = /* glsl */ `
  ${surface}
  varying float vWeight;

  void main() {
    float passing = pow(max(0.0, sin(vGround.x * 0.3 + vGround.y * 0.22 - uTime * 0.3)), 7.0);
    float alpha = (0.12 + vWeight * 0.12 + passing * 0.055) * edgeFade(vGround) * uOpacity;
    gl_FragColor = vec4(0.39, 0.61, 0.67, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const nodeVertex = /* glsl */ `
  ${surface}
  attribute float aWeight;
  varying float vWeight;

  void main() {
    vGround = position.xz;
    vWeight = aWeight;
    vec4 viewPosition = modelViewMatrix * vec4(position.x, elevation(vGround) + 0.008, position.z, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp((25.0 + 20.0 * aWeight) / -viewPosition.z, 1.2, 3.8);
  }
`;

const nodeFragment = /* glsl */ `
  ${surface}
  varying float vWeight;

  void main() {
    float disc = 1.0 - smoothstep(0.22, 0.5, length(gl_PointCoord - 0.5));
    float alpha = disc * (0.32 + vWeight * 0.26) * edgeFade(vGround) * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(0.60, 0.78, 0.80, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const packetVertex = /* glsl */ `
  ${surface}
  attribute vec2 aStart;
  attribute vec2 aCorner;
  attribute vec2 aEnd;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aTail;
  varying float vTail;

  void main() {
    float firstLength = distance(aStart, aCorner);
    float secondLength = distance(aCorner, aEnd);
    float totalLength = firstLength + secondLength;
    float traveled = fract(aPhase + (uTime * aSpeed - aTail * 0.10) / totalLength) * totalLength;
    vec2 ground = traveled < firstLength
      ? mix(aStart, aCorner, traveled / firstLength)
      : mix(aCorner, aEnd, (traveled - firstLength) / secondLength);
    vGround = ground;
    vTail = aTail;
    vec4 viewPosition = modelViewMatrix * vec4(ground.x, elevation(ground) + 0.015, ground.y, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(47.0 / -viewPosition.z, 1.5, 4.0);
  }
`;

const packetFragment = /* glsl */ `
  ${surface}
  varying float vTail;

  void main() {
    float disc = 1.0 - smoothstep(0.10, 0.5, length(gl_PointCoord - 0.5));
    float alpha = disc * (0.70 - vTail * 0.12) * edgeFade(vGround) * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(0.60, 0.83, 0.84, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const faceFragment = /* glsl */ `
  ${surface}
  varying float vWeight;

  void main() {
    gl_FragColor = vec4(0.29, 0.49, 0.53, (0.024 + vWeight * 0.02) * edgeFade(vGround) * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeGeometry(attributes: Record<string, { values: number[]; size: number }>) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, { values, size }] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  }
  return geometry;
}

function createGrid() {
  const random = seededRandom(2093);
  const lines: number[] = [];
  const lineWeights: number[] = [];
  const nodes: number[] = [];
  const nodeWeights: number[] = [];
  const faces: number[] = [];
  const faceWeights: number[] = [];

  // Subdividing the streets lets their silhouette rise and fall as one surface.
  for (let index = -EXTENT; index <= EXTENT; index += 1) {
    const coordinate = index * SPACING;
    const weight = index % 4 === 0 ? 1 : 0.18;
    for (let segment = -EXTENT * 5; segment < EXTENT * 5; segment += 1) {
      const from = segment * SPACING / 5;
      const to = (segment + 1) * SPACING / 5;
      lines.push(coordinate, 0, from, coordinate, 0, to);
      lines.push(from, 0, coordinate, to, 0, coordinate);
      lineWeights.push(weight, weight, weight, weight);
    }
    for (let cross = -EXTENT; cross <= EXTENT; cross += 1) {
      if (random() < 0.47) continue;
      nodes.push(coordinate, 0, cross * SPACING);
      nodeWeights.push(random());
      if (random() > 0.065 || index === EXTENT || cross === EXTENT) continue;
      const z = cross * SPACING;
      faces.push(coordinate, 0, z, coordinate + SPACING, 0, z, coordinate + SPACING, 0, z + SPACING);
      const faceWeight = random();
      faceWeights.push(faceWeight, faceWeight, faceWeight);
    }
  }

  const packets = {
    position: { values: [] as number[], size: 3 },
    aStart: { values: [] as number[], size: 2 },
    aCorner: { values: [] as number[], size: 2 },
    aEnd: { values: [] as number[], size: 2 },
    aPhase: { values: [] as number[], size: 1 },
    aSpeed: { values: [] as number[], size: 1 },
    aTail: { values: [] as number[], size: 1 },
  };

  // Each point follows an L-shaped journey, so the motion reads as city traffic.
  for (let index = 0; index < 76; index += 1) {
    const startX = (Math.floor(random() * 23) - 11) * SPACING;
    const startZ = (Math.floor(random() * 23) - 11) * SPACING;
    const endX = startX + (random() > 0.5 ? 1 : -1) * (2 + Math.floor(random() * 5)) * SPACING;
    const endZ = startZ + (random() > 0.5 ? 1 : -1) * (2 + Math.floor(random() * 5)) * SPACING;
    const turnAcross = random() > 0.5;
    const phase = random();
    const speed = 0.35 + random() * 0.33;
    for (let tail = 0; tail < 4; tail += 1) {
      packets.position.values.push(startX, -2.5, startZ);
      packets.aStart.values.push(startX, startZ);
      packets.aCorner.values.push(turnAcross ? endX : startX, turnAcross ? startZ : endZ);
      packets.aEnd.values.push(endX, endZ);
      packets.aPhase.values.push(phase);
      packets.aSpeed.values.push(speed);
      packets.aTail.values.push(tail);
    }
  }

  return {
    streets: makeGeometry({ position: { values: lines, size: 3 }, aWeight: { values: lineWeights, size: 1 } }),
    junctions: makeGeometry({ position: { values: nodes, size: 3 }, aWeight: { values: nodeWeights, size: 1 } }),
    faces: makeGeometry({ position: { values: faces, size: 3 }, aWeight: { values: faceWeights, size: 1 } }),
    packets: makeGeometry(packets),
  };
}

/** A quiet street network, drawn in four calls and animated entirely on the GPU. */
export default function FlowingCityGrid({ opacity = 1, reducedMotion = false, exiting = false }: FlowingCityGridProps) {
  const geometry = useMemo(() => createGrid(), []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uOpacity: { value: 1 } }), []);
  const faceMaterial = useRef<THREE.ShaderMaterial>(null);
  const streetMaterial = useRef<THREE.ShaderMaterial>(null);
  const nodeMaterial = useRef<THREE.ShaderMaterial>(null);
  const packetMaterial = useRef<THREE.ShaderMaterial>(null);
  const time = useRef(0);
  const fade = useRef(1);

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.05);
    if (!reducedMotion) time.current += step;
    fade.current = THREE.MathUtils.damp(fade.current, exiting ? 0 : 1, 4.5, step);
    // R3F preserves each material's own uniform wrappers, so synchronize values.
    for (const material of [faceMaterial.current, streetMaterial.current, nodeMaterial.current, packetMaterial.current]) {
      if (!material) continue;
      material.uniforms.uTime.value = time.current;
      material.uniforms.uOpacity.value = opacity * fade.current;
    }
  });

  useEffect(() => () => {
    Object.values(geometry).forEach((item) => item.dispose());
  }, [geometry]);

  return (
    <group>
      <mesh geometry={geometry.faces} frustumCulled={false}>
        <shaderMaterial ref={faceMaterial} vertexShader={lineVertex} fragmentShader={faceFragment} uniforms={uniforms} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={geometry.streets} frustumCulled={false}>
        <shaderMaterial ref={streetMaterial} vertexShader={lineVertex} fragmentShader={lineFragment} uniforms={uniforms} transparent depthWrite={false} />
      </lineSegments>
      <points geometry={geometry.junctions} frustumCulled={false}>
        <shaderMaterial ref={nodeMaterial} vertexShader={nodeVertex} fragmentShader={nodeFragment} uniforms={uniforms} transparent depthWrite={false} />
      </points>
      <points geometry={geometry.packets} frustumCulled={false}>
        <shaderMaterial ref={packetMaterial} vertexShader={packetVertex} fragmentShader={packetFragment} uniforms={uniforms} transparent depthWrite={false} />
      </points>
    </group>
  );
}
