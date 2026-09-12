"""Scan API: EXIF location, area check, street matching, modeled impact, wire format."""

from io import BytesIO

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from scan_api import detect
from scan_api.geo import in_area, nearest_segment
from scan_api.impact import assess
from scan_api.main import app
from scan_api.photo import GPS_IFD, decode_photo

from data.demo_neighborhood import NODE_LOCATIONS

BEEHIVE = (-118.25747, 33.9853)
DOWNTOWN = (-118.2437, 34.0522)


def _midpoint(u, v):
    (ax, ay), (bx, by) = NODE_LOCATIONS[u], NODE_LOCATIONS[v]
    return ((ax + bx) / 2, (ay + by) / 2)


def _dms(value):
    value = abs(value)
    d = int(value)
    m = int((value - d) * 60)
    s = (value - d - m / 60) * 3600
    return (IFDRational(d), IFDRational(m), IFDRational(round(s * 1000), 1000))


def _jpeg(gps=None) -> bytes:
    image = Image.new("RGB", (40, 30), "gray")
    exif = Image.Exif()
    if gps:
        lon, lat = gps
        ifd = exif.get_ifd(GPS_IFD)
        ifd.update({1: "N" if lat >= 0 else "S", 2: _dms(lat), 3: "E" if lon >= 0 else "W", 4: _dms(lon)})
    buffer = BytesIO()
    image.save(buffer, format="JPEG", exif=exif)
    return buffer.getvalue()


# --- photo -------------------------------------------------------------------


def test_reads_exif_gps_as_lon_lat():
    decoded = decode_photo(_jpeg(BEEHIVE))
    assert decoded.gps == pytest.approx(BEEHIVE, abs=1e-5)


def test_photo_without_gps_has_no_location():
    assert decode_photo(_jpeg()).gps is None


# --- geography ---------------------------------------------------------------


def test_area_check():
    assert in_area(BEEHIVE)
    assert not in_area(DOWNTOWN)


def test_snaps_to_the_street_under_the_pin():
    assert nearest_segment(_midpoint("j_c1", "j_e")).edge_id == "edge_07"


# --- impact ------------------------------------------------------------------


def test_outside_area_is_reported_not_modeled():
    result = assess("sidewalk_damage", DOWNTOWN)
    assert result.status == "outside_area"
    assert result.scenarios == []


def test_unmodeled_issue_gets_a_fix_but_no_numbers():
    result = assess("pothole", BEEHIVE)
    assert result.status == "not_modeled"
    assert result.issue["agency"]
    assert result.scenarios == [] and result.headline is None


def test_repairing_the_stepped_crossing_raises_wheelchair_access():
    result = assess("missing_curb_ramp", _midpoint("j_c1", "j_e"))
    assert result.status == "modeled"
    assert result.change["changed"] and result.change["edge_id"] == "edge_07"
    gains = {s.scenario_id: s.after["wheelchair_access"] - s.before["wheelchair_access"] for s in result.scenarios}
    assert max(gains.values()) > 0
    assert all(g >= 0 for g in gains.values())
    assert result.headline["metric"] == "wheelchair_access"
    assert result.headline["after"] > result.headline["before"]


def test_repair_on_an_accessible_street_changes_nothing():
    result = assess("sidewalk_damage", _midpoint("res_e1", "j_e"))
    assert result.change["changed"] is False
    assert all(s.before == s.after for s in result.scenarios)
    assert result.headline is None


def test_shade_lowers_heat_exposure_somewhere():
    result = assess("lack_of_shade", _midpoint("j_w", "site_b"))
    assert result.change["edge_id"] == "edge_03"
    assert result.headline["metric"] == "average_heat_exposure"
    assert result.headline["after"] < result.headline["before"]


# --- detection parsing -------------------------------------------------------


def _gemini_payload(text):
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def test_parse_drops_types_outside_the_taxonomy():
    text = '{"is_street_scene": true, "scene": "a sidewalk", "issues": [' \
        '{"type": "sidewalk_damage", "severity": "high", "confidence": 0.9, "summary": "cracked"},' \
        '{"type": "alien_invasion", "severity": "high", "confidence": 1, "summary": "?"},' \
        '{"type": "sidewalk_damage", "severity": "low", "confidence": 0.2, "summary": "dup"}]}'
    detection = detect.parse_response(_gemini_payload(text), "m")
    assert [i.type for i in detection.issues] == ["sidewalk_damage"]


def test_detect_sends_schema_and_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    seen = {}

    def handler(request: httpx.Request):
        seen["key"] = request.headers["x-goog-api-key"]
        seen["body"] = request.read()
        return httpx.Response(200, json=_gemini_payload('{"is_street_scene": true, "scene": "x", "issues": []}'))

    client = httpx.Client(transport=httpx.MockTransport(handler))
    detection = detect.detect_issues(b"jpeg", client=client)
    assert seen["key"] == "test-key"
    assert b"responseJsonSchema" in seen["body"]
    assert detection.issues == ()


# --- HTTP --------------------------------------------------------------------


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("SCAN_REPORTS_DIR", str(tmp_path / "reports"))
    with TestClient(app) as test_client:
        yield test_client


def test_analyze_returns_location_even_without_a_model(client):
    response = client.post("/analyze", files={"photo": ("p.jpg", _jpeg(BEEHIVE), "image/jpeg")})
    assert response.status_code == 200
    body = response.json()
    assert body["exif_location"] == pytest.approx(list(BEEHIVE), abs=1e-5)
    assert body["exif_in_area"] is True
    assert body["detection"] is None and "GEMINI_API_KEY" in body["detection_error"]


def test_analyze_rejects_non_images(client):
    response = client.post("/analyze", files={"photo": ("p.txt", b"hello", "text/plain")})
    assert response.status_code == 400


def test_assess_roundtrip(client):
    response = client.post("/assess", json={"issue_type": "missing_curb_ramp", "location": list(_midpoint("j_c1", "j_e"))})
    assert response.status_code == 200
    assert response.json()["status"] == "modeled"
    assert client.post("/assess", json={"issue_type": "nope", "location": list(BEEHIVE)}).status_code == 400


def test_area_lists_segments(client):
    body = client.get("/area").json()
    assert len(body["segments"]) == 14
    assert body["bounds"][0][0] < body["bounds"][1][0]


# --- reports: the phone submits, the board reads ------------------------------


def _upload(client, gps=None) -> str:
    response = client.post("/analyze", files={"photo": ("p.jpg", _jpeg(gps), "image/jpeg")})
    return response.json()["upload_id"]


def test_submitted_report_appears_on_the_board_with_its_assessment(client):
    where = list(_midpoint("j_c1", "j_e"))
    upload_id = _upload(client)
    response = client.post(
        "/reports",
        json={"upload_id": upload_id, "issue_type": "missing_curb_ramp", "location": where, "location_source": "manual"},
    )
    assert response.status_code == 201
    report_id = response.json()["id"]

    reports = client.get("/reports").json()["reports"]
    assert [r["id"] for r in reports] == [report_id]
    assert reports[0]["assessment"]["headline"]["scenario_id"] == "site_c"
    assert reports[0]["detected"] is None  # no model ran, so the type was picked by hand

    photo = client.get(f"/reports/{report_id}/photo")
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/jpeg"


def test_an_upload_can_only_be_submitted_once(client):
    upload_id = _upload(client)
    body = {"upload_id": upload_id, "issue_type": "pothole", "location": list(BEEHIVE), "location_source": "device"}
    assert client.post("/reports", json=body).status_code == 201
    assert client.post("/reports", json=body).status_code == 410


def test_reports_survive_a_restart_and_can_be_cleared(client):
    upload_id = _upload(client)
    client.post("/reports", json={"upload_id": upload_id, "issue_type": "graffiti", "location": list(BEEHIVE), "location_source": "exif"})
    with TestClient(app) as restarted:
        assert len(restarted.get("/reports").json()["reports"]) == 1
        assert restarted.delete("/reports").json() == {"deleted": 1}
        assert restarted.get("/reports").json()["reports"] == []


# --- requests: a bike lane gets a proposal, not a repair -----------------------


def test_bike_lane_request_is_never_offered_to_the_detector():
    assert "bike_lane" not in detect.RESPONSE_SCHEMA["properties"]["issues"]["items"]["properties"]["type"]["enum"]


def test_bike_lane_report_runs_a_proposal_job(client, monkeypatch):
    from scan_api import proposal

    analysis = proposal.normalize_analysis({
        "is_street": True, "street_summary": "Four-lane street with parking.", "travel_lanes": 4,
        "has_street_parking": True, "existing_bike_facility": "none", "recommended_design": "protected_bike_lane",
        "design_rationale": "Wide and fast.", "space_source": "convert_parking_lane", "side_of_street": "both sides",
        "benefits": [{"group": "People biking", "effect": "Separated from traffic."}],
        "tradeoffs": [{"group": "Residents who park", "effect": "Fewer curb spaces."}],
        "open_questions": ["Driveway count?"], "unexpected": "dropped",
    })
    monkeypatch.setattr(proposal, "analyze_street", lambda jpeg: analysis)
    monkeypatch.setattr(proposal, "render_concept", lambda jpeg, a: proposal.Rendering(_jpeg(), "image/jpeg", "m"))

    upload_id = _upload(client)
    response = client.post(
        "/reports",
        json={"upload_id": upload_id, "issue_type": "bike_lane", "location": list(BEEHIVE), "location_source": "manual"},
    )
    report_id = response.json()["id"]
    app.state.jobs.shutdown(wait=True)  # let the background job finish

    report = client.get("/reports").json()["reports"][0]
    assert report["proposal"]["state"] == "done"
    assert report["proposal"]["analysis"]["design_label"] == "Protected bike lane"
    assert "unexpected" not in report["proposal"]["analysis"]
    assert client.get(f"/reports/{report_id}/rendering").status_code == 200
    assert report["assessment"]["status"] == "not_modeled"


def test_rendering_keeps_the_photo_shape():
    from scan_api import proposal

    portrait = BytesIO(); Image.new("RGB", (900, 1200)).save(portrait, "JPEG")
    assert proposal.closest_aspect_ratio(portrait.getvalue()) == "3:4"
