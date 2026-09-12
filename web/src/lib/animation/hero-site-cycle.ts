import type { SiteId } from "@/lib/experience-types";

// The hero sculpture lives in the persistent canvas while its caption lives in the
// route layer, so the candidate currently being tested is shared through a tiny store.
let current: SiteId = "a";
const listeners = new Set<() => void>();

export const heroSiteCycle = {
  get: () => current,
  getServer: (): SiteId => "a",
  set(site: SiteId) {
    if (site === current) return;
    current = site;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
