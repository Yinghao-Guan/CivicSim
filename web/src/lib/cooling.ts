/**
 * Client for GET /cooling/nearest (docs/03-api-contract.md section 12a).
 * Every distance and minute shown for a clicked building comes from here.
 */

import { apiGet } from "@/lib/api";
import type { Coordinate } from "@/lib/contract";

export interface CoolingWalk {
  id: string;
  name: string;
  facility_type: string;
  location: Coordinate;
  walk_metres: number;
  walk_minutes: number;
  path: Coordinate[];
}

export interface NearestCooling {
  origin: Coordinate;
  places: CoolingWalk[];
}

export function fetchNearestCooling([lon, lat]: Coordinate, limit = 3): Promise<NearestCooling> {
  return apiGet<NearestCooling>(`/cooling/nearest?lon=${lon}&lat=${lat}&limit=${limit}`);
}

export const FACILITY_LABELS: Record<string, string> = {
  school: "School",
  community_centre: "Community center",
  sports_centre: "Pool & sports center",
};
