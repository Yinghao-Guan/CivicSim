"use client";

/**
 * Scenario selection and the metrics that come back.
 *
 * Every figure shown here is read straight off a backend response. Nothing is
 * computed in this component beyond formatting, and the comparison marks a
 * leader only by comparing two numbers the backend produced.
 */

import type { CandidateSite, SimulationResponse } from "@/lib/contract";
import { facilityName, facilityShortName } from "@/lib/facilities";
import {
  SHADE_SITE_ID,
  SITE_B_APPROACH_SEGMENTS,
} from "@/lib/interventions";
import { BASELINE_ID, type ScenarioState } from "@/lib/useScenarios";

interface ScenarioPanelProps extends ScenarioState {
  focusMobility: boolean;
  onToggleFocusMobility: () => void;
}

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

/**
 * What the user's own edit changed.
 *
 * `before` is the unedited run of the same site, still in the cache; `after` is
 * the edited one. Both came from the backend, so the delta is a subtraction of
 * two simulated values, not an estimate of what shade "should" do.
 */
function EditedProposal({
  before,
  after,
  onRevert,
}: {
  before: SimulationResponse | undefined;
  after: SimulationResponse;
  onRevert: () => void;
}) {
  const beforeHeat = before?.metrics.average_heat_exposure;
  const afterHeat = after.metrics.average_heat_exposure;
  const drop =
    beforeHeat !== undefined && beforeHeat > 0
      ? (beforeHeat - afterHeat) / beforeHeat
      : null;

  // What the backend said about *this* run and not the unedited one: the
  // assumption behind the number above, in the backend's own words rather
  // than a copy of them kept in sync by hand.
  const editWarnings = before
    ? after.warnings.filter((w) => !before.warnings.includes(w))
    : [];

  return (
    <div className="edit">
      <p className="edit-flag">
        Your edit · {after.interventions.shade_segments.length} shaded segments
      </p>
      {beforeHeat !== undefined && (
        <p className="edit-delta">
          <span className="edit-was">{minutes(beforeHeat)}</span>
          <span className="edit-arrow">→</span>
          <span className="edit-now">{minutes(afterHeat)}</span>
          {drop !== null && (
            <span className="edit-drop">{share.format(drop)} less heat</span>
          )}
        </p>
      )}
      <p className="edit-note">
        Re-simulated over the shaded streets. Travel times are unchanged, so the
        same residents walk the same routes — in less sun.
      </p>
      {editWarnings.map((warning) => (
        <p key={warning} className="edit-assumption">
          {warning}
        </p>
      ))}
      <button type="button" className="panel-action" onClick={onRevert}>
        Remove shade
      </button>
    </div>
  );
}

/**
 * How the numbers above were produced.
 *
 * Everything shown comes from the response's own `run` block and `warnings`;
 * nothing is restated from memory. Collapsed by default so it never competes
 * with the metrics, but one click from any judge who asks.
 */
function HowCalculated({ scenario }: { scenario: SimulationResponse }) {
  const { run } = scenario;

  return (
    <details className="how">
      <summary>How this is calculated</summary>

      <p className="how-lede">
        Residents are <strong>synthetic</strong> — modeled travel needs and
        constraints, never real people. Every figure is a deterministic
        simulation over a walking graph, produced to{" "}
        <strong>compare scenarios against each other</strong>. These are not
        forecasts of what will happen.
      </p>

      <dl className="how-fields">
        <dt>Model</dt>
        <dd>{run.model_version}</dd>

        <dt>Population</dt>
        <dd>{run.population_version}</dd>

        <dt>Agents simulated</dt>
        <dd>{integer.format(run.agent_count)}</dd>

        <dt>Routes returned</dt>
        <dd>{integer.format(run.route_sample_count)}</dd>

        <dt>Seed</dt>
        <dd>{run.seed === null ? "none — cohort is enumerated" : run.seed}</dd>
      </dl>

      {scenario.warnings.length > 0 && (
        <ul className="how-warnings">
          {scenario.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Side-by-side once more than one scenario has been run. */
function Comparison({
  results,
  candidates,
}: {
  results: Record<string, SimulationResponse>;
  candidates: CandidateSite[];
}) {
  // Canonical runs only: an edited run shares its site's name, so including it
  // would list the same site twice with no way to tell the rows apart. The
  // edit gets its own before/after panel instead.
  const runs = Object.values(results).filter(
    (r) => r.selected_site !== null && r.scenario_id === r.selected_site,
  );
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
              <th scope="row">
                {candidates.find((c) => c.id === run.selected_site)?.name ??
                  run.selected_site}
                <span className="compare-facility">
                  {facilityShortName(run.selected_site)}
                </span>
              </th>
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
          {facilityShortName(mostReach)} reaches the most residents, but{" "}
          {facilityShortName(mostAccessible)} serves mobility-constrained
          residents better. There is no single best site.
        </p>
      )}
    </div>
  );
}

export default function ScenarioPanel(props: ScenarioPanelProps) {
  const { focusMobility, onToggleFocusMobility, ...state } = props;
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
    runIntervention,
    retry,
  } = state;

  const edited = (active?.interventions.shade_segments.length ?? 0) > 0;
  const canShade =
    active !== null && !edited && active.selected_site === SHADE_SITE_ID;

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
          <h2>{edited ? "Site B + shade" : "Cooling center"}</h2>
          {facilityName(active?.selected_site ?? null) ? (
            <p className="panel-facility">
              {facilityName(active?.selected_site ?? null)}
            </p>
          ) : (
            <p className="panel-id">{active?.scenario_id ?? "—"}</p>
          )}
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

          {active.routes.length > 0 && (
            <button
              type="button"
              className={`focus-toggle${focusMobility ? " is-on" : ""}`}
              aria-pressed={focusMobility}
              onClick={onToggleFocusMobility}
            >
              <span className="focus-dot" aria-hidden="true" />
              {focusMobility
                ? "Showing mobility-constrained"
                : "Focus mobility-constrained"}
            </button>
          )}

          {edited && (
            <EditedProposal
              before={active.selected_site ? results[active.selected_site] : undefined}
              after={active}
              onRevert={() => select(SHADE_SITE_ID)}
            />
          )}

          {canShade && (
            <button
              type="button"
              className="panel-action panel-action--edit"
              disabled={running !== null}
              onClick={() =>
                runIntervention(SHADE_SITE_ID, SITE_B_APPROACH_SEGMENTS)
              }
            >
              {running ? "Simulating…" : "Add shade to approach"}
            </button>
          )}
        </>
      ) : (
        <p className="panel-id">Running…</p>
      )}

      {/*
        Hidden while an edit is on screen. The edit's own before/after is the
        thing being explained at that moment, and on a 768px-tall projector the
        full table pushes it below the fold — the one place a scroll would cost
        the demo. Removing the shade brings the table straight back.
      */}
      {!edited && <Comparison results={results} candidates={candidates} />}

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

      {active && <HowCalculated scenario={active} />}
    </aside>
  );
}
