"""Purpose-built demo neighborhood: walking graph, cohort, candidate sites.

The geometry is synthetic and deliberately small so every route can be checked
by hand. It is *inputs* that are designed, not outputs: the simulation still
does real routing over this graph, and the metrics follow from wherever the
agents can actually walk.

Layout, west to east:

    res_w1  res_w2          res_mid              res_e1 res_e2 res_e3
        \\     /              /    \\                  \\    |    /
         \\   /              /      \\                   \\   |   /
          j_w ---- site_b  /        j_c1 --[STAIRS]-- j_e ---- site_c
           \\              /           \\                /
        [NO RAMP]        /             \\-- j_bypass --/
             \\          /                 (long accessible way round)
            site_a -----/

Two facts about the geometry drive the whole demo:

1. The eastern cluster holds most of the population and sits next to Site C,
   but is more than 15 minutes from Site B.
2. The only short link between west/middle and east is a flight of steps. The
   accessible way round adds 11 minutes, which puts Site C out of reach for
   mobility-constrained residents who are not already in the east.

Site A is a third option with no accessible entrance at all.
"""

import networkx as nx

from simulation.agents import Agent
from simulation.routing import ACCESSIBLE_ATTR, HEAT_ATTR, WEIGHT_ATTR
from simulation.scenarios import CandidateSite

#: (u, v, travel_time_minutes, wheelchair_accessible, heat_exposure_minutes)
#: Every edge declares accessibility explicitly - there is no implicit default
#: in the demo data.
DEMO_EDGES: tuple[tuple[str, str, float, bool, float], ...] = (
    # Western residential streets
    ("res_w1", "j_w", 2.0, True, 1.0),
    ("res_w2", "j_w", 3.0, True, 1.5),
    # Site B sits on a shaded street just off the western junction
    ("j_w", "site_b", 3.0, True, 1.0),
    # Site A is further out, and its only entrance is up a flight of steps
    ("j_w", "site_a", 9.0, False, 7.0),
    # The middle of the neighborhood connects both ways
    ("res_mid", "j_w", 4.0, True, 2.0),
    ("res_mid", "j_c1", 5.0, True, 4.0),
    # The short east-west link is a stepped pedestrian crossing
    ("j_c1", "j_e", 3.0, False, 2.5),
    # ... and the accessible alternative is a long detour
    ("j_c1", "j_bypass", 9.0, True, 8.0),
    ("j_bypass", "j_e", 2.0, True, 1.5),
    # Eastern residential streets, hotter and less shaded
    ("res_e1", "j_e", 2.0, True, 1.8),
    ("res_e2", "j_e", 2.0, True, 1.8),
    ("res_e3", "j_e", 3.0, True, 2.6),
    # Site C sits beside the eastern junction
    ("j_e", "site_c", 2.0, True, 1.6),
)

#: (agent_id, profile, origin, requires_accessible_route, weight, heat_vulnerable)
DEMO_COHORT: tuple[tuple[str, str, str, bool, float, bool], ...] = (
    # Eastern cluster: most of the population
    ("agent_e1", "heat_vulnerable", "res_e1", False, 900, True),
    ("agent_e2", "general", "res_e2", False, 900, False),
    ("agent_e3", "heat_vulnerable", "res_e3", False, 900, True),
    # Western cluster
    ("agent_w1", "heat_vulnerable", "res_w1", False, 400, True),
    ("agent_w2", "general", "res_w2", False, 400, False),
    # Middle
    ("agent_m1", "general", "res_mid", False, 500, False),
    # Mobility-constrained residents, mostly west and middle
    ("agent_w3", "mobility_constrained", "res_w1", True, 120, True),
    ("agent_w4", "mobility_constrained", "res_w2", True, 120, True),
    ("agent_m2", "mobility_constrained", "res_mid", True, 100, True),
    ("agent_e4", "mobility_constrained", "res_e2", True, 40, True),
)

#: Same capacity at every site: one budget, one building size, three locations.
DEMO_SITE_CAPACITY = 1800

#: Illustrative coordinates in South LA, in [longitude, latitude] order.
#: They position the demo on a map; they are not surveyed facility locations.
CANDIDATE_SITES: tuple[CandidateSite, ...] = (
    CandidateSite(
        id="site_a",
        name="Site A",
        node="site_a",
        capacity=DEMO_SITE_CAPACITY,
        location=(-118.3000, 34.0100),
        estimated_setup_cost=310_000,
        accessible_entrance=False,
    ),
    CandidateSite(
        id="site_b",
        name="Site B",
        node="site_b",
        capacity=DEMO_SITE_CAPACITY,
        location=(-118.2914, 34.0128),
        estimated_setup_cost=470_000,
        accessible_entrance=True,
    ),
    CandidateSite(
        id="site_c",
        name="Site C",
        node="site_c",
        capacity=DEMO_SITE_CAPACITY,
        location=(-118.2820, 34.0080),
        estimated_setup_cost=390_000,
        accessible_entrance=True,
    ),
)


def build_demo_graph() -> nx.Graph:
    """The demo walking graph. Deterministic: same edges, same order, always."""
    graph = nx.Graph()
    for u, v, travel_time, accessible, heat in DEMO_EDGES:
        graph.add_edge(
            u,
            v,
            **{
                WEIGHT_ATTR: travel_time,
                ACCESSIBLE_ATTR: accessible,
                HEAT_ATTR: heat,
            },
        )
    return graph


def build_demo_cohort() -> tuple[Agent, ...]:
    """The synthetic cohort. No sampling, so no seed is needed."""
    return tuple(
        Agent(
            agent_id=agent_id,
            profile=profile,
            origin=origin,
            requires_accessible_route=constrained,
            population_weight=weight,
            heat_vulnerable=heat_vulnerable,
        )
        for agent_id, profile, origin, constrained, weight, heat_vulnerable in DEMO_COHORT
    )


def site(site_id: str) -> CandidateSite:
    """Look up one candidate site by its contract id."""
    for candidate in CANDIDATE_SITES:
        if candidate.id == site_id:
            return candidate
    known = ", ".join(candidate.id for candidate in CANDIDATE_SITES)
    raise ValueError(f"Unknown cooling center {site_id!r}; expected one of {known}.")
