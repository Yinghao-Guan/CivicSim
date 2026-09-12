"""Read-only access to the main backend's simulation engine.

The scan feature is an experiment that must be deletable without touching the
rest of the repo, so it never edits `backend/`. It imports the engine from the
sibling directory instead: same graph, same cohort, same metrics, so every
number this service reports was produced by the code the demo already runs.

Import this module before any `data.*`, `simulation.*` or `api.*` import.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[3] / "backend"

if not (BACKEND_DIR / "simulation").is_dir():
    raise RuntimeError(
        f"Expected the CivicSim backend at {BACKEND_DIR}; the scan API reads its "
        "simulation engine and cannot run without it."
    )

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
