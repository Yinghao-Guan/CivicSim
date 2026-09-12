"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { glslColor, thermalGlsl } from "@/components/scene/glsl-color";
import { heroSiteCycle } from "@/lib/animation/hero-site-cycle";
import { seededRandom } from "@/lib/animation/seeded-random";
import { HERO_PALETTE } from "@/lib/hero-palette";
import type { SiteId } from "@/lib/experience-types";

type Point = [number, number, number];
type Segment = [Point, Point];
type Flat = [number, number];

// Street centerlines. Blocks sit between neighbors; each block holds a 2 x 2 grid of lots.
const STREETS_X = [-2.9, -0.85, 0.95, 2.9];
const STREETS_Z = [-2.9, -1.0, 1.0, 2.9];
const MARGIN = 0.17;
const GAP = 0.14;

/** Seconds spent testing each candidate before moving to the next. */
const PERIOD = 5.6;
/** Walking reach shown by the coverage ring, in sculpture units. */
const REACH = 1.85;
const RING_MAX = 2.4;

type Lot = { x: number; z: number; w: number; d: number; col: number; row: number; lx: number; lz: number };
type Site = { id: SiteId; lot: Lot; entranceZ: number };
type Home = { x: number; z: number; routes: { points: Flat[]; length: number; distance: number }[] };

function lotAt(col: number, row: number, lx: number, lz: number): Lot {
  const x0 = STREETS_X[col] + MARGIN;
  const z0 = STREETS_Z[row] + MARGIN;
  const w = (STREETS_X[col + 1] - MARGIN - x0 - GAP) / 2;
  const d = (STREETS_Z[row + 1] - MARGIN - z0 - GAP) / 2;
  return { x: x0 + w / 2 + lx * (w + GAP), z: z0 + d / 2 + lz * (d + GAP), w, d, col, row, lx, lz };
}

// The three candidate lots mirror the scenario's sites A, B and C.
const SITES: Site[] = ([["a", 0, 0, 1, 1], ["b", 1, 1, 1, 0], ["c", 2, 2, 0, 0]] as const).map(([id, col, row, lx, lz]) => ({
  id,
  lot: lotAt(col, row, lx, lz),
  entranceZ: lz === 0 ? STREETS_Z[row] : STREETS_Z[row + 1],
}));

function rectangle(x: number, y: number, z: number, w: number, d: number): Segment[] {
  const corners: Point[] = [[x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2], [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2]];
  return corners.map((p, i) => [p, corners[(i + 1) % 4]]);
}

function box(x: number, z: number, w: number, d: number, h: number): Segment[] {
  return [
    ...rectangle(x, 0.035, z, w, d),
    ...rectangle(x, h, z, w, d),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz): Segment => [[x + sx * w / 2, 0.035, z + sz * d / 2], [x + sx * w / 2, h, z + sz * d / 2]])),
  ];
}

function polylineLength(points: Flat[]) {
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
}

function pointAlong(points: Flat[], distance: number, out: THREE.Vector3) {
  let remaining = distance;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const length = Math.hypot(bx - ax, bz - az);
    if (remaining <= length || i === points.length - 1) {
      const t = length === 0 ? 1 : Math.min(1, remaining / length);
      return out.set(ax + (bx - ax) * t, 0.07, az + (bz - az) * t);
    }
    remaining -= length;
  }
  return out;
}

function createNeighborhood() {
  const random = seededRandom(5117);
  const buildings: { x: number; z: number; w: number; d: number; h: number; gable: boolean }[] = [];
  const homes: Home[] = [];
  const siteKeys = new Set(SITES.map(({ lot }) => `${lot.col}${lot.row}${lot.lx}${lot.lz}`));

  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) for (let lx = 0; lx < 2; lx++) for (let lz = 0; lz < 2; lz++) {
    if (siteKeys.has(`${col}${row}${lx}${lz}`)) continue;
    const lot = lotAt(col, row, lx, lz);
    const occupancy = random();
    const kind = random();
    // Keep the view onto each candidate open: lots just in front of a site stay low.
    const screensSite = SITES.some(({ lot: site }) => Math.abs(site.x - lot.x) < 1.2 && lot.z > site.z && lot.z - site.z < 2.1);
    if (occupancy < 0.2) continue;
    const gable = screensSite || kind < 0.45;
    const tower = !screensSite && kind > 0.9 && row === 0;
    const h = gable ? 0.24 + random() * 0.12 : tower ? 0.95 + random() * 0.3 : 0.42 + random() * 0.3;
    const d = lot.d * (0.56 + random() * 0.22);
    buildings.push({ x: lot.x, z: lot.z, w: lot.w * (0.56 + random() * 0.22), d, h, gable });

    // Residents step out the front door, reach the nearest avenue, then follow streets to the site.
    const avenue = lx === 0 ? STREETS_X[col] : STREETS_X[col + 1];
    const door = lot.z + d / 2 + 0.08;
    homes.push({
      x: lot.x,
      z: door,
      routes: SITES.map(({ lot: site, entranceZ }) => {
        const points: Flat[] = [[lot.x, door], [avenue, door], [avenue, entranceZ], [site.x, entranceZ], [site.x, site.z]];
        return { points, length: polylineLength(points), distance: Math.hypot(lot.x - site.x, door - site.z) };
      }),
    });
  }

  const buildingLines: Segment[] = buildings.flatMap(({ x, z, w, d, h, gable }) => {
    const edges = box(x, z, w, d, h);
    if (gable) {
      const peak = h + 0.16;
      edges.push(
        [[x - w / 2, h, z - d / 2], [x, peak, z - d / 2]], [[x, peak, z - d / 2], [x + w / 2, h, z - d / 2]],
        [[x - w / 2, h, z + d / 2], [x, peak, z + d / 2]], [[x, peak, z + d / 2], [x + w / 2, h, z + d / 2]],
        [[x, peak, z - d / 2], [x, peak, z + d / 2]],
      );
    }
    return edges;
  });
  const windows: Segment[] = buildings.filter(({ gable }) => !gable).flatMap(({ x, z, w, d, h }) =>
    Array.from({ length: Math.max(1, Math.floor((h - 0.1) / 0.2)) }, (_, i): Segment => [[x - w * 0.3, 0.17 + i * 0.2, z + d / 2 + 0.004], [x + w * 0.3, 0.17 + i * 0.2, z + d / 2 + 0.004]]));

  const streets: Segment[] = [
    ...STREETS_X.map((x): Segment => [[x, 0.02, STREETS_Z[0]], [x, 0.02, STREETS_Z[3]]]),
    ...STREETS_Z.map((z): Segment => [[STREETS_X[0], 0.02, z], [STREETS_X[3], 0.02, z]]),
  ];
  const base = rectangle(0, -0.1, 0, 5.8, 5.8);
  const underlay = [...rectangle(0, -0.52, 0, 5.8, 5.8), ...rectangle(0, -0.9, 0, 5.8, 5.8)];
  for (const x of [-2.9, 2.9]) for (const z of [-2.9, 2.9]) underlay.push([[x, -0.9, z], [x, -0.1, z]]);
  for (let i = -2; i <= 2; i++) underlay.push([[i, -0.52, -2.9], [i, -0.52, 2.9]], [[-2.9, -0.52, i], [2.9, -0.52, i]]);

  const routes = SITES.map((_, siteIndex) => homes
    .filter((home) => home.routes[siteIndex].distance < REACH)
    .flatMap((home) => home.routes[siteIndex].points.slice(1).map((p, i): Segment => {
      const a = home.routes[siteIndex].points[i];
      return [[a[0], 0.045, a[1]], [p[0], 0.045, p[1]]];
    })));

  return { buildings, buildingLines, windows, streets, base, underlay, homes, routes };
}

const smooth = (value: number) => THREE.MathUtils.smoothstep(value, 0, 1);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function segmentsGeometry(segments: Segment[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments.flat(2), 3));
  return geometry;
}

function Linework({ segments, color, opacity = 1 }: { segments: Segment[]; color: string; opacity?: number }) {
  const geometry = useMemo(() => segmentsGeometry(segments), [segments]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} fog={false} />
    </lineSegments>
  );
}

const buildingVertex = /* glsl */ `
  varying vec3 vPosition;
  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const buildingFragment = /* glsl */ `
  uniform vec2 uSite;
  uniform float uReach;
  uniform float uOpacity;
  varying vec3 vPosition;

  void main() {
    float d = distance(vPosition.xz, uSite);
    float inside = (1.0 - smoothstep(uReach - 0.3, uReach, d)) * step(0.05, uReach);
    float edge = exp(-pow((d - uReach) / 0.14, 2.0)) * step(0.05, uReach);
    vec3 ink = mix(${glslColor(HERO_PALETTE.building.low)}, ${glslColor(HERO_PALETTE.building.high)}, smoothstep(0.0, 1.3, vPosition.y));
    ink = mix(ink, ${glslColor(HERO_PALETTE.building.reached)}, inside * 0.8);
    ink = mix(ink, ${glslColor(HERO_PALETTE.building.edge)}, edge * 0.85);
    gl_FragColor = vec4(ink, (0.55 + inside * 0.4 + edge * 0.3) * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const coverageVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const coverageFragment = /* glsl */ `
  uniform float uReach;
  uniform float uStrength;
  uniform float uOpacity;
  uniform float uTime;
  uniform vec2 uSite;
  varying vec2 vUv;

  void main() {
    // The plane lies flat, so its v axis runs along -z on the board.
    vec2 offset = (vUv * 2.0 - 1.0) * ${RING_MAX.toFixed(2)};
    vec2 board = uSite + vec2(offset.x, -offset.y);
    if (max(abs(board.x), abs(board.y)) > ${STREETS_X[3].toFixed(2)}) discard;
    float d = length(offset);
    float ring = exp(-pow((d - uReach) / 0.03, 2.0));
    float inside = 1.0 - smoothstep(uReach - 0.03, uReach, d);
    float ripple = pow(max(0.0, sin(d * 9.0 - uTime * 2.4)), 12.0) * inside * 0.07;
    float alpha = (ring * 0.9 + inside * 0.025 + ripple) * uStrength * uOpacity * step(0.02, uReach);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(${glslColor(HERO_PALETTE.reach.ring)}, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Surface heat on the shared thermal ramp, washed toward paper so the neighborhood stays quieter
// than the background grid; inside the reach ring the ground cools toward blue.
const heatFragment = /* glsl */ `
  uniform vec2 uSite;
  uniform float uReach;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;

  float blob(vec2 p, vec2 center, float radius) {
    return exp(-dot(p - center, p - center) / (radius * radius));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  ${thermalGlsl}

  void main() {
    vec2 offset = (vUv * 2.0 - 1.0) * ${STREETS_X[3].toFixed(2)};
    vec2 board = vec2(offset.x, -offset.y);
    float drift = fbm(board * 0.8 + vec2(uTime * 0.04, -uTime * 0.03));
    float heat = 0.62 * blob(board, vec2(-1.7, 1.5), 1.6) + 0.55 * blob(board, vec2(1.9, -1.3), 1.3)
      + 0.45 * blob(board, vec2(1.3, 2.1), 1.0) + 0.3 * blob(board, vec2(-1.6, -1.9), 1.2);
    // Open ground sits in the green-to-yellow range; the blobs push blocks into orange and red.
    heat = clamp(0.3 + heat * 0.8 + drift * 0.45 - 0.1, 0.0, 1.0);
    float cooled = (1.0 - smoothstep(uReach * 0.35, uReach, distance(board, uSite))) * step(0.05, uReach);
    float edge = 1.0 - smoothstep(${(STREETS_X[3] - 0.25).toFixed(2)}, ${STREETS_X[3].toFixed(2)}, max(abs(board.x), abs(board.y)));
    heat *= 1.0 - cooled * 0.95;
    vec3 color = mix(thermal(heat), ${glslColor(HERO_PALETTE.board.slab)}, 0.4);
    float alpha = mix(0.12 + heat * 0.26, 0.26, cooled);
    gl_FragColor = vec4(color, alpha * edge * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function letterTexture(letter: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(48, 48, 40, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = color;
    context.font = "600 46px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(letter, 48, 51);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function pinShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(-0.2, 0.34, -0.61, 0.76, -0.61, 1.14);
  shape.absarc(0, 1.14, 0.61, Math.PI, 0, true);
  shape.bezierCurveTo(0.61, 0.76, 0.2, 0.34, 0, 0);
  const border = new THREE.CatmullRomCurve3(shape.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0.018)), true, "centripetal");
  return { shape, border };
}

type NeighborhoodSculptureProps = { reducedMotion?: boolean; compact?: boolean };

export default function NeighborhoodSculpture({ reducedMotion = false, compact = false }: NeighborhoodSculptureProps) {
  const { size } = useThree();
  const aspect = size.width / size.height;
  const neighborhood = useMemo(() => createNeighborhood(), []);
  const pin = useMemo(() => pinShape(), []);
  const labels = useMemo(() => SITES.map(({ id }) => letterTexture(id.toUpperCase(), HERO_PALETTE.lot.label)), []);
  const buildingGeometry = useMemo(() => segmentsGeometry(neighborhood.buildingLines), [neighborhood]);
  const facility = useMemo(() => {
    const { w, d } = SITES[0].lot;
    const fw = w * 0.86;
    const fd = d * 0.86;
    const lines = box(0, 0, fw, fd, 0.46);
    lines.push(...rectangle(0, 0.52, 0, fw * 1.14, fd * 1.14));
    for (const t of [-0.3, -0.1, 0.1, 0.3]) lines.push([[t * fw, 0.035, fd / 2], [t * fw, 0.46, fd / 2]]);
    return { geometry: segmentsGeometry(lines), w: fw, d: fd };
  }, []);
  const lotOutlines = useMemo(() => SITES.map(({ lot }) => {
    const geometry = segmentsGeometry(rectangle(lot.x, 0.03, lot.z, lot.w, lot.d));
    new THREE.LineSegments(geometry).computeLineDistances();
    return geometry;
  }), []);
  const routeGeometries = useMemo(() => neighborhood.routes.map(segmentsGeometry), [neighborhood]);

  const body = useRef<THREE.Group>(null);
  const pinGroup = useRef<THREE.Group>(null);
  const facilityGroup = useRef<THREE.Group>(null);
  const coverage = useRef<THREE.Mesh>(null);
  const residents = useRef<THREE.InstancedMesh>(null);
  const homeDots = useRef<THREE.InstancedMesh>(null);
  const lotMaterials = useRef<(THREE.LineDashedMaterial | null)[]>([]);
  const routeMaterials = useRef<(THREE.LineBasicMaterial | null)[]>([]);
  const facilityFill = useRef<THREE.MeshBasicMaterial>(null);
  const facilityLines = useRef<THREE.LineBasicMaterial>(null);
  const time = useRef(0);

  const buildingUniforms = useMemo(() => ({ uSite: { value: new THREE.Vector2() }, uReach: { value: 0 }, uOpacity: { value: 1 } }), []);
  const coverageUniforms = useMemo(() => ({ uSite: { value: new THREE.Vector2() }, uReach: { value: 0 }, uStrength: { value: 0 }, uOpacity: { value: 1 }, uTime: { value: 0 } }), []);
  // R3F gives each shader material its own uniform wrappers, so write through the materials.
  const buildingMaterial = useRef<THREE.ShaderMaterial>(null);
  const coverageMaterial = useRef<THREE.ShaderMaterial>(null);
  const heatMaterial = useRef<THREE.ShaderMaterial>(null);
  const heatUniforms = useMemo(() => ({ uSite: { value: new THREE.Vector2() }, uReach: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 1 } }), []);
  const scratch = useMemo(() => ({ dummy: new THREE.Object3D(), color: new THREE.Color(), rest: new THREE.Color(HERO_PALETTE.home.rest), reached: new THREE.Color(HERO_PALETTE.home.reached), missed: new THREE.Color(HERO_PALETTE.home.missed) }), []);
  const walkerOrder = useMemo(() => SITES.map((_, siteIndex) => neighborhood.homes
    .map((home, index) => ({ index, route: home.routes[siteIndex] }))
    .filter(({ route }) => route.distance < REACH)
    .sort((a, b) => a.route.length - b.route.length)), [neighborhood]);

  useEffect(() => () => {
    [buildingGeometry, facility.geometry, ...lotOutlines, ...routeGeometries].forEach((item) => item.dispose());
    labels.forEach((texture) => texture.dispose());
  }, [buildingGeometry, facility, labels, lotOutlines, routeGeometries]);

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.05);
    if (!reducedMotion) time.current += step;
    // Reduced motion holds a finished test of the recommended site instead of cycling.
    const siteIndex = reducedMotion ? 2 : Math.floor(time.current / PERIOD) % SITES.length;
    const local = reducedMotion ? 3.8 : time.current % PERIOD;
    const site = SITES[siteIndex].lot;
    const previous = SITES[(siteIndex + SITES.length - 1) % SITES.length].lot;
    heroSiteCycle.set(SITES[siteIndex].id);

    const { dummy, color } = scratch;
    const outro = 1 - smooth((local - (PERIOD - 0.6)) / 0.5);
    const firstCycle = !reducedMotion && time.current < PERIOD;

    if (body.current) {
      body.current.rotation.y = -0.48 + Math.sin(time.current * 0.17) * 0.07;
      body.current.position.y = (compact ? -2.35 : -0.2) + Math.sin(time.current * 0.55) * 0.07;
    }

    if (pinGroup.current) {
      const travel = firstCycle ? 1 : easeInOut(Math.min(1, local / 0.95));
      pinGroup.current.position.set(
        THREE.MathUtils.lerp(previous.x, site.x, travel),
        0.98 + Math.sin(Math.PI * travel) * 0.55 + Math.sin(time.current * 0.8) * 0.05,
        THREE.MathUtils.lerp(previous.z, site.z, travel),
      );
    }

    const rise = smooth((local - 0.7) / 0.6) * outro;
    if (facilityGroup.current) {
      facilityGroup.current.position.set(site.x, 0, site.z);
      facilityGroup.current.scale.set(1, Math.max(0.001, rise), 1);
    }
    if (facilityFill.current) facilityFill.current.opacity = facilityFill.current.userData.baseOpacity = 0.14 * rise;
    if (facilityLines.current) facilityLines.current.opacity = facilityLines.current.userData.baseOpacity = rise;

    const reach = REACH * (1 - (1 - smooth((local - 1.1) / 1.4)) ** 2) * outro;
    const settled = smooth((local - 2.3) / 0.7) * outro;
    if (buildingMaterial.current) {
      buildingMaterial.current.uniforms.uSite.value.set(site.x, site.z);
      buildingMaterial.current.uniforms.uReach.value = reach;
    }
    if (heatMaterial.current) {
      heatMaterial.current.uniforms.uSite.value.set(site.x, site.z);
      heatMaterial.current.uniforms.uReach.value = reach;
      heatMaterial.current.uniforms.uTime.value = time.current;
    }
    if (coverageMaterial.current) {
      coverageMaterial.current.uniforms.uSite.value.set(site.x, site.z);
      coverageMaterial.current.uniforms.uReach.value = reach;
      coverageMaterial.current.uniforms.uStrength.value = outro;
      coverageMaterial.current.uniforms.uTime.value = time.current;
    }
    coverage.current?.position.set(site.x, 0.04, site.z);

    SITES.forEach((_, index) => {
      const lotMaterial = lotMaterials.current[index];
      if (lotMaterial) lotMaterial.color.set(index === siteIndex ? HERO_PALETTE.lot.active : HERO_PALETTE.lot.idle);
      const routeMaterial = routeMaterials.current[index];
      if (routeMaterial) routeMaterial.opacity = routeMaterial.userData.baseOpacity = index === siteIndex ? 0.5 * settled : 0;
    });

    if (homeDots.current) {
      neighborhood.homes.forEach((home, index) => {
        const inReach = home.routes[siteIndex].distance < REACH;
        color.copy(scratch.rest).lerp(inReach ? scratch.reached : scratch.missed, settled * (inReach ? 0.85 : 0.9));
        homeDots.current?.setColorAt(index, color);
      });
      if (homeDots.current.instanceColor) homeDots.current.instanceColor.needsUpdate = true;
    }

    if (residents.current) {
      const order = walkerOrder[siteIndex];
      let instance = 0;
      for (let wave = 0; wave < 2; wave++) {
        order.forEach(({ route }, rank) => {
          const start = 1.5 + wave * 1.9 + rank * 0.09;
          const traveled = (local - start) * 1.35;
          const active = traveled > 0 && traveled < route.length && local < PERIOD - 0.25;
          pointAlong(route.points, Math.max(0, traveled), dummy.position);
          const edgeFade = Math.min(1, traveled / 0.25, (route.length - traveled) / 0.25);
          dummy.scale.setScalar(active ? Math.max(0.001, edgeFade) * (rank % 3 === 0 ? 1 : 0.75) : 0.001);
          dummy.updateMatrix();
          residents.current?.setMatrixAt(instance++, dummy.matrix);
        });
      }
      for (; instance < residents.current.count; instance++) {
        dummy.scale.setScalar(0.001);
        dummy.updateMatrix();
        residents.current.setMatrixAt(instance, dummy.matrix);
      }
      residents.current.instanceMatrix.needsUpdate = true;
    }
  });

  const homeMatrices = (mesh: THREE.InstancedMesh | null) => {
    homeDots.current = mesh;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    neighborhood.homes.forEach((home, index) => {
      dummy.position.set(home.x, 0.05, home.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, scratch.rest);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  const fills = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    neighborhood.buildings.forEach(({ x, z, w, d, h }, index) => {
      dummy.position.set(x, h / 2, z);
      dummy.scale.set(w * 0.985, h * 0.985, d * 0.985);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  return (
    <group
      ref={body}
      position={[compact ? 0 : aspect * 2.7, compact ? -2.35 : -0.2, 0]}
      rotation={[0.2, -0.48, 0]}
      scale={compact ? Math.min(0.95, aspect * 1.75) : Math.min(1.22, aspect * 0.75)}
    >
      <mesh position={[0, -0.13, 0]}><boxGeometry args={[5.8, 0.06, 5.8]} /><meshBasicMaterial color={HERO_PALETTE.board.slab} fog={false} /></mesh>
      <mesh position={[0, -0.095, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <planeGeometry args={[STREETS_X[3] * 2, STREETS_X[3] * 2]} />
        <shaderMaterial ref={heatMaterial} vertexShader={coverageVertex} fragmentShader={heatFragment} uniforms={heatUniforms} transparent depthWrite={false} />
      </mesh>
      <Linework segments={neighborhood.base} color={HERO_PALETTE.board.base} opacity={0.6} />
      <Linework segments={neighborhood.underlay} color={HERO_PALETTE.board.underlay} opacity={0.34} />
      <Linework segments={neighborhood.streets} color={HERO_PALETTE.board.street} opacity={0.6} />

      <instancedMesh ref={fills} args={[undefined, undefined, neighborhood.buildings.length]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color={HERO_PALETTE.building.fill} fog={false} />
      </instancedMesh>
      <lineSegments geometry={buildingGeometry}>
        <shaderMaterial ref={buildingMaterial} vertexShader={buildingVertex} fragmentShader={buildingFragment} uniforms={buildingUniforms} transparent depthWrite={false} />
      </lineSegments>
      <Linework segments={neighborhood.windows} color={HERO_PALETTE.building.window} opacity={0.7} />

      {SITES.map(({ id, lot }, index) => (
        <group key={id}>
          <lineSegments geometry={lotOutlines[index]}>
            <lineDashedMaterial ref={(material) => { lotMaterials.current[index] = material; }} color={HERO_PALETTE.lot.idle} dashSize={0.07} gapSize={0.05} transparent opacity={0.85} depthWrite={false} fog={false} />
          </lineSegments>
          <lineSegments geometry={routeGeometries[index]}>
            <lineBasicMaterial ref={(material) => { routeMaterials.current[index] = material; }} color={HERO_PALETTE.reach.route} transparent opacity={0} depthWrite={false} fog={false} />
          </lineSegments>
          <sprite position={[lot.x - lot.w / 2 - 0.02, 0.2, lot.z + lot.d / 2 + 0.02]} scale={0.24}>
            <spriteMaterial map={labels[index]} transparent opacity={0.9} depthWrite={false} fog={false} />
          </sprite>
        </group>
      ))}

      {/* The reach ring reads as an analysis layer, so it draws over the architecture. */}
      <mesh ref={coverage} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} frustumCulled={false}>
        <planeGeometry args={[RING_MAX * 2, RING_MAX * 2]} />
        <shaderMaterial ref={coverageMaterial} vertexShader={coverageVertex} fragmentShader={coverageFragment} uniforms={coverageUniforms} transparent depthWrite={false} depthTest={false} />
      </mesh>

      <instancedMesh ref={homeMatrices} args={[undefined, undefined, neighborhood.homes.length]} frustumCulled={false}>
        <circleGeometry args={[0.045, 12]} />
        <meshBasicMaterial transparent opacity={0.95} depthWrite={false} fog={false} />
      </instancedMesh>

      <group ref={facilityGroup}>
        <lineSegments geometry={facility.geometry}>
          <lineBasicMaterial ref={facilityLines} color={HERO_PALETTE.facility.line} transparent depthWrite={false} fog={false} />
        </lineSegments>
        <mesh position={[0, 0.23, 0]}>
          <boxGeometry args={[facility.w, 0.46, facility.d]} />
          <meshBasicMaterial ref={facilityFill} color={HERO_PALETTE.facility.fill} transparent opacity={0} depthWrite={false} fog={false} />
        </mesh>
      </group>

      <instancedMesh ref={residents} args={[undefined, undefined, neighborhood.homes.length * 2]} frustumCulled={false}>
        <sphereGeometry args={[0.036, 6, 6]} />
        <meshBasicMaterial color={HERO_PALETTE.reach.resident} fog={false} />
      </instancedMesh>

      <group ref={pinGroup} rotation={[-0.2, 0.48, 0]} scale={0.72}>
        <mesh><shapeGeometry args={[pin.shape, 48]} /><meshBasicMaterial color={HERO_PALETTE.pin.fill} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} fog={false} /></mesh>
        <mesh><tubeGeometry args={[pin.border, 100, 0.022, 5, true]} /><meshBasicMaterial color={HERO_PALETTE.pin.line} fog={false} /></mesh>
        <mesh position={[0, 1.14, 0.015]}><ringGeometry args={[0.245, 0.275, 48]} /><meshBasicMaterial color={HERO_PALETTE.pin.line} side={THREE.DoubleSide} fog={false} /></mesh>
        <mesh position={[0, 1.14, 0.01]}><circleGeometry args={[0.24, 48]} /><meshBasicMaterial color={HERO_PALETTE.pin.hole} side={THREE.DoubleSide} fog={false} /></mesh>
      </group>
    </group>
  );
}
