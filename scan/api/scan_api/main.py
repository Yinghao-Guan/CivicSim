"""CivicSim scan API: photo -> location + street issues -> fix + modeled impact.

An experiment that runs beside the main backend (port 8001, not 8000) and
changes nothing in it. The phone page reaches it through the scan web app's
same-origin rewrite, so a single HTTPS tunnel serves both.

    GET  /health    is Gemini configured, and which model
    GET  /area      the supported area and the modeled streets, for the map
    POST /analyze   multipart photo -> upload id, EXIF location (if any), detected issues
    POST /assess    issue type + [lon, lat] -> fix, agency, before/after metrics
    POST /reports   upload id + confirmed issue + location -> stored report (the phone's submit)
    GET  /reports   every submitted report with its assessment, newest first (the board)
    GET  /reports/{id}/photo
    DELETE /reports clear the board before a demo

The phone only analyzes and submits; the board reads /reports.
"""

import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from scan_api import detect, gemini, proposal
from scan_api.geo import area_bounds, in_area, modeled_segments
from scan_api.impact import assess
from scan_api.photo import PhotoError, decode_photo
from scan_api.reports import PendingUpload, PendingUploads, ReportStore, new_report_id
from scan_api.taxonomy import ISSUE_IDS, ISSUE_TYPES, issue_type

from data.demo_neighborhood import CANDIDATE_SITES
from data.demo_neighborhood import location as node_location

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
SCAN_WEB_ORIGIN = "http://localhost:3001"

#: The Beehive, as in web/lib/demoArea.generated.ts.
VENUE = {"name": "The Beehive", "location": (-118.25747, 33.9853)}


def _load_env_file() -> None:
    """Read scan/api/.env without adding a dependency. Real env vars win."""
    path = Path(__file__).resolve().parents[1] / ".env"
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


_load_env_file()

#: Where submitted reports live. Gitignored; override for tests.
DEFAULT_REPORTS_DIR = Path(__file__).resolve().parents[1] / ".reports"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.reports = ReportStore(Path(os.environ.get("SCAN_REPORTS_DIR") or DEFAULT_REPORTS_DIR))
    app.state.pending = PendingUploads()
    app.state.jobs = ThreadPoolExecutor(max_workers=4, thread_name_prefix="proposal")
    # Finish proposals a restart interrupted.
    for report in app.state.reports.list():
        if (report.get("proposal") or {}).get("state") in ("queued", "analyzing", "rendering"):
            _schedule_proposal(app, report["id"])
    yield
    app.state.jobs.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="CivicSim scan API (experimental)", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[SCAN_WEB_ORIGIN],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


@app.get("/health")
def health() -> dict:
    return {"gemini_configured": detect.is_configured(), "model": detect.model_name()}


@app.get("/area")
def area() -> dict:
    (west, south), (east, north) = area_bounds()
    return {
        "bounds": [[west, south], [east, north]],
        "center": [(west + east) / 2, (south + north) / 2],
        "venue": VENUE,
        "segments": [
            {
                "edge_id": s.edge_id,
                "path": list(s.path),
                "wheelchair_accessible": s.wheelchair_accessible,
            }
            for s in modeled_segments()
        ],
        "sites": [
            {"id": s.id, "name": s.name, "location": node_location(s.node)}
            for s in CANDIDATE_SITES
        ],
        "issue_types": [
            {"id": t.id, "label": t.label, "intervention": t.intervention, "kind": t.kind}
            for t in ISSUE_TYPES
        ],
    }


@app.post("/analyze")
async def analyze(photo: UploadFile = File(...)) -> dict:
    data = await photo.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise _error(413, "photo_too_large", "Photos must be under 20 MB.")

    try:
        decoded = await run_in_threadpool(decode_photo, data)
    except PhotoError as exc:
        raise _error(400, "invalid_photo", str(exc)) from exc

    # Location and detection fail independently: a photo with no GPS still
    # gets analyzed, and a failed model call still returns the location.
    detection = None
    detection_error = None
    try:
        result = await run_in_threadpool(detect.detect_issues, decoded.jpeg)
        detection = {
            "is_street_scene": result.is_street_scene,
            "scene": result.scene,
            "issues": [issue.__dict__ for issue in result.issues],
            "model": result.model,
        }
    except (detect.DetectionUnavailable, detect.DetectionFailed) as exc:
        detection_error = str(exc)

    upload_id = app.state.pending.put(
        PendingUpload(jpeg=decoded.jpeg, exif_location=decoded.gps, detection=detection)
    )

    return {
        "upload_id": upload_id,
        "photo": {"width": decoded.width, "height": decoded.height},
        "exif_location": decoded.gps,
        "exif_in_area": in_area(decoded.gps) if decoded.gps else None,
        "detection": detection,
        "detection_error": detection_error,
    }


class AssessRequest(BaseModel):
    issue_type: str
    location: tuple[float, float] = Field(description="[longitude, latitude]")


@app.post("/assess")
def assess_issue(request: AssessRequest) -> dict:
    if request.issue_type not in ISSUE_IDS:
        raise _error(400, "invalid_issue_type", f"Unknown issue type {request.issue_type!r}.")
    lon, lat = request.location
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise _error(400, "invalid_location", "location must be [longitude, latitude].")
    return assess(request.issue_type, (lon, lat)).to_dict()


class ReportRequest(BaseModel):
    upload_id: str
    issue_type: str
    location: tuple[float, float] = Field(description="[longitude, latitude]")
    location_source: str = Field(description="exif, device or manual")


@app.post("/reports", status_code=201)
def submit_report(request: ReportRequest) -> dict:
    if request.issue_type not in ISSUE_IDS:
        raise _error(400, "invalid_issue_type", f"Unknown issue type {request.issue_type!r}.")
    lon, lat = request.location
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise _error(400, "invalid_location", "location must be [longitude, latitude].")
    if request.location_source not in ("exif", "device", "manual"):
        raise _error(400, "invalid_location_source", "location_source must be exif, device or manual.")

    upload = app.state.pending.pop(request.upload_id)
    if upload is None:
        raise _error(410, "upload_expired", "This photo is no longer on the server. Please take it again.")

    detection = upload.detection or {}
    detected = next((i for i in detection.get("issues", []) if i["type"] == request.issue_type), None)
    assessment = assess(request.issue_type, (lon, lat)).to_dict()

    report = {
        "id": new_report_id(),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "location": [lon, lat],
        "location_source": request.location_source,
        "issue_type": request.issue_type,
        # What the model saw, when the resident confirmed one of its findings.
        # None when they picked the type by hand.
        "detected": detected,
        "scene": detection.get("scene"),
        "model": detection.get("model"),
        "assessment": assessment,
        # Requests get a design proposal, filled in by a background job.
        "proposal": {"state": "queued"} if issue_type(request.issue_type).kind == "request" else None,
    }
    app.state.reports.add(report, upload.jpeg)
    if report["proposal"]:
        _schedule_proposal(app, report["id"])
    return {"id": report["id"], "status": assessment["status"], "created_at": report["created_at"]}


@app.get("/reports")
def list_reports() -> dict:
    return {"reports": app.state.reports.list()}


@app.get("/reports/{report_id}/photo")
def report_photo(report_id: str) -> FileResponse:
    path = app.state.reports.photo_path(report_id)
    if path is None:
        raise _error(404, "report_not_found", f"Report {report_id!r} was not found.")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "max-age=86400"})


@app.get("/reports/{report_id}/rendering")
def report_rendering(report_id: str) -> FileResponse:
    path = app.state.reports.rendering_path(report_id)
    if path is None:
        raise _error(404, "rendering_not_found", f"No rendering for report {report_id!r}.")
    media = "image/png" if path.suffix == ".png" else "image/jpeg"
    return FileResponse(path, media_type=media, headers={"Cache-Control": "max-age=86400"})


def _schedule_proposal(app: FastAPI, report_id: str) -> None:
    app.state.jobs.submit(_run_proposal, app.state.reports, report_id)


def _run_proposal(store: ReportStore, report_id: str) -> None:
    """Analyze the street, then render the concept. Each step records its own outcome."""
    photo = store.photo_path(report_id)
    if photo is None:
        return
    jpeg = photo.read_bytes()

    store.update(report_id, proposal={"state": "analyzing"})
    try:
        analysis = proposal.analyze_street(jpeg)
    except (gemini.GeminiUnavailable, gemini.GeminiFailed) as exc:
        store.update(report_id, proposal={"state": "error", "error": str(exc)})
        return

    store.update(report_id, proposal={"state": "rendering", "analysis": analysis})
    try:
        rendering = proposal.render_concept(jpeg, analysis)
    except (gemini.GeminiUnavailable, gemini.GeminiFailed) as exc:
        store.update(
            report_id,
            proposal={"state": "done", "analysis": analysis, "rendering": None, "rendering_error": str(exc)},
        )
        return

    store.save_rendering(report_id, rendering.data, rendering.mime_type)
    store.update(
        report_id,
        proposal={"state": "done", "analysis": analysis, "rendering": {"model": rendering.model}, "rendering_error": None},
    )


@app.delete("/reports/{report_id}")
def delete_report(report_id: str) -> dict:
    if not app.state.reports.delete(report_id):
        raise _error(404, "report_not_found", f"Report {report_id!r} was not found.")
    return {"deleted": 1}


@app.delete("/reports")
def clear_reports() -> dict:
    return {"deleted": app.state.reports.clear()}
