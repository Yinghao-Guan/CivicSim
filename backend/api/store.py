"""In-memory scenario store.

There is no database for the hackathon MVP, so results live in process memory
and disappear on restart - the contract says the frontend must not depend on
server persistence.

The store's one real rule: the canonical unshaded scenarios (`baseline`,
`site_a`, `site_b`, `site_c`) are written once at startup and can never be
replaced. A later run that applies an intervention is a different scenario and
must be stored under its own id, so comparison against the unmodified
proposal keeps working.
"""

from typing import Iterable, Sequence

from simulation.scenarios import ScenarioResult


def derive_scenario_id(site_id: str, shade_segments: Sequence[str]) -> str:
    """The id a run is stored under.

    Without interventions a run *is* the canonical scenario for that site. With
    interventions it gets a distinct id built from the segments applied, so it
    sits alongside the canonical result rather than on top of it.
    """
    if not shade_segments:
        return site_id
    applied = "_".join(sorted(shade_segments))
    return f"{site_id}__shade_{applied}"


class ScenarioStore:
    """Scenario results keyed by scenario id."""

    def __init__(self) -> None:
        self._results: dict[str, ScenarioResult] = {}
        self._canonical: frozenset[str] = frozenset()

    def preload_canonical(self, results: Iterable[ScenarioResult]) -> None:
        """Seed the canonical scenarios and freeze them against overwriting."""
        for result in results:
            self._results[result.scenario_id] = result
        self._canonical = frozenset(self._results)

    def put(self, scenario_id: str, result: ScenarioResult) -> None:
        """Store a derived scenario result.

        Refuses canonical ids outright: silently dropping the write would hide
        a real bug, and honouring it would corrupt the comparison baseline.
        """
        if scenario_id in self._canonical:
            raise ValueError(
                f"Scenario {scenario_id!r} is canonical and cannot be replaced."
            )
        self._results[scenario_id] = result

    def get(self, scenario_id: str) -> ScenarioResult | None:
        """The stored result, or None if this id was never run."""
        return self._results.get(scenario_id)

    def is_canonical(self, scenario_id: str) -> bool:
        return scenario_id in self._canonical

    @property
    def scenario_ids(self) -> tuple[str, ...]:
        return tuple(self._results)
