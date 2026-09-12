/**
 * The real buildings behind Site A, B and C.
 *
 * The map workstream surveyed these inside the demo area
 * (docs/05-map-milestone-plan.md §3.4) and the backend places each candidate on
 * that facility's coordinates. They are display labels only: the scenario ids
 * (`site_a`, `site_b`, `site_c`) and the contract's `name` field are unchanged,
 * so nothing downstream depends on the strings below.
 *
 * If the backend ever moves a candidate to a different building, these names
 * must move with it — they are the one place the frontend restates something
 * the backend knows.
 */

const FACILITIES: Record<string, { full: string; short: string }> = {
  site_a: {
    full: "Augustus F. Hawkins Natural Park",
    short: "Hawkins Park",
  },
  site_b: {
    full: "Mary McLeod Bethune Swimming Pool",
    short: "Bethune Pool",
  },
  site_c: {
    full: "Slauson Senior Multipurpose Center",
    short: "Slauson Senior Center",
  },
};

/** The facility's full name, or null if we have no name for that site. */
export function facilityName(siteId: string | null): string | null {
  return siteId ? (FACILITIES[siteId]?.full ?? null) : null;
}

/** A short form that fits in a table cell. Falls back to the site id. */
export function facilityShortName(siteId: string | null): string {
  if (!siteId) return "—";
  return FACILITIES[siteId]?.short ?? siteId;
}
