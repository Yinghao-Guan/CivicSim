export type SiteId = "a" | "b" | "c";

export type GroupId = "all" | "heat" | "mobility";

export type LayerState = {
  heat: boolean;
  residents: boolean;
  routes: boolean;
  facilities: boolean;
};
