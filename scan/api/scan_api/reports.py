"""Submitted reports: what a phone sends, and what the planning board reads.

A report is written once, when the resident submits, and never edited. It
carries the photo, where it was taken, the issue the resident confirmed, and
the assessment computed at submission time, so the board shows exactly what
the model said about that report.

Stored as one JSON file plus one JPEG per report, in a directory that
survives an API restart. No database, matching the rest of the hackathon build.
"""

import json
import secrets
import threading
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

#: Photos analyzed but not yet submitted. Small and in memory: a resident
#: submits within a minute or two, and a restart just means retaking the photo.
PENDING_LIMIT = 100


@dataclass(frozen=True)
class PendingUpload:
    jpeg: bytes
    exif_location: tuple[float, float] | None
    detection: dict | None


class PendingUploads:
    def __init__(self, limit: int = PENDING_LIMIT) -> None:
        self._items: OrderedDict[str, PendingUpload] = OrderedDict()
        self._limit = limit
        self._lock = threading.Lock()

    def put(self, upload: PendingUpload) -> str:
        upload_id = secrets.token_urlsafe(12)
        with self._lock:
            self._items[upload_id] = upload
            while len(self._items) > self._limit:
                self._items.popitem(last=False)
        return upload_id

    def pop(self, upload_id: str) -> PendingUpload | None:
        with self._lock:
            return self._items.pop(upload_id, None)


class ReportStore:
    def __init__(self, directory: Path) -> None:
        self._dir = directory
        self._dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._reports: dict[str, dict] = {}
        for path in self._dir.glob("*.json"):
            try:
                report = json.loads(path.read_text())
                self._reports[report["id"]] = report
            except (OSError, ValueError, KeyError):
                continue  # A half-written file from a crash; skip it.

    def add(self, report: dict, jpeg: bytes) -> dict:
        with self._lock:
            (self._dir / f"{report['id']}.jpg").write_bytes(jpeg)
            self._write(report)
            self._reports[report["id"]] = report
        return report

    def _write(self, report: dict) -> None:
        tmp = self._dir / f"{report['id']}.json.tmp"
        tmp.write_text(json.dumps(report))
        tmp.replace(self._dir / f"{report['id']}.json")

    def update(self, report_id: str, **fields) -> dict | None:
        """Merge top-level fields into a stored report (used by background proposal jobs)."""
        with self._lock:
            report = self._reports.get(report_id)
            if report is None:
                return None  # Cleared while the job was running.
            report = {**report, **fields}
            self._write(report)
            self._reports[report_id] = report
            return report

    def save_rendering(self, report_id: str, data: bytes, mime_type: str) -> None:
        ext = "png" if "png" in mime_type else "jpg"
        with self._lock:
            (self._dir / f"{report_id}.after.{ext}").write_bytes(data)

    def rendering_path(self, report_id: str) -> Path | None:
        if report_id not in self._reports:
            return None
        return next(iter(sorted(self._dir.glob(f"{report_id}.after.*"))), None)

    def list(self) -> list[dict]:
        """Newest first."""
        with self._lock:
            return sorted(self._reports.values(), key=lambda r: r["created_at"], reverse=True)

    def get(self, report_id: str) -> dict | None:
        with self._lock:
            return self._reports.get(report_id)

    def photo_path(self, report_id: str) -> Path | None:
        if report_id not in self._reports:
            return None
        path = self._dir / f"{report_id}.jpg"
        return path if path.is_file() else None

    def delete(self, report_id: str) -> bool:
        with self._lock:
            if self._reports.pop(report_id, None) is None:
                return False
            for path in self._dir.glob(f"{report_id}.*"):
                path.unlink(missing_ok=True)
        return True

    def clear(self) -> int:
        with self._lock:
            count = len(self._reports)
            for path in self._dir.iterdir():
                if path.is_file():
                    path.unlink(missing_ok=True)
            self._reports.clear()
        return count


def new_report_id() -> str:
    return secrets.token_hex(4)
