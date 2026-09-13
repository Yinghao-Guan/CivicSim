"use client";

/**
 * Ask CivicSim — the planning assistant, inside the studio's results stage.
 *
 * The assistant reads priorities and picks between scenarios the simulation
 * has already run. It never produces a result: the figures below come from the
 * response's `evidence`, which the backend fills from the deterministic run,
 * and the shade action re-runs the real simulation through the studio's own
 * intervention flow rather than showing anything the model wrote.
 *
 * If the assistant is unavailable the rest of the studio is untouched, so this
 * card fails on its own and says so. A cached answer is labelled as cached.
 */

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";

import { GOAL_PRESETS, askCivicSim, type AiRecommendation } from "@/lib/ai";
import { ApiError } from "@/lib/api";
import { facilityName } from "@/lib/facilities";
import { SHADE_SITE_ID } from "@/lib/interventions";

const integer = new Intl.NumberFormat("en-US");
const percent = (value: number) => `${Math.round(value * 100)}%`;

interface PlannerCardProps {
  /** Show a site in the studio. Wired to the studio's own focus + select. */
  onFocusSite: (siteId: string) => void;
  /** Run the real shade intervention through the studio's existing flow. */
  onApplyShade: () => void;
  /** True once the shade run is already on screen. */
  shadeActive: boolean;
  busy: boolean;
}

export default function PlannerCard({
  onFocusSite,
  onApplyShade,
  shadeActive,
  busy,
}: PlannerCardProps) {
  const [goal, setGoal] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiRecommendation | null>(null);

  async function ask(question: string) {
    if (!question.trim() || asking) return;
    setAsking(true);
    setError(null);
    try {
      const recommendation = await askCivicSim(question);
      setResult(recommendation);
      // Show the recommended scenario through the studio's normal path.
      onFocusSite(recommendation.recommended_site);
    } catch (cause) {
      setResult(null);
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Ask CivicSim is unavailable right now.",
      );
    } finally {
      setAsking(false);
    }
  }

  const evidence = result?.evidence.find(
    (entry) => entry.site_id === result.recommended_site,
  );
  const canShade =
    result?.suggested_action === "add_site_b_shade" &&
    result.recommended_site === SHADE_SITE_ID;

  return (
    <section className="studio-ai" aria-label="Ask CivicSim">
      <div className="studio-ai__head">
        <Sparkles size={16} />
        <div>
          <strong>Ask CivicSim</strong>
          <small>
            Say what matters. The simulation has already run — the assistant
            only reads its results.
          </small>
        </div>
      </div>

      <div className="studio-ai__presets">
        {GOAL_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={asking}
            onClick={() => {
              setGoal(preset.goal);
              void ask(preset.goal);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form
        className="studio-ai__form"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(goal);
        }}
      >
        <input
          type="text"
          value={goal}
          maxLength={500}
          placeholder="reach the most people, but don't leave wheelchair users behind"
          onChange={(event) => setGoal(event.target.value)}
          aria-label="What matters to you"
        />
        <button type="submit" disabled={asking || !goal.trim()}>
          {asking ? <Loader2 size={13} className="spin" /> : "Ask"}
        </button>
      </form>

      {error && (
        <p className="studio-ai__error">
          {error}
          <span>The simulation and every result above keep working.</span>
        </p>
      )}

      {result && evidence && (
        <div className="studio-ai__result">
          {result.source === "cached" && (
            <p className="studio-ai__cached">
              Cached answer — the assistant is offline
              <span>
                Captured {result.captured_at} from {result.model}. Not a live
                response. The figures below are still simulated fresh.
              </span>
            </p>
          )}

          <p className="studio-ai__flag">Recommends</p>
          <h3>{facilityName(result.recommended_site) ?? evidence.name}</h3>
          <p className="studio-ai__summary">{result.summary}</p>

          <dl className="studio-ai__evidence">
            <div>
              <dt>Residents reached</dt>
              <dd>{integer.format(evidence.metrics.population_reached)}</dd>
            </div>
            <div>
              <dt>Wheelchair access</dt>
              <dd>{percent(evidence.metrics.wheelchair_access)}</dd>
            </div>
            <div>
              <dt>Heat en route</dt>
              <dd>{evidence.metrics.average_heat_exposure.toFixed(1)} min</dd>
            </div>
            <div>
              <dt>Capacity used</dt>
              <dd
                className={
                  (evidence.metrics.capacity_utilization ?? 0) > 1
                    ? "is-warning"
                    : ""
                }
              >
                {evidence.metrics.capacity_utilization === null
                  ? "—"
                  : percent(evidence.metrics.capacity_utilization)}
              </dd>
            </div>
          </dl>
          <p className="studio-ai__source">
            Figures from the simulation, not the assistant.
          </p>

          <p className="studio-ai__tradeoff">
            <span>Tradeoff</span>
            {result.tradeoff}
          </p>

          {canShade && !shadeActive && (
            <button
              type="button"
              className="studio-ai__apply"
              disabled={busy}
              onClick={onApplyShade}
            >
              Apply shade suggestion
            </button>
          )}

          <p className="studio-ai__model">
            {result.model} · {result.source === "cached" ? "cached" : "live"}
          </p>
        </div>
      )}
    </section>
  );
}
