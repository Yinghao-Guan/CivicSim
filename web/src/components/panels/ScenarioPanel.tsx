"use client";

/**
 * Scenario selection and the metrics that come back.
 *
 * Every figure shown here is read straight off a backend response. Nothing is
 * computed in this component beyond formatting, and the comparison marks a
 * leader only by comparing two numbers the backend produced.
 */

import type { SimulationResponse } from "@/lib/contract";
import { BASELINE_ID, type ScenarioState } from "@/lib/useScenarios";

const integer = new Intl.NumberFormat("en-US");
const share = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

function minutes(value: number): string {
  return `${value.toFixed(1)} min`;
}

function utilisation(value: number | null): string {
  // Contract §7: above 1.0 means demand exceeds the modeled capacity.
  return value === null ? "—" : share.format(value);
}

function Metrics({ scenario }: { scenario: SimulationResponse }) {
  const m = scenario.metrics;
  return (
    <dl className="panel-fields">
      <dt>Residents reached</dt>
      <dd>{integer.format(m.population_reached)}</dd>

      <dt>Heat-vulnerable</dt>
      <dd>{integer.format(m.heat_vulnerable_reached)}</dd>

      <dt>Wheelchair access</dt>
      <dd>{share.format(m.wheelchair_access)}</dd>

      <dt>Avg heat exposure</dt>
      <dd>{minutes(m.average_heat_exposure)}</dd>

      <dt>Capacity used</dt>
      <dd>
        {utilisation(m.capacity_utilization)}
        {m.capacity_utilization !== null && m.capacity_utilization > 1 && (
          <span className="panel-note">over capacity</span>
        )}
      </dd>

      <dt>Cut off</dt>
      <dd>
        {integer.format(scenario.unreachable_agents.length)} of{" "}
        {integer.format(scenario.run.agent_count)} agents
      </dd>
    </dl>
  );
}

/** Side-by-side once more than one scenario has been run. */
function Comparison({ results }: { results: Record<string, SimulationResponse> }) {
  const runs = Object.values(results).filter((r) => r.selected_site !== null);
  if (runs.length < 2) return null;

  const best = (pick: (r: SimulationResponse) => number) =>
    runs.reduce((a, b) => (pick(b) > pick(a) ? b : a)).scenario_id;
  const mostReach = best((r) => r.metrics.population_reached);
  const mostAccessible = best((r) => r.metrics.wheelchair_access);

  return (
    <div className="compare">
      <h3>Comparison</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Site</th>
            <th scope="col">Reached</th>
            <th scope="col">Wheelchair</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.scenario_id}>
              <th scope="row">{run.selected_site}</th>
              <td className={run.scenario_id === mostReach ? "compare-lead" : undefined}>
                {integer.format(run.metrics.population_reached)}
              </td>
              <td
                className={
                  run.scenario_id === mostAccessible ? "compare-lead" : undefined
                }
              >
                {share.format(run.metrics.wheelchair_access)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {runs.length > 1 && mostReach !== mostAccessible && (
        <p className="compare-note">
          {mostReach} reaches the most residents, but {mostAccessible} serves
          mobility-constrained residents better. There is no single best site.
        </p>
      )}
    </div>
  );
}

export default function ScenarioPanel(state: ScenarioState) {
  const {
    load,
    loadError,
    candidates,
    results,
    activeId,
    active,
    running,
    runError,
    select,
    runAllCandidates,
    retry,
  } = state;

  if (load === "loading") {
    return (
      <aside className="panel panel--scenario" aria-label="Simulation">
        <p className="panel-id">Contacting the simulation backend…</p>
      </aside>
    );
  }

  if (load === "failed") {
    return (
      <aside className="panel panel--scenario" aria-label="Simulation">
        <header className="panel-head">
          <h2>Backend unavailable</h2>
        </header>
        <p className="panel-error">{loadError}</p>
        <p className="panel-footnote">
          Start it with <code>uv run uvicorn main:app --reload</code> in{" "}
          <code>backend/</code>, then retry. The map itself is local and keeps
          working without it.
        </p>
        <button type="button" className="panel-action" onClick={retry}>
          Retry
        </button>
      </aside>
    );
  }

  return (
    <aside className="panel panel--scenario" aria-label="Simulation">
      <header className="panel-head">
        <div>
          <h2>Cooling center</h2>
          <p className="panel-id">
            {active ? active.scenario_id : "—"} · {active?.run.model_version}
          </p>
        </div>
      </header>

      <div className="scenario-choices">
        <button
          type="button"
          className={activeId === BASELINE_ID ? "is-active" : undefined}
          onClick={() => select(BASELINE_ID)}
        >
          Today
        </button>
        {candidates.map((site) => (
          <button
            key={site.id}
            type="button"
            className={activeId === site.id ? "is-active" : undefined}
            disabled={running !== null}
            onClick={() => select(site.id)}
          >
            {running === site.id ? "…" : site.name}
          </button>
        ))}
      </div>

      {runError && <p className="panel-error">{runError}</p>}

      {active ? (
        <>
          {active.selected_site === null && (
            <p className="panel-badge">
              Current state: the nearest cooling center is outside a 15-minute
              walk for everyone modeled.
            </p>
          )}
          <Metrics scenario={active} />
        </>
      ) : (
        <p className="panel-id">Running…</p>
      )}

      <Comparison results={results} />

      {Object.keys(results).length <= candidates.length && (
        <button
          type="button"
          className="panel-action"
          disabled={running !== null}
          onClick={runAllCandidates}
        >
          {running ? "Simulating…" : "Run all sites"}
        </button>
      )}

      {active?.warnings.length ? (
        <p className="panel-footnote">{active.warnings.join(" ")}</p>
      ) : null}
    </aside>
  );
}
