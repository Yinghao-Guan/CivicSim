"""A small Overpass API client with an on-disk cache.

Kept deliberately thin: `requests` only, no osmium, no GDAL. Every team
member can run this on macOS and on native Windows without installing a
geospatial toolchain (see docs/05-map-milestone-plan.md section 9).
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import requests

ENDPOINT = "https://overpass-api.de/api/interpreter"
USER_AGENT = "CivicSim/0.1 (hackathon project; https://github.com/Guaguaaaa/CivicSim)"

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / ".cache"


def query(ql: str, *, label: str, force: bool = False, timeout: int = 300) -> dict:
    """Run an Overpass query, caching the raw response on disk.

    The cache key is a hash of the query text, so editing a query fetches
    fresh data while re-running an unchanged one costs nothing. Pass
    `force=True` to refetch regardless.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(ql.encode("utf-8")).hexdigest()[:16]
    cached = CACHE_DIR / f"{label}-{digest}.json"

    if cached.exists() and not force:
        size_mb = cached.stat().st_size / 1e6
        print(f"  [{label}] cache hit ({size_mb:.1f} MB) -> {cached.name}")
        return json.loads(cached.read_text(encoding="utf-8"))

    print(f"  [{label}] querying Overpass ...")
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            response = requests.post(
                ENDPOINT,
                data={"data": ql},
                headers={"User-Agent": USER_AGENT},
                timeout=timeout,
            )
            # 429 (rate limited) and 504 (gateway timeout) are the two
            # Overpass answers that are worth simply waiting out.
            if response.status_code in (429, 504):
                raise requests.HTTPError(
                    f"Overpass returned {response.status_code}", response=response
                )
            response.raise_for_status()
            payload = response.json()
            break
        except Exception as exc:  # noqa: BLE001 - retry on anything transient
            last_error = exc
            if attempt == 3:
                raise
            wait = 5 * attempt
            print(f"  [{label}] attempt {attempt} failed ({exc}); retrying in {wait}s")
            time.sleep(wait)
    else:  # pragma: no cover - the loop always breaks or raises
        raise RuntimeError(f"Overpass query failed: {last_error}")

    cached.write_text(json.dumps(payload), encoding="utf-8")
    size_mb = cached.stat().st_size / 1e6
    elements = len(payload.get("elements", []))
    print(f"  [{label}] {elements} elements, {size_mb:.1f} MB -> cached")
    return payload
