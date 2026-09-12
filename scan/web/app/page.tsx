"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { analyzePhoto, fetchArea, inBounds, submitReport } from "@/lib/api";
import type { Analysis, Area, LngLat, Severity, SubmitResult } from "@/lib/types";

// MapLibre touches `window` on import.
const ScanMap = dynamic(() => import("@/components/ScanMap"), { ssr: false });

type Step = "photo" | "locate" | "issue" | "sent";
type PinSource = "exif" | "device" | "manual" | null;
type Async<T> = { state: "idle" } | { state: "loading" } | { state: "done"; value: T } | { state: "error"; message: string };

const MAX_BYTES = 20 * 1024 * 1024;

export default function ScanPage() {
  const [area, setArea] = useState<Async<Area>>({ state: "loading" });
  const [step, setStep] = useState<Step>("photo");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Async<Analysis>>({ state: "idle" });
  const [pin, setPin] = useState<LngLat | null>(null);
  const [pinSource, setPinSource] = useState<PinSource>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [locating, setLocating] = useState<string | null>(null);
  const [issueType, setIssueType] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Async<SubmitResult>>({ state: "idle" });
  const runId = useRef(0);

  useEffect(() => {
    fetchArea()
      .then((value) => setArea({ state: "done", value }))
      .catch((error: Error) => setArea({ state: "error", message: error.message }));
  }, []);

  const startWithPhoto = useCallback((file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      alert("That photo is over 20 MB. Please choose a smaller one.");
      return;
    }
    const id = ++runId.current;
    setPhotoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setPin(null);
    setPinSource(null);
    setIssueType(null);
    setSubmission({ state: "idle" });
    setAnalysis({ state: "loading" });
    setStep("locate");

    analyzePhoto(file)
      .then((value) => {
        if (id !== runId.current) return;
        setAnalysis({ state: "done", value });
        if (value.exif_location) {
          // Only take the photo's location if the user has not already placed a pin.
          setPin((current) => current ?? value.exif_location);
          setPinSource((current) => current ?? "exif");
          setFocusKey((k) => k + 1);
        }
        const top = value.detection?.issues[0]?.type;
        if (top) setIssueType((current) => current ?? top);
      })
      .catch((error: Error) => {
        if (id !== runId.current) return;
        setAnalysis({ state: "error", message: error.message });
      });
  }, []);

  const placePin = useCallback((next: LngLat) => {
    setPin(next);
    setPinSource("manual");
  }, []);

  const locateDevice = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocating("This browser cannot share its location. Tap the map instead.");
      return;
    }
    setLocating("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPin([position.coords.longitude, position.coords.latitude]);
        setPinSource("device");
        setFocusKey((k) => k + 1);
        setLocating(null);
      },
      (error) => {
        const insecure = typeof window !== "undefined" && !window.isSecureContext;
        setLocating(
          insecure
            ? "Location needs HTTPS. Tap the map to place the pin instead."
            : error.code === error.PERMISSION_DENIED
              ? "Location permission was denied. Tap the map to place the pin."
              : "Could not get your location. Tap the map to place the pin.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  const submit = useCallback(() => {
    if (!pin || !issueType || !pinSource || analysis.state !== "done") return;
    setSubmission({ state: "loading" });
    setStep("sent");
    submitReport({
      upload_id: analysis.value.upload_id,
      issue_type: issueType,
      location: pin,
      location_source: pinSource,
    })
      .then((value) => setSubmission({ state: "done", value }))
      .catch((error: Error) => setSubmission({ state: "error", message: error.message }));
  }, [pin, issueType, pinSource, analysis]);

  const reset = useCallback(() => {
    runId.current++;
    setStep("photo");
    setAnalysis({ state: "idle" });
    setSubmission({ state: "idle" });
    setPin(null);
    setPinSource(null);
    setIssueType(null);
  }, []);

  if (area.state === "loading") return <Shell><p className="muted">Loading neighborhood…</p></Shell>;
  if (area.state !== "done") {
    return (
      <Shell>
        <div className="card error">
          <strong>Scan service unavailable</strong>
          <p>{area.state === "error" ? area.message : ""}</p>
          <p className="muted small">Start it with <code>uv run uvicorn scan_api.main:app --port 8001</code> in scan/api.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell step={step} onBack={step === "photo" || step === "sent" ? undefined : () => setStep(previous(step))}>
      {step === "photo" && <PhotoStep onPhoto={startWithPhoto} venue={area.value.venue.name} />}
      {step === "locate" && (
        <LocateStep
          area={area.value}
          photoUrl={photoUrl}
          analysis={analysis}
          pin={pin}
          pinSource={pinSource}
          focusKey={focusKey}
          locating={locating}
          onPin={placePin}
          onDeviceLocation={locateDevice}
          onNext={() => setStep("issue")}
        />
      )}
      {step === "issue" && (
        <IssueStep
          area={area.value}
          photoUrl={photoUrl}
          analysis={analysis}
          issueType={issueType}
          onIssue={setIssueType}
          canSubmit={analysis.state === "done"}
          onNext={submit}
        />
      )}
      {step === "sent" && (
        <SentStep
          submission={submission}
          isRequest={area.value.issue_types.find((t) => t.id === issueType)?.kind === "request"}
          onRetry={submit}
          onRestart={reset}
        />
      )}
    </Shell>
  );
}

function previous(step: Step): Step {
  return step === "issue" ? "locate" : "photo";
}

// --- layout ------------------------------------------------------------------

const STEPS: Step[] = ["photo", "locate", "issue", "sent"];
const STEP_LABEL: Record<Step, string> = { photo: "Photo", locate: "Location", issue: "Issue", sent: "Sent" };

function Shell({ children, step, onBack }: { children: React.ReactNode; step?: Step; onBack?: () => void }) {
  return (
    <main className="shell">
      <header className="top">
        {onBack ? (
          <button className="back" onClick={onBack} aria-label="Back">←</button>
        ) : (
          <span className="back placeholder" />
        )}
        <span className="brand">CivicSim <em>Scan</em></span>
        <span className="back placeholder" />
      </header>
      {step && (
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={STEPS.indexOf(step) >= i ? "on" : ""}>{STEP_LABEL[s]}</li>
          ))}
        </ol>
      )}
      {children}
    </main>
  );
}

// --- step 1: photo ------------------------------------------------------------

function PhotoStep({ onPhoto, venue }: { onPhoto: (file: File | undefined) => void; venue: string }) {
  return (
    <section className="stack grow">
      <div className="intro">
        <p className="kicker">Report a street issue</p>
        <h1>See something broken on your block?</h1>
        <p className="muted">
          Snap a photo. CivicSim finds the problem, places it on the neighborhood model around {venue},
          and shows what fixing it would change.
        </p>
      </div>
      <div className="stack actions">
        <label className="button primary">
          Take a photo
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
        <label className="button">
          Upload from library
          <input type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
      </div>
    </section>
  );
}

// --- step 2: location ------------------------------------------------------------

function LocateStep(props: {
  area: Area;
  photoUrl: string | null;
  analysis: Async<Analysis>;
  pin: LngLat | null;
  pinSource: PinSource;
  focusKey: number;
  locating: string | null;
  onPin: (pin: LngLat) => void;
  onDeviceLocation: () => void;
  onNext: () => void;
}) {
  const { area, analysis, pin, pinSource } = props;
  const inside = pin ? inBounds(pin, area.bounds) : null;

  let note: React.ReactNode;
  if (analysis.state === "loading" && !pin) note = "Reading the photo's location…";
  else if (pinSource === "exif") note = "Location read from the photo. Drag the pin if it's off.";
  else if (pinSource === "device") note = "Pinned at your current location. Drag to adjust.";
  else if (pinSource === "manual") note = "Pin placed. Drag or tap to adjust.";
  else note = "This photo has no location. Tap the map where you took it, or use your current location.";

  return (
    <section className="stack grow">
      <div className="row between">
        <h2>Where is it?</h2>
        {props.photoUrl && <img className="thumb" src={props.photoUrl} alt="Your photo" />}
      </div>
      <p className="muted small">{note}</p>
      <div className="map-frame">
        <ScanMap area={area} pin={pin} onPinChange={props.onPin} focusKey={props.focusKey} />
        <button className="chip locate" onClick={props.onDeviceLocation}>◎ Use my current location</button>
      </div>
      {props.locating && <p className="small warn">{props.locating}</p>}
      {inside === false && (
        <p className="small warn">
          This spot is outside the neighborhood CivicSim models (dashed box). You can still continue, but no impact can be simulated.
        </p>
      )}
      <button className="button primary" disabled={!pin} onClick={props.onNext}>
        {pin ? "Confirm location" : "Place a pin to continue"}
      </button>
    </section>
  );
}

// --- step 3: issue ---------------------------------------------------------------

function IssueStep(props: {
  area: Area;
  photoUrl: string | null;
  analysis: Async<Analysis>;
  issueType: string | null;
  onIssue: (id: string) => void;
  canSubmit: boolean;
  onNext: () => void;
}) {
  const { area, analysis, issueType } = props;
  const labels = useMemo(() => Object.fromEntries(area.issue_types.map((t) => [t.id, t])), [area]);
  const detection = analysis.state === "done" ? analysis.value.detection : null;
  const detected = detection?.issues ?? [];
  const failure =
    analysis.state === "error" ? analysis.message : analysis.state === "done" ? analysis.value.detection_error : null;
  const requests = area.issue_types.filter((t) => t.kind === "request");
  const problems = area.issue_types.filter((t) => t.kind === "issue");

  return (
    <section className="stack grow">
      <div className="row between">
        <h2>What should change?</h2>
        {props.photoUrl && <img className="thumb" src={props.photoUrl} alt="Your photo" />}
      </div>

      <p className="kicker">Ask for an improvement</p>
      {requests.map((t) => (
        <button
          key={t.id}
          className={`card option request ${issueType === t.id ? "selected" : ""}`}
          onClick={() => props.onIssue(t.id)}
        >
          <div className="row">
            <span className="request-icon" aria-hidden>{REQUEST_ICON[t.id] ?? "✦"}</span>
            <span className="stack tight">
              <strong>{t.label}</strong>
              <span className="small muted">Planners get a concept design for this street.</span>
            </span>
          </div>
        </button>
      ))}

      <p className="kicker">Or report a problem</p>

      {analysis.state === "loading" && (
        <div className="card shimmer"><p className="muted">Looking for issues in your photo…</p></div>
      )}

      {detection && (
        <p className="muted small">
          {detection.scene}
          {!detection.is_street_scene && " — this doesn't look like a street, so results may be unreliable."}
        </p>
      )}

      {detected.map((issue) => (
        <button
          key={issue.type}
          className={`card option ${issueType === issue.type ? "selected" : ""}`}
          onClick={() => props.onIssue(issue.type)}
        >
          <div className="row between">
            <strong>{labels[issue.type]?.label ?? issue.type}</strong>
            <SeverityTag severity={issue.severity} />
          </div>
          <p className="small">{issue.summary}</p>
          <p className="muted tiny">
            {Math.round(issue.confidence * 100)}% confident
            {labels[issue.type]?.intervention ? " · can be simulated" : ""}
          </p>
        </button>
      ))}

      {detection && detected.length === 0 && (
        <div className="card"><p>No issue from our list was clearly visible. Pick one below if you know what it is.</p></div>
      )}
      {failure && (
        <div className="card error">
          <strong>Automatic detection didn&rsquo;t run</strong>
          <p className="small">{failure}</p>
        </div>
      )}

      {analysis.state !== "loading" && (
        <label className="stack tight">
          <span className="muted small">{detected.length ? "Not right? Choose another problem" : "Choose the problem"}</span>
          <select value={problems.some((t) => t.id === issueType) ? issueType! : ""} onChange={(e) => props.onIssue(e.target.value)}>
            <option value="" disabled>Select…</option>
            {problems.map((t) => (
              <option key={t.id} value={t.id}>{t.label}{t.intervention ? " ◆" : ""}</option>
            ))}
          </select>
          <span className="muted tiny">◆ = the simulation can model a fix</span>
        </label>
      )}

      {analysis.state === "error" && (
        <p className="small warn">The photo didn&rsquo;t reach the server, so this report can&rsquo;t be sent. Go back and take it again.</p>
      )}
      <button className="button primary sticky-submit" disabled={!issueType || !props.canSubmit} onClick={props.onNext}>
        {analysis.state === "loading" ? "Uploading photo…" : "Submit"}
      </button>
    </section>
  );
}

const REQUEST_ICON: Record<string, string> = { bike_lane: "🚲" };

function SeverityTag({ severity }: { severity: Severity }) {
  return <span className={`tag ${severity}`}>{severity}</span>;
}

// --- step 4: sent ---------------------------------------------------------------------

function SentStep({
  submission,
  isRequest,
  onRetry,
  onRestart,
}: {
  submission: Async<SubmitResult>;
  isRequest: boolean;
  onRetry: () => void;
  onRestart: () => void;
}) {
  if (submission.state === "loading" || submission.state === "idle") {
    return <section className="stack grow"><div className="card shimmer"><p className="muted">Sending your report…</p></div></section>;
  }
  if (submission.state === "error") {
    return (
      <section className="stack grow">
        <div className="card error"><strong>Your report didn&rsquo;t send</strong><p className="small">{submission.message}</p></div>
        <button className="button primary" onClick={onRetry}>Try again</button>
        <button className="button" onClick={onRestart}>Start over</button>
      </section>
    );
  }
  const outside = submission.value.status === "outside_area";
  return (
    <section className="stack grow sent">
      <div className="check" aria-hidden>✓</div>
      <h1>{isRequest ? "Request received" : "Report received"}</h1>
      <p className="muted">
        {isRequest
          ? "Thanks. Planners will see a concept design for this street, with who it helps and what it trades off."
          : outside
          ? "Thanks. This spot is outside the neighborhood CivicSim models, so planners will see your photo and the fix, but no simulated impact."
          : "Thanks. Planners can now see the issue on the neighborhood model, with the recommended fix and what fixing it would change."}
      </p>
      <p className="tiny muted">Reference #{submission.value.id}</p>
      <div className="actions stack">
        <button className="button primary" onClick={onRestart}>Report another issue</button>
      </div>
    </section>
  );
}
