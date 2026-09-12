"""Design proposals for resident requests (a bike lane on the street in a photo).

Two model calls, in order:

1. A structured read of the street: what is there today, which kind of bike
   lane fits, where the space would come from, who gains and who gives
   something up. The design choice is constrained to a fixed list.
2. A concept rendering: the resident's own photo, edited to show that design.

Neither is a traffic study. The neighborhood simulation has no cycling mode,
so a proposal carries no modeled numbers, and the board labels it as an AI
reading of one photo.
"""

import json
import os
from dataclasses import dataclass
from io import BytesIO

from PIL import Image

from scan_api import gemini

DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image"

DESIGNS = {
    "protected_bike_lane": "Protected bike lane",
    "buffered_bike_lane": "Buffered bike lane",
    "painted_bike_lane": "Painted bike lane",
    "neighborhood_greenway": "Neighborhood greenway (shared, traffic-calmed street)",
}

SPACE_SOURCES = {
    "convert_parking_lane": "Convert a curbside parking lane",
    "narrow_travel_lanes": "Narrow the existing travel lanes",
    "remove_travel_lane": "Repurpose one travel lane (road diet)",
    "use_existing_shoulder": "Use existing shoulder or unused pavement",
    "no_reallocation_needed": "No space reallocation needed",
    "unclear_from_photo": "Unclear from this photo",
}

EFFECT_ITEMS = {
    "type": "array",
    "maxItems": 4,
    "items": {
        "type": "object",
        "properties": {
            "group": {"type": "string", "description": "Who, in 1-4 words, e.g. 'People biking', 'Bus riders', 'Drivers'."},
            "effect": {"type": "string", "description": "Under 18 words, specific to this street."},
        },
        "required": ["group", "effect"],
    },
}

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "is_street": {"type": "boolean", "description": "True if the photo shows a street a bike lane could go on."},
        "street_summary": {"type": "string", "description": "One sentence: what the street looks like today."},
        "travel_lanes": {"type": "integer", "minimum": 0, "maximum": 12, "description": "Visible motor-vehicle travel lanes, both directions. 0 if unknown."},
        "has_street_parking": {"type": "boolean"},
        "existing_bike_facility": {"type": "string", "enum": ["none", "sharrows", "painted_lane", "protected_lane", "unknown"]},
        "recommended_design": {"type": "string", "enum": list(DESIGNS)},
        "design_rationale": {"type": "string", "description": "Under 35 words: why this design fits what is visible."},
        "space_source": {"type": "string", "enum": list(SPACE_SOURCES)},
        "side_of_street": {"type": "string", "description": "Where the lane goes in the photo, e.g. 'both sides', 'right side of the frame'."},
        "benefits": EFFECT_ITEMS,
        "tradeoffs": EFFECT_ITEMS,
        "open_questions": {
            "type": "array",
            "maxItems": 3,
            "items": {"type": "string"},
            "description": "What a planner must check on site that a photo cannot show.",
        },
    },
    "required": [
        "is_street", "street_summary", "travel_lanes", "has_street_parking", "existing_bike_facility",
        "recommended_design", "design_rationale", "space_source", "side_of_street",
        "benefits", "tradeoffs", "open_questions",
    ],
}

ANALYSIS_PROMPT = (
    "A resident in South Los Angeles photographed this street and asked for a bike lane.\n"
    "Act as a careful street designer working only from this photo.\n"
    "- Describe what is visible; do not invent traffic counts, widths in feet, or crash data.\n"
    "- Recommend the design that best fits what you can see, following NACTO guidance: "
    "protected lanes on wide or fast multi-lane streets, greenways on quiet residential streets.\n"
    "- Say honestly where the space would come from and who gives something up.\n"
    "- benefits and tradeoffs name concrete groups (people biking, pedestrians, bus riders, "
    "drivers, residents who park on the street, local businesses).\n"
    "- Keep every sentence short and specific to this street."
)


#: Output ratios the image model accepts.
ASPECT_RATIOS = ("1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9")


def closest_aspect_ratio(jpeg: bytes) -> str:
    """Match the photo's shape, so the before/after wipe lines up."""
    width, height = Image.open(BytesIO(jpeg)).size
    target = width / height
    return min(ASPECT_RATIOS, key=lambda r: abs(int(r.split(":")[0]) / int(r.split(":")[1]) - target))


@dataclass(frozen=True)
class Rendering:
    data: bytes
    mime_type: str
    model: str


def analysis_model() -> str:
    return os.environ.get("GEMINI_MODEL") or "gemini-3.8-flash"


def image_model() -> str:
    return os.environ.get("GEMINI_IMAGE_MODEL") or DEFAULT_IMAGE_MODEL


def analyze_street(jpeg: bytes) -> dict:
    model = analysis_model()
    payload = gemini.generate(
        model,
        [gemini.image_part(jpeg), {"text": ANALYSIS_PROMPT}],
        {"responseMimeType": "application/json", "responseJsonSchema": ANALYSIS_SCHEMA},
    )
    try:
        data = json.loads(gemini.response_text(payload))
    except json.JSONDecodeError as exc:
        raise gemini.GeminiFailed("Gemini returned malformed JSON.") from exc
    return normalize_analysis(data) | {"model": model}


def normalize_analysis(data: dict) -> dict:
    """Keep only known enum values and well-formed lists; never pass free-form keys on."""
    design = data.get("recommended_design")
    space = data.get("space_source")
    lanes = data.get("travel_lanes")

    def effects(key: str) -> list[dict]:
        return [
            {"group": str(e.get("group", "")).strip(), "effect": str(e.get("effect", "")).strip()}
            for e in (data.get(key) or [])[:4]
            if isinstance(e, dict) and e.get("group") and e.get("effect")
        ]

    return {
        "is_street": bool(data.get("is_street")),
        "street_summary": str(data.get("street_summary") or "").strip(),
        "travel_lanes": lanes if isinstance(lanes, int) and lanes > 0 else None,
        "has_street_parking": data.get("has_street_parking") if isinstance(data.get("has_street_parking"), bool) else None,
        "existing_bike_facility": data.get("existing_bike_facility") or "unknown",
        "recommended_design": design if design in DESIGNS else "painted_bike_lane",
        "design_label": DESIGNS.get(design, DESIGNS["painted_bike_lane"]),
        "design_rationale": str(data.get("design_rationale") or "").strip(),
        "space_source": space if space in SPACE_SOURCES else "unclear_from_photo",
        "space_source_label": SPACE_SOURCES.get(space, SPACE_SOURCES["unclear_from_photo"]),
        "side_of_street": str(data.get("side_of_street") or "").strip(),
        "benefits": effects("benefits"),
        "tradeoffs": effects("tradeoffs"),
        "open_questions": [str(q).strip() for q in (data.get("open_questions") or [])[:3] if str(q).strip()],
    }


def render_concept(jpeg: bytes, analysis: dict) -> Rendering:
    model = image_model()
    prompt = (
        f"Edit this exact street photo into a realistic 'after' concept showing a "
        f"{analysis['design_label'].lower()} on {analysis.get('side_of_street') or 'the street'}.\n"
        f"Space comes from: {analysis['space_source_label'].lower()}.\n"
        "Use standard Los Angeles design: green-painted bike lane surface with white bicycle "
        "stencils and lane lines; for a protected lane add a buffer with flexible white posts or "
        "concrete curbs between the bike lane and cars.\n"
        "Keep the same camera angle, lighting, buildings, trees, sky and everything unrelated "
        "to the bike lane. Photorealistic, no text or labels, no people added."
    )
    payload = gemini.generate(
        model,
        [gemini.image_part(jpeg), {"text": prompt}],
        {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": closest_aspect_ratio(jpeg)}},
        timeout=120.0,
    )
    data, mime = gemini.response_image(payload)
    return Rendering(data=data, mime_type=mime, model=model)
