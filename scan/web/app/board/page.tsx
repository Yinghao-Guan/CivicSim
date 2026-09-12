"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

import ReportView from "@/components/ReportView";
import SiteNav from "@/components/SiteNav";
import { clearReports, deleteReport, fetchArea, fetchReports, reportPhotoUrl } from "@/lib/api";
import type { Area, Report } from "@/lib/types";

/** Short enough that a report feels live on stage, cheap over a tunnel. */
const POLL_MS = 2500;

export default function BoardPage() {
  const [area, setArea] = useState<Area | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const known = useRef<Set<string> | null>(null);
  // Reports that already existed when the board opened. They stay stored but are not
  // shown: every visit starts on the waiting screen and only follows new submissions.
  const history = useRef<Set<string> | null>(null);

  useEffect(() => {
    fetchArea().then(setArea).catch((e: Error) => setError(e.message));
  }, []);

  const poll = useCallback(async () => {
    try {
      const all = await fetchReports();
      setError(null);
      if (!history.current) history.current = new Set(all.map((r) => r.id));
      const next = all.filter((r) => !history.current!.has(r.id));
      if (known.current) {
        const arrived = next.filter((r) => !known.current!.has(r.id));
        if (arrived.length) {
          // Jump to the newest arrival: on stage, a phone submits and the screen follows.
          setSelected(arrived[0].id);
          setFresh((f) => new Set([...f, ...arrived.map((r) => r.id)]));
        }
      }
      known.current = new Set(next.map((r) => r.id));
      setReports(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  const clear = useCallback(async () => {
    if (!window.confirm("Delete every submitted report? This cannot be undone.")) return;
    try {
      await clearReports();
      known.current = new Set();
      setReports([]);
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const remove = useCallback(async (report: Report) => {
    if (!window.confirm(`Delete "${report.assessment.issue.label}" (#${report.id})? This cannot be undone.`)) return;
    try {
      await deleteReport(report.id);
      known.current?.delete(report.id);
      setReports((list) => {
        const next = list.filter((r) => r.id !== report.id);
        setSelected((current) => (current === report.id ? next[0]?.id ?? null : current));
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const current = reports.find((r) => r.id === selected) ?? null;

  return (
    <>
    <SiteNav />
    <main className="board">
      <aside className="board-side">
        <header className="board-heading">
          <h1>Resident reports</h1>
          <p className="tiny muted">Live from residents&rsquo; phones, since this board opened.</p>
        </header>

        {error && <p className="small warn">{error}</p>}

        <ol className="report-list">
          {reports.map((r) => (
            <li key={r.id}>
              <button
                className={`report-item ${r.id === selected ? "selected" : ""}`}
                onClick={() => {
                  setSelected(r.id);
                  setFresh((f) => { const n = new Set(f); n.delete(r.id); return n; });
                }}
              >
                <img src={reportPhotoUrl(r.id)} alt="" />
                <span className="stack tight">
                  <strong>{r.assessment.issue.label}</strong>
                  <span className="tiny muted">
                    {timeAgo(r.created_at)} · {statusLabel(r)}
                  </span>
                </span>
                {fresh.has(r.id) && <span className="new">new</span>}
              </button>
              <button
                className="report-delete"
                aria-label={`Delete report ${r.id}`}
                title="Delete this report"
                onClick={() => remove(r)}
              >
                ×
              </button>
            </li>
          ))}
        </ol>

        <PhoneInvite />

        {reports.length > 0 && (
          <button className="link-button tiny" onClick={clear}>Clear all reports</button>
        )}
      </aside>

      <section className="board-main">
        {!area ? (
          <p className="muted">Loading neighborhood…</p>
        ) : current ? (
          <ReportView report={current} area={area} />
        ) : (
          <div className="waiting">
            <div className="pulse-dot" />
            <h1>Waiting for reports</h1>
            <p className="muted">Scan the code with a phone, photograph a street issue, and it will appear here with its fix and modeled impact.</p>
          </div>
        )}
      </section>
    </main>
    </>
  );
}

function PhoneInvite() {
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    // The phone page is this zone's root, under the main app's /community path.
    const phoneUrl = window.location.origin + "/community";
    setUrl(phoneUrl);
    QRCode.toDataURL(phoneUrl, { margin: 1, width: 360, color: { dark: "#1f1c17", light: "#fbf8f2" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, []);

  const local = /localhost|127\.0\.0\.1/.test(url);
  return (
    <div className="card invite">
      <p className="kicker">Report from your phone</p>
      {qr && <img src={qr} alt={`QR code for ${url}`} />}
      <p className="tiny muted break">{url}</p>
      {local && (
        <p className="tiny warn">
          This is a localhost address, which a phone can&rsquo;t open. Open the board through the HTTPS tunnel URL instead.
        </p>
      )}
    </div>
  );
}

function statusLabel(r: Report): string {
  const a = r.assessment;
  if (r.proposal) {
    return { queued: "designing…", analyzing: "designing…", rendering: "rendering…", done: "concept ready", error: "design failed" }[r.proposal.state];
  }
  if (a.status === "outside_area") return "outside area";
  if (a.status === "not_modeled") return "fix only";
  return a.headline ? "impact modeled" : "no modeled change";
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
