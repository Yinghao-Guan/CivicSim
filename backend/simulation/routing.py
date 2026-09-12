"""Deterministic routing over the walking graph.

Routing never mutates the graph it is given. An agent that cannot use
inaccessible edges is routed over a read-only filtered view of the same
graph, so the constraint is what changes the route.
"""

from dataclasses import dataclass
from typing import Hashable, Iterable

import networkx as nx

from simulation.agents import Agent

#: Edge attribute holding travel time in minutes.
WEIGHT_ATTR = "travel_time"

#: Edge attribute marking an edge as traversable by a wheelchair user.
#: A missing value is treated as accessible.
ACCESSIBLE_ATTR = "wheelchair_accessible"

#: Reason values reported for agents that cannot reach the destination.
#: These match docs/03-api-contract.md section 9.
REASON_ACCESSIBILITY_BARRIER = "accessibility_barrier"
REASON_NO_ROUTE = "no_route"


@dataclass(frozen=True)
class Route:
    """A completed journey."""

    agent_id: str
    profile: str
    path: tuple[Hashable, ...]
    travel_time: float


@dataclass(frozen=True)
class Unreachable:
    """An agent that could not reach the destination, and why."""

    agent_id: str
    profile: str
    origin: Hashable
    reason: str


def inaccessible_edges(graph: nx.Graph) -> tuple[tuple[Hashable, Hashable], ...]:
    """Edges an agent requiring an accessible route may not traverse."""
    return tuple(
        (u, v)
        for u, v, accessible in graph.edges.data(ACCESSIBLE_ATTR, default=True)
        if not accessible
    )


def accessible_view(graph: nx.Graph) -> nx.Graph:
    """A read-only view of `graph` with inaccessible edges hidden.

    Uses `networkx.restricted_view`, so the original graph is untouched and no
    copy of the edge data is made.
    """
    return nx.restricted_view(graph, [], inaccessible_edges(graph))


def route_agent(
    graph: nx.Graph, agent: Agent, destination: Hashable
) -> Route | Unreachable:
    """Route one agent to `destination`, or explain why it cannot get there.

    Returns `Unreachable` rather than raising: an agent cut off from the
    destination is a result worth reporting, not an error.
    """
    routable = accessible_view(graph) if agent.requires_accessible_route else graph

    try:
        travel_time, path = nx.single_source_dijkstra(
            routable, agent.origin, destination, weight=WEIGHT_ATTR
        )
    except nx.NodeNotFound as exc:
        raise ValueError(
            f"Agent {agent.agent_id} origin {agent.origin!r} is not in the graph."
        ) from exc
    except nx.NetworkXNoPath:
        return Unreachable(
            agent_id=agent.agent_id,
            profile=agent.profile,
            origin=agent.origin,
            reason=_unreachable_reason(graph, agent, destination),
        )

    return Route(
        agent_id=agent.agent_id,
        profile=agent.profile,
        path=tuple(path),
        travel_time=travel_time,
    )


def route_agents(
    graph: nx.Graph, agents: Iterable[Agent], destination: Hashable
) -> tuple[Route | Unreachable, ...]:
    """Route every agent to `destination`, preserving input order."""
    return tuple(route_agent(graph, agent, destination) for agent in agents)


def _unreachable_reason(graph: nx.Graph, agent: Agent, destination: Hashable) -> str:
    """Distinguish a barrier from a genuinely disconnected origin.

    If an unconstrained walker could make the trip, the constraint is what
    blocked this agent.
    """
    if agent.requires_accessible_route and nx.has_path(graph, agent.origin, destination):
        return REASON_ACCESSIBILITY_BARRIER
    return REASON_NO_ROUTE
