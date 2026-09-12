"""The nearest-cooling lookup walks real streets to real facilities."""

from fastapi.testclient import TestClient

from data.cooling_places import cooling_places
from main import app

VENUE = (-118.25747, 33.9853)


def test_returns_the_closest_places_in_walking_order():
    with TestClient(app) as client:
        body = client.get("/cooling/nearest", params={"lon": VENUE[0], "lat": VENUE[1], "limit": 3}).json()

    places = body["places"]
    assert len(places) == 3
    assert [p["walk_metres"] for p in places] == sorted(p["walk_metres"] for p in places)
    names = {place.name for place in cooling_places()}
    for place in places:
        assert place["name"] in names
        assert tuple(place["path"][0]) == VENUE
        assert tuple(place["path"][-1]) == tuple(place["location"])
        assert place["walk_minutes"] > 0


def test_every_place_is_reachable_on_foot():
    with TestClient(app) as client:
        body = client.get("/cooling/nearest", params={"lon": VENUE[0], "lat": VENUE[1], "limit": 10}).json()

    assert len(body["places"]) == len(cooling_places())


def test_a_location_outside_the_demo_area_is_rejected():
    with TestClient(app) as client:
        response = client.get("/cooling/nearest", params={"lon": -118.0, "lat": 34.2})

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "outside_demo_area"
