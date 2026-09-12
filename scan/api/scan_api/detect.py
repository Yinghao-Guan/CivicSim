"""Street-issue detection with a Gemini vision model.

The model only classifies. It picks issue types from `taxonomy.ISSUE_TYPES`
under a JSON schema, and everything downstream (fix, agency, simulation) is
looked up from our own table rather than trusted from free text. A response
naming a type outside the table is dropped, not passed on.

Called over REST with httpx rather than an SDK so the only moving part is one
documented endpoint.
"""

import json
import os
from dataclasses import dataclass
from typing import Literal

import httpx

from scan_api import gemini
from scan_api.taxonomy import DETECTABLE_IDS, DETECTABLE_TYPES

DEFAULT_MODEL = "gemini-3.8-flash"
TIMEOUT_SECONDS = 45.0
MAX_ISSUES = 3

DetectionUnavailable = gemini.GeminiUnavailable
DetectionFailed = gemini.GeminiFailed

Severity = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class DetectedIssue:
    type: str
    severity: Severity
    confidence: float
    summary: str


@dataclass(frozen=True)
class Detection:
    is_street_scene: bool
    scene: str
    issues: tuple[DetectedIssue, ...]
    model: str


RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "is_street_scene": {
            "type": "boolean",
            "description": "True if the photo shows an outdoor street, sidewalk, crossing, alley or other public right-of-way.",
        },
        "scene": {
            "type": "string",
            "description": "One short sentence describing what the photo shows.",
        },
        "issues": {
            "type": "array",
            "maxItems": MAX_ISSUES,
            "description": "Issues clearly visible in the photo, most important first. Empty if none.",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": list(DETECTABLE_IDS)},
                    "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "summary": {
                        "type": "string",
                        "description": "Under 20 words: what is wrong and where in the frame.",
                    },
                },
                "required": ["type", "severity", "confidence", "summary"],
            },
        },
    },
    "required": ["is_street_scene", "scene", "issues"],
}


def build_prompt() -> str:
    catalogue = "\n".join(f"- {t.id}: {t.definition}" for t in DETECTABLE_TYPES)
    return (
        "You are inspecting a resident's photo of a street in South Los Angeles "
        "for infrastructure problems the city could fix.\n\n"
        "Report only problems you can actually see in this photo, using only these types:\n"
        f"{catalogue}\n\n"
        "Rules:\n"
        "- If nothing on the list is clearly visible, return an empty issues list. Do not guess.\n"
        "- severity: high = immediate safety hazard or blocks wheelchair users; "
        "medium = clear problem that should be scheduled; low = cosmetic or minor.\n"
        "- confidence is how sure you are the issue is really present, from 0 to 1.\n"
        f"- At most {MAX_ISSUES} issues, most important first, one entry per type."
    )


def model_name() -> str:
    return os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL


def is_configured() -> bool:
    return gemini.is_configured()


def detect_issues(jpeg: bytes, client: httpx.Client | None = None) -> Detection:
    model = model_name()
    payload = gemini.generate(
        model,
        [gemini.image_part(jpeg), {"text": build_prompt()}],
        {"responseMimeType": "application/json", "responseJsonSchema": RESPONSE_SCHEMA},
        client=client,
        timeout=TIMEOUT_SECONDS,
    )
    return parse_response(payload, model)


def parse_response(payload: dict, model: str) -> Detection:
    try:
        data = json.loads(gemini.response_text(payload))
    except json.JSONDecodeError as exc:
        raise DetectionFailed("Gemini returned malformed JSON.") from exc

    issues: list[DetectedIssue] = []
    seen: set[str] = set()
    for raw in data.get("issues") or []:
        issue_id = raw.get("type")
        if issue_id not in DETECTABLE_IDS or issue_id in seen:
            continue
        seen.add(issue_id)
        severity = raw.get("severity")
        issues.append(
            DetectedIssue(
                type=issue_id,
                severity=severity if severity in ("low", "medium", "high") else "medium",
                confidence=min(1.0, max(0.0, float(raw.get("confidence") or 0))),
                summary=str(raw.get("summary") or "").strip(),
            )
        )

    return Detection(
        is_street_scene=bool(data.get("is_street_scene")),
        scene=str(data.get("scene") or "").strip(),
        issues=tuple(issues[:MAX_ISSUES]),
        model=model,
    )

