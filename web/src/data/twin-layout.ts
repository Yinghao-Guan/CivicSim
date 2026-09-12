import * as THREE from "three";

import { seededRandom } from "@/lib/animation/seeded-random";
import type { SiteId } from "@/lib/types";

export type BuildingDatum = {
  position: [number, number, number];
  scale: [number, number, number];
  tone: number;
};

function makeBuildings() {
  const random = seededRandom(24791);
  const buildings: BuildingDatum[] = [];
  const avenues = new Set([-4, 1, 5]);
  const streets = new Set([-5, -1, 4]);

  for (let x = -8; x <= 8; x += 1) {
    for (let z = -7; z <= 7; z += 1) {
      if (avenues.has(x) || streets.has(z) || random() < 0.12) continue;
      const width = 0.5 + random() * 0.28;
      const depth = 0.48 + random() * 0.32;
      const height = 0.28 + random() * 1.45 + (Math.abs(x) < 3 && Math.abs(z) < 3 ? random() * 0.65 : 0);
      buildings.push({
        position: [x * 0.92 + (random() - 0.5) * 0.12, height / 2, z * 0.92 + (random() - 0.5) * 0.12],
        scale: [width, height, depth],
        tone: random(),
      });
    }
  }
  return buildings;
}

export const BUILDINGS = makeBuildings();

export const SITE_POSITIONS: Record<SiteId, THREE.Vector3> = {
  a: new THREE.Vector3(-3.7, 0.12, -1.0),
  b: new THREE.Vector3(0.9, 0.12, 1.6),
  c: new THREE.Vector3(4.7, 0.12, 3.7),
};

const origins = [
  new THREE.Vector3(-7.2, 0.16, 5.5),
  new THREE.Vector3(-6.8, 0.16, -5.6),
  new THREE.Vector3(6.7, 0.16, -5.2),
  new THREE.Vector3(7.2, 0.16, 1.1),
  new THREE.Vector3(-1.8, 0.16, 6.1),
];

function path(origin: THREE.Vector3, target: THREE.Vector3, bend: number) {
  const midpoint = origin.clone().lerp(target, 0.5);
  midpoint.x += bend;
  midpoint.z -= bend * 0.45;
  midpoint.y = 0.19;
  return new THREE.CatmullRomCurve3([origin, midpoint, target]);
}

export const SITE_ROUTES: Record<SiteId, THREE.CatmullRomCurve3[]> = {
  a: origins.slice(0, 4).map((origin, index) => path(origin, SITE_POSITIONS.a, (index - 1.5) * 0.45)),
  b: origins.map((origin, index) => path(origin, SITE_POSITIONS.b, (index - 2) * 0.35)),
  c: origins.slice(0, 4).map((origin, index) => path(origin, SITE_POSITIONS.c, (index - 1.5) * 0.52)),
};

export const BLOCKED_SEGMENTS = [
  [new THREE.Vector3(2.7, 0.23, 1.0), new THREE.Vector3(3.5, 0.23, 1.75)],
  [new THREE.Vector3(3.7, 0.23, 2.2), new THREE.Vector3(4.25, 0.23, 2.8)],
  [new THREE.Vector3(4.3, 0.23, 3.0), new THREE.Vector3(4.65, 0.23, 3.45)],
] as const;
