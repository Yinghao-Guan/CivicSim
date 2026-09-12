"use client";

import dynamic from "next/dynamic";

import BeforeAfter from "@/components/BeforeAfter";
import { reportPhotoUrl, reportRenderingUrl } from "@/lib/api";
import type { Area, Metrics, Proposal, Report } from "@/lib/types";

const ScanMap = dynamic(() => import("@/components/ScanMap"), { ssr: false });

type NumericMetric = Exclude<keyof Metrics, "capacity_utilization">;

export const METRICS: { key: NumericMetric; label: string; format: (v: number) => string; better: 1 | -1 }[] = [
  { key: "wheelchair_access", label: "Wheelchair users who can reach it", format: pct, better: 1 },
  { key: "population_reached", label: "Residents within 15 min", format: int, better: 1 },
  { key: "heat_vulnerable_reached", label: "Heat-vulnerable residents reached", format: int, better: 1 },
  { key: "average_heat_exposure", label: "Avg. heat exposure on the walk", format: (v) => `${v.toFixed(1)} min`, better: -1 },
];

function pct(v: number) { return `${Math.round(v * 100)}%`; }
function int(v: number) { return Math.round(v).toLocaleString("en-US"); }

const SOURCE_LABEL = { exif: "from photo", device: "phone location", manual: "pinned by hand" } as const;

export default function ReportView({ report, area }: { report: Report; area: Area }) {
  if (report.proposal) return <ProposalView report={report} proposal={report.proposal} area={area} />;
  const a = report.assessment;
  const headlineMetric = a.headline ? METRICS.find((m) => m.key === a.headline!.metric) : undefined;
  const changed = a.scenarios.filter((s) => METRICS.some((m) => s.before[m.key] !== s.after[m.key]));

  return (
    <article className="report">
      <header className="report-head">
        <div>
          <p className="kicker">Report #{report.id} · {new Date(report.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
          <h2>{a.issue.label}</h2>
          <p className="small muted">
            {report.detected
              ? `${report.detected.summary} (${Math.round(report.detected.confidence * 100)}% confident, ${report.detected.severity} severity)`
              : "Issue type chosen by the resident."}
          </p>
        </div>
      </header>

      <div className="report-grid">
        <div className="stack">
          <img className="photo" src={reportPhotoUrl(report.id)} alt={`Photo for report ${report.id}`} />
          <div className="map-frame board">
            <ScanMap
              key={report.id}
              area={area}
              pin={a.location}
              highlight={a.segment?.path ?? null}
              routesBefore={a.routes?.before}
              routesAfter={a.routes?.after}
              focusKey={report.id}
            />
          </div>
          <p className="tiny muted legend">
            Location {SOURCE_LABEL[report.location_source]}
            {a.routes && (
              <>
                {" · "}<span className="swatch signal" /> matched street
                <span className="swatch cool" /> walks to {a.headline?.label} after the fix
                <span className="swatch dashed" /> before
              </>
            )}
          </p>
        </div>

        <div className="stack">
          {a.status === "outside_area" && (
            <div className="card error">
              <strong>Outside the modeled neighborhood</strong>
              <p className="small">CivicSim currently models the blocks around The Beehive. No impact can be simulated for this location.</p>
            </div>
          )}

          <div className="card">
            <p className="kicker">Recommended fix</p>
            <p><strong>{a.issue.fix}</strong></p>
            <p className="small muted">Usually handled by {a.issue.agency}.</p>
          </div>

          {a.headline && headlineMetric && (
            <div className="card impact">
              <p className="kicker">Modeled impact · {a.headline.label}</p>
              <div className="big">
                <span className="before">{headlineMetric.format(a.headline.before)}</span>
                <span className="arrow">→</span>
                <span className="after">{headlineMetric.format(a.headline.after)}</span>
              </div>
              <p className="small">{headlineMetric.label}</p>
            </div>
          )}

          {a.status === "not_modeled" && (
            <div className="card">
              <strong>Not simulated yet</strong>
              <p className="small">The neighborhood model doesn&rsquo;t represent this kind of issue, so only the fix is shown, without invented numbers.</p>
            </div>
          )}

          {a.status === "modeled" && a.change && !a.headline && (
            <div className="card">
              <strong>No modeled change</strong>
              <p className="small">{a.change.description}</p>
            </div>
          )}

          {changed.length > 0 && (
            <div className="card">
              <p className="kicker">Every scenario it changes</p>
              {changed.map((s) => (
                <div key={s.scenario_id} className="scenario">
                  <p><strong>{s.label}</strong></p>
                  <table>
                    <tbody>
                      {METRICS.filter((m) => s.before[m.key] !== s.after[m.key]).map((m) => {
                        const delta = (s.after[m.key] - s.before[m.key]) * m.better;
                        return (
                          <tr key={m.key}>
                            <td>{m.label}</td>
                            <td className="num">{m.format(s.before[m.key])}</td>
                            <td className="num">→</td>
                            <td className={`num ${delta > 0 ? "good" : "bad"}`}>{m.format(s.after[m.key])}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {a.warnings.length > 0 && (
            <details className="assumptions">
              <summary>Assumptions &amp; caveats</summary>
              <ul>{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
        </div>
      </div>
    </article>
  );
}

// --- requests: a design proposal -------------------------------------------------

const STAGE_TEXT: Record<Proposal["state"], string> = {
  queued: "Queued…",
  analyzing: "Reading the street…",
  rendering: "Rendering the concept…",
  done: "",
  error: "",
};

function ProposalView({ report, proposal, area }: { report: Report; proposal: Proposal; area: Area }) {
  const a = report.assessment;
  const analysis = proposal.analysis;
  const renderingReady = proposal.state === "done" && proposal.rendering;
  const busy = proposal.state !== "done" && proposal.state !== "error";

  return (
    <article className="report">
      <header className="report-head">
        <p className="kicker">Resident request #{report.id} · {new Date(report.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
        <h2>{a.issue.label}</h2>
        {analysis && <p className="small muted">{analysis.street_summary}</p>}
      </header>

      <div className="proposal-grid">
        <div className="stack">
          {renderingReady ? (
            <BeforeAfter before={reportPhotoUrl(report.id)} after={reportRenderingUrl(report.id)} alt="The street" />
          ) : (
            <div className="before-after placeholder">
              <img src={reportPhotoUrl(report.id)} alt="The street today" />
              {busy && <div className="ba-busy"><span className="pulse-dot" /> {STAGE_TEXT[proposal.state]}</div>}
            </div>
          )}
          <p className="tiny muted">
            {renderingReady
              ? "Drag to compare. Concept image generated by AI from the resident's photo; not an engineering drawing."
              : proposal.rendering_error
                ? `Concept image unavailable: ${proposal.rendering_error}`
                : "The resident's photo."}
          </p>
        </div>

        <div className="stack">
          {proposal.state === "error" && (
            <div className="card error"><strong>Couldn&rsquo;t design this request</strong><p className="small">{proposal.error}</p></div>
          )}

          {!analysis && busy && <div className="card shimmer"><p className="muted">{STAGE_TEXT[proposal.state]}</p></div>}

          {analysis && (
            <>
              {!analysis.is_street && (
                <div className="card error"><p className="small">This photo may not show a street, so treat the design below with caution.</p></div>
              )}
              <div className="card design">
                <p className="kicker">Recommended design</p>
                <p className="design-name">{analysis.design_label}</p>
                <p className="small">{analysis.design_rationale}</p>
                <dl className="facts">
                  <div><dt>Space from</dt><dd>{analysis.space_source_label}</dd></div>
                  {analysis.side_of_street && <div><dt>Placement</dt><dd>{analysis.side_of_street}</dd></div>}
                  {analysis.travel_lanes !== null && <div><dt>Travel lanes today</dt><dd>{analysis.travel_lanes}</dd></div>}
                  {analysis.has_street_parking !== null && <div><dt>Street parking</dt><dd>{analysis.has_street_parking ? "Yes" : "No"}</dd></div>}
                </dl>
              </div>
            </>
          )}
        </div>
      </div>

      {analysis && (
        <div className="effects">
          <div className="card">
            <p className="kicker good-text">Who it helps</p>
            <EffectList items={analysis.benefits} />
          </div>
          <div className="card">
            <p className="kicker">What it trades off</p>
            <EffectList items={analysis.tradeoffs} />
          </div>
          <div className="card">
            <p className="kicker muted-text">Check on site</p>
            <ul className="questions">{analysis.open_questions.map((q) => <li key={q} className="small">{q}</li>)}</ul>
          </div>
        </div>
      )}

      <div className="proposal-footer">
        <div className="map-frame board small-map">
          <ScanMap key={report.id} area={area} pin={a.location} focusKey={report.id} />
        </div>
        <div className="stack">
          <p className="small"><strong>Next step:</strong> {a.issue.agency}</p>
          <details className="assumptions" open>
            <summary>Assumptions &amp; caveats</summary>
            <ul>
              <li>An AI reading of one photo, not a traffic, parking or engineering study.</li>
              {a.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </details>
        </div>
      </div>
    </article>
  );
}

function EffectList({ items }: { items: { group: string; effect: string }[] }) {
  if (!items.length) return <p className="small muted">None identified from the photo.</p>;
  return (
    <ul className="effect-list">
      {items.map((e) => (
        <li key={e.group + e.effect}>
          <strong>{e.group}</strong>
          <span className="small">{e.effect}</span>
        </li>
      ))}
    </ul>
  );
}
