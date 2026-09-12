"""The fixed list of street issues the scanner may report.

The model picks from this list; it never names its own categories. That is
what lets every report map onto something concrete: a fix, the city office
that usually owns it, and - for the few issues the simulation can represent -
an intervention that is re-run through the engine.

`intervention` is None when the demo graph has no attribute the issue would
change. Those issues still get a fix, but no modeled numbers.
"""

from dataclasses import dataclass
from typing import Literal

Intervention = Literal["shade", "accessibility_repair"]

#: "issue": something broken the model can spot in a photo.
#: "request": something a resident asks for (a bike lane); never detected,
#: always chosen, and answered with a design proposal rather than a repair.
Kind = Literal["issue", "request"]


@dataclass(frozen=True)
class IssueType:
    id: str
    label: str
    #: What the model should look for. Sent verbatim in the prompt.
    definition: str
    fix: str
    #: Office that usually handles it in Los Angeles; residents file via MyLA311.
    agency: str
    intervention: Intervention | None
    kind: Kind = "issue"


ISSUE_TYPES: tuple[IssueType, ...] = (
    IssueType(
        id="bike_lane",
        label="Add a bike lane",
        definition="A resident request for a bike lane on the street in the photo.",
        fix="Design a bike lane for this street and weigh where the space comes from.",
        agency="LADOT (Active Transportation Division)",
        intervention=None,
        kind="request",
    ),
    IssueType(
        id="sidewalk_damage",
        label="Damaged sidewalk",
        definition="Cracked, heaved, sunken or broken sidewalk panels, often lifted by tree roots; trip hazards.",
        fix="Replace the damaged sidewalk panels and restore a level, continuous walking surface.",
        agency="StreetsLA (Sidewalk Repair Program)",
        intervention="accessibility_repair",
    ),
    IssueType(
        id="missing_curb_ramp",
        label="Missing or broken curb ramp",
        definition="A crossing or corner with no curb ramp, a crumbling ramp, or steps where a wheelchair user would need a ramp.",
        fix="Build an ADA-compliant curb ramp with a detectable warning surface.",
        agency="StreetsLA / Bureau of Engineering",
        intervention="accessibility_repair",
    ),
    IssueType(
        id="sidewalk_obstruction",
        label="Blocked sidewalk",
        definition="Objects, overgrowth, parked vehicles or construction leaving too little clear width to walk or roll past.",
        fix="Clear the obstruction and restore at least 4 ft of clear walking width.",
        agency="StreetsLA (Investigation & Enforcement)",
        intervention="accessibility_repair",
    ),
    IssueType(
        id="lack_of_shade",
        label="No shade on a walking route",
        definition="A sidewalk, bus stop or plaza in full sun with no trees or shade structures, where people walk or wait.",
        fix="Plant street trees or add a shade structure along this segment.",
        agency="StreetsLA (Urban Forestry Division)",
        intervention="shade",
    ),
    IssueType(
        id="pothole",
        label="Pothole or road surface damage",
        definition="Holes, deep cracks or crumbling asphalt in the roadway.",
        fix="Patch the pothole; resurface if the damage is widespread.",
        agency="StreetsLA (Bureau of Street Services)",
        intervention=None,
    ),
    IssueType(
        id="broken_streetlight",
        label="Broken or missing streetlight",
        definition="A streetlight that is visibly damaged, missing its fixture, or an unlit stretch of street.",
        fix="Repair or replace the fixture and restore pedestrian-scale lighting.",
        agency="Bureau of Street Lighting",
        intervention=None,
    ),
    IssueType(
        id="exposed_wiring",
        label="Exposed or unsafe wiring",
        definition="Dangling, low-hanging or exposed electrical wires, open utility boxes, or damaged utility poles.",
        fix="Keep people clear and have the utility make the wiring or equipment safe.",
        agency="LADWP (report outages and hazards to LADWP directly)",
        intervention=None,
    ),
    IssueType(
        id="faded_crosswalk",
        label="Faded or missing crosswalk",
        definition="Crosswalk or stop-line markings that are faded, missing, or absent at a crossing people clearly use.",
        fix="Repaint as a high-visibility crosswalk.",
        agency="LADOT",
        intervention=None,
    ),
    IssueType(
        id="illegal_dumping",
        label="Illegal dumping",
        definition="Abandoned furniture, mattresses, bulky items or piles of trash on the street or sidewalk.",
        fix="Schedule a bulky-item pickup and clean the site.",
        agency="LA Sanitation (LASAN)",
        intervention=None,
    ),
    IssueType(
        id="graffiti",
        label="Graffiti",
        definition="Unwanted tags or graffiti on public or private surfaces.",
        fix="Remove or paint over the graffiti.",
        agency="Office of Community Beautification",
        intervention=None,
    ),
    IssueType(
        id="drainage_problem",
        label="Blocked drain or flooding",
        definition="Clogged storm drains, standing water, or evidence of street flooding.",
        fix="Clear the catch basin and check the drain line.",
        agency="LA Sanitation (Stormwater)",
        intervention=None,
    ),
    IssueType(
        id="damaged_signage",
        label="Damaged traffic sign",
        definition="Missing, bent, faded or obscured traffic or street-name signs.",
        fix="Replace or straighten the sign and clear anything blocking it.",
        agency="LADOT",
        intervention=None,
    ),
)

BY_ID: dict[str, IssueType] = {issue.id: issue for issue in ISSUE_TYPES}
ISSUE_IDS: tuple[str, ...] = tuple(BY_ID)
DETECTABLE_TYPES: tuple[IssueType, ...] = tuple(t for t in ISSUE_TYPES if t.kind == "issue")
DETECTABLE_IDS: tuple[str, ...] = tuple(t.id for t in DETECTABLE_TYPES)


def issue_type(issue_id: str) -> IssueType:
    try:
        return BY_ID[issue_id]
    except KeyError as exc:
        raise ValueError(
            f"Unknown issue type {issue_id!r}; expected one of {', '.join(ISSUE_IDS)}."
        ) from exc
