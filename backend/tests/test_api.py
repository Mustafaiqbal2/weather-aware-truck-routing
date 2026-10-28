"""End-to-end API behaviour with faked providers."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from providers import routing, tomtom
from tests.conftest import DESTINATION, ORIGIN

DENVER = ZoneInfo("America/Denver")


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def _departure(hours_ahead: float = 2) -> str:
    t = datetime.now(DENVER) + timedelta(hours=hours_ahead)
    return t.replace(tzinfo=None).isoformat(timespec="minutes")


def _routes_body(**overrides: Any) -> dict[str, Any]:
    body = {
        "origin": {"lat": ORIGIN[0], "lon": ORIGIN[1], "label": "Denver, CO"},
        "destination": {"lat": DESTINATION[0], "lon": DESTINATION[1], "label": "Goodland, KS"},
        "departure": _departure(),
        "load_lb": 42_000,
        "interval_mi": 25,
    }
    return {**body, **overrides}


def _plan(client: APIClient, **overrides: Any) -> dict[str, Any]:
    response = client.post("/api/routes", _routes_body(**overrides), format="json")
    assert response.status_code == 200, response.json()
    return dict(response.json())


def test_health(client: APIClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_rules_are_published(client: APIClient) -> None:
    rules = client.get("/api/rules").json()
    assert [s["name"] for s in rules["scales"]] == ["wind", "rain", "snow"]
    assert rules["load_rules"][0]["over_lb"] == 30_000


@pytest.mark.usefixtures("fake_tomtom")
def test_routes_returns_three_distinct_routes(client: APIClient) -> None:
    data = _plan(client)
    routes = data["routes"]
    assert [r["id"] for r in routes] == ["A", "B", "C"]
    assert routes[0]["source"] == "tomtom"
    assert routes[1]["source"] == "tomtom_alternative"  # the near-duplicate was skipped
    assert routes[2]["source"] == "detour"
    assert len({r["label"] for r in routes}) == 3
    assert data["origin"]["tz"] == "America/Denver"


@pytest.mark.usefixtures("fake_tomtom")
def test_checkpoints_every_interval_with_increasing_etas(client: APIClient) -> None:
    route = _plan(client, interval_mi=25)["routes"][0]
    cps = route["checkpoints"]
    miles = [c["mile"] for c in cps]
    assert miles[:4] == [0, 25, 50, 75]
    assert miles[-1] == pytest.approx(route["distance_mi"], abs=0.01)
    etas = [datetime.fromisoformat(c["eta"]) for c in cps]
    assert etas == sorted(etas)
    assert etas[0] == datetime.fromisoformat(route["departure"])
    assert etas[-1] == datetime.fromisoformat(route["arrival"])
    # Fake route is driven at a constant 4 h for the whole length.
    halfway = min(cps, key=lambda c: abs(c["mile"] - route["distance_mi"] / 2))
    elapsed = datetime.fromisoformat(halfway["eta"]) - etas[0]
    assert elapsed.total_seconds() == pytest.approx(
        4 * 3600 * halfway["mile"] / route["distance_mi"], rel=0.01
    )


@pytest.mark.usefixtures("fake_tomtom")
def test_routes_sends_gross_weight_to_tomtom(client: APIClient, fake_tomtom: list[Any]) -> None:
    _plan(client, load_lb=40_000)
    assert fake_tomtom[0]["gross_weight_kg"] == round((40_000 + 35_000) * 0.45359237)


@pytest.mark.usefixtures("fake_tomtom")
def test_overweight_warning(client: APIClient) -> None:
    assert any("permit" in w for w in _plan(client, load_lb=50_000)["warnings"])


@pytest.mark.usefixtures("fake_tomtom")
def test_departure_in_the_past_is_rejected(client: APIClient) -> None:
    response = client.post("/api/routes", _routes_body(departure=_departure(-3)), format="json")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_trip"


def test_validation_errors_use_the_error_shape(client: APIClient) -> None:
    response = client.post("/api/routes", _routes_body(load_lb=-5, interval_mi=15), format="json")
    assert response.status_code == 400
    error = response.json()["error"]
    assert set(error["details"]) == {"load_lb", "interval_mi"}


def test_departure_with_offset_is_rejected(client: APIClient) -> None:
    body = _routes_body(departure="2026-11-02T06:30:00-07:00")
    assert client.post("/api/routes", body, format="json").status_code == 400


def test_missing_api_key_is_reported(client: APIClient, settings: Any) -> None:
    settings.TOMTOM_API_KEY = ""
    response = client.post("/api/routes", _routes_body(), format="json")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "not_configured"


def _assess(client: APIClient, plan: dict[str, Any]) -> dict[str, Any]:
    body = {"load_lb": plan["load_lb"], "routes": plan["routes"]}
    response = client.post("/api/assess", body, format="json")
    assert response.status_code == 200, response.json()
    return dict(response.json())


@pytest.mark.usefixtures("fake_tomtom")
def test_assess_calm_weather_recommends_fastest(client: APIClient, fake_weather: Any) -> None:
    result = _assess(client, _plan(client))
    rec = result["recommendation"]
    assert rec["route_id"] == "A"
    assert rec["criterion"] == "duration"
    assert rec["tradeoff"] is None
    assert rec["safe"] is True
    for route in result["routes"]:
        assert route["max_level"] == "low"
        assert route["miles"]["low"] > 0


@pytest.mark.usefixtures("fake_tomtom")
def test_assess_avoids_snow_on_the_fast_route(client: APIClient, fake_weather: Any) -> None:
    # Heavy snow (2.5 in/hr = 6.35 cm/hr, Severe) in a band hugging the straight route.
    def snow_band(lat: float, lon: float, t: int) -> tuple[float, float, float, float]:
        on_straight_route = abs(lat - 39.745) < 0.05 and -103.5 < lon < -101.5
        return (10.0, 0.0, 0.0, 6.35 if on_straight_route else 0.0)

    fake_weather(snow_band)
    plan = _plan(client)
    result = _assess(client, plan)
    by_id = {r["id"]: r for r in result["routes"]}
    assert by_id["A"]["miles"]["severe"] > 50
    rec = result["recommendation"]
    assert rec["route_id"] == "B"  # next fastest of the snow-free routes
    assert rec["criterion"] == "duration"  # B and C are both clean; B is faster
    assert "Severe" in rec["tradeoff"] and "fastest route" in rec["tradeoff"]
    severe_cp = next(
        c for c in by_id["A"]["checkpoints"] if c["risk"] and c["risk"]["level"] == "severe"
    )
    assert severe_cp["risk"]["drivers"] == ["snow"]
    assert severe_cp["weather"]["snow_in_hr"] == pytest.approx(2.5)


@pytest.mark.usefixtures("fake_tomtom")
def test_assess_applies_load_rule(client: APIClient, fake_weather: Any) -> None:
    fake_weather(lambda lat, lon, t: (62.0, 0.0, 0.0, 0.0))  # 38.5 mph: High wind
    plan = _plan(client, load_lb=42_000)
    result = _assess(client, plan)
    cp = result["routes"][0]["checkpoints"][1]
    assert cp["risk"]["wind"] == "high"
    assert cp["risk"]["load"] == "severe"
    assert cp["risk"]["level"] == "severe"


@pytest.mark.usefixtures("fake_tomtom", "weather_down")
def test_weather_rate_limit_is_a_503(client: APIClient) -> None:
    plan = _plan(client)
    response = client.post(
        "/api/assess", {"load_lb": 1000, "routes": plan["routes"]}, format="json"
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "rate_limited"


@pytest.mark.usefixtures("fake_tomtom")
def test_heatmap_frames_cover_the_corridor(client: APIClient, fake_weather: Any) -> None:
    fake_weather(lambda lat, lon, t: (45.0, 3.0, 0.0, 0.0))  # 28 mph Moderate, 0.118 in rain
    plan = _plan(client)
    body = {
        "start": plan["departure"],
        "load_lb": 42_000,
        "routes": [r["geometry"] for r in plan["routes"]],
    }
    response = client.post("/api/heatmap", body, format="json")
    assert response.status_code == 200, response.json()
    data = response.json()
    grid = data["grid"]
    cells = len(grid["cells"])
    assert 150 <= cells <= 320
    assert grid["west"] < ORIGIN[1] and grid["east"] > DESTINATION[1]
    for key in ("risk", "wind", "rain", "snow"):
        raw = base64.b64decode(data["frames"][key])
        assert len(raw) == data["hours"] * cells
    wind = base64.b64decode(data["frames"]["wind"])
    assert wind[0] * data["scales"]["wind"] == pytest.approx(45 / 1.609344, abs=0.5)
    risk = base64.b64decode(data["frames"]["risk"])
    assert 1 <= risk[0] * data["scales"]["risk"] < 2  # Moderate band


@pytest.mark.usefixtures("fake_tomtom")
def test_leave_now(client: APIClient) -> None:
    data = _plan(client, departure="now")
    departure = datetime.fromisoformat(data["departure"])
    assert abs((departure - datetime.now(DENVER)).total_seconds()) < 120


def test_fake_routing_is_ignored_outside_debug(client: APIClient, settings: Any) -> None:
    settings.DEBUG = False
    settings.FAKE_ROUTING = True
    settings.TOMTOM_API_KEY = ""
    response = client.post("/api/routes", _routes_body(), format="json")
    assert response.json()["error"]["code"] == "not_configured"


def test_fake_routing_in_debug(client: APIClient, settings: Any, fake_weather: Any) -> None:
    settings.DEBUG = True
    settings.FAKE_ROUTING = True
    plan = _plan(client)
    assert len(plan["routes"]) == 3
    assert _assess(client, plan)["recommendation"]["route_id"] in {"A", "B", "C"}


def test_reverse_geocode_names_a_point_picked_on_the_map(
    client: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[float, float]] = []

    def fake(lat: float, lon: float) -> tomtom.Place:
        calls.append((lat, lon))
        return tomtom.Place("r1", "Bushnell, NE", "Bushnell, NE 69128", lat, lon, "Point")

    monkeypatch.setattr(routing, "reverse_geocode", fake)
    response = client.get("/api/reverse", {"lat": 41.00012, "lon": -104.00031})
    assert response.status_code == 200
    body = response.json()
    assert body["label"] == "Bushnell, NE"
    assert (body["lat"], body["lon"]) == (41.00012, -104.00031)

    # A second click a few metres away reuses the cached name but keeps its own point.
    again = client.get("/api/reverse", {"lat": 41.00014, "lon": -104.00029}).json()
    assert len(calls) == 1
    assert (again["label"], again["lat"]) == ("Bushnell, NE", 41.00014)


def test_reverse_geocode_over_open_water_is_not_found(
    client: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(routing, "reverse_geocode", lambda lat, lon: None)
    response = client.get("/api/reverse", {"lat": 45.0, "lon": -140.0})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_reverse_geocode_rejects_bad_coordinates(client: APIClient) -> None:
    assert client.get("/api/reverse", {"lat": 95, "lon": 0}).status_code == 400
    assert client.get("/api/reverse", {"lat": 40}).status_code == 400
