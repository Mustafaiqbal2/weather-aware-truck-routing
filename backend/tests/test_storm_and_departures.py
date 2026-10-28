"""Storm drill overlay and best-departure ranking."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from rest_framework.test import APIClient

from core.ranking import DepartureOption, RouteScore, best_departure, explain_departure
from core.risk import RiskLevel
from core.storm import StormFrame, overlay
from core.weather_align import HourlySeries
from tests.conftest import DESTINATION, ORIGIN

T0 = datetime(2026, 11, 2, 12, tzinfo=UTC).timestamp()
# Due east trip, ~430 km: the storm starts 40% along (~172 km east of the origin).
FRAME = StormFrame(origin=(40.0, -105.0), destination=(40.0, -100.0), start_ts=T0)
KM_PER_DEG_LON = 110.57 * 0.766  # at 40°N


def centre_lon(hours: float) -> float:
    """Where the storm's centre is after drifting east at 30 km/h."""
    trip_km = 5 * KM_PER_DEG_LON
    return -105.0 + (0.4 * trip_km + 30 * hours) / KM_PER_DEG_LON


def test_storm_core_is_left_of_travel_with_snow_and_wind() -> None:
    wind, rain, snow = FRAME.conditions(40.4, centre_lon(6), T0 + 6 * 3600)  # north of the axis
    assert snow > 6.0 and wind > 60
    assert rain < 1.0


def test_storm_brings_rain_to_the_right_of_travel() -> None:
    _wind, rain, snow = FRAME.conditions(39.37, centre_lon(6), T0 + 6 * 3600)  # south of the axis
    assert rain > 8.0
    assert snow < 1.0


def test_storm_drifts_towards_the_destination_and_dies_out() -> None:
    def snow_at(lon: float, hours: float) -> float:
        return FRAME.conditions(40.4, lon, T0 + hours * 3600)[2]

    assert snow_at(centre_lon(0), 0) > snow_at(centre_lon(0) + 2, 0)
    assert snow_at(centre_lon(6), 6) > 5 * snow_at(centre_lon(0), 6)  # moved ~180 km east
    assert snow_at(-99.0, 28) == 0  # faded


def test_far_from_the_storm_adds_nothing() -> None:
    assert FRAME.conditions(45.0, -90.0, T0) == (0.0, 0.0, 0.0)


def test_overlay_takes_the_larger_value_and_keeps_missing_data() -> None:
    series = HourlySeries(
        times=[int(T0) + 6 * 3600, int(T0) + 7 * 3600],
        wind_kmh=[80.0, None],
        gust_kmh=[90.0, None],
        rain_mm=[0.0, 1.0],
        showers_mm=[0.0, 4.0],
        snow_cm=[0.0, 0.0],
        weather_code=[0, 0],
    )
    out = overlay(series, (40.4, centre_lon(6)), FRAME)
    assert out.wind_kmh[0] == 80.0  # real wind is stronger than the storm's
    assert out.snow_cm[0] is not None and out.snow_cm[0] > 6.0
    assert out.weather_code[0] == 75
    assert out.wind_kmh[1] is None  # missing real data stays missing
    # Real showers count as rain: 1 mm + 4 mm beats the storm's light rain this far north.
    assert out.rain_mm[1] == pytest.approx(5.0)


# --- Departure ranking ------------------------------------------------------------


def _opt(
    offset: int, *, severe: float = 0, high: float = 0, complete: bool = True
) -> DepartureOption:
    miles = {lvl: 0.0 for lvl in RiskLevel}
    miles.update({RiskLevel.LOW: 100.0, RiskLevel.SEVERE: severe, RiskLevel.HIGH: high})
    score = RouteScore("A", "Route A", miles, 0.0, 0.0, 10 * 3600)
    return DepartureOption(offset, score, complete)


def test_best_departure_avoids_severe_then_prefers_earliest() -> None:
    options = [_opt(0, severe=120), _opt(2, severe=40), _opt(4), _opt(6)]
    best = best_departure(options)
    assert best is not None and best.offset_h == 4
    assert explain_departure(options[0], best) == (
        "Leaving 4 hours later cuts Severe miles from 120 mi to none."
    )


def test_incomplete_forecasts_never_win() -> None:
    options = [_opt(0, severe=50), _opt(22, complete=False)]
    best = best_departure(options)
    assert best is not None and best.offset_h == 0
    assert explain_departure(options[0], best).startswith("Leaving as planned")


def test_no_usable_departures() -> None:
    assert best_departure([_opt(0, complete=False)]) is None


# --- Through the API ----------------------------------------------------------------


@pytest.mark.usefixtures("fake_tomtom", "fake_weather")
def test_storm_drill_recommends_waiting() -> None:
    client = APIClient()
    plan = client.post(
        "/api/routes",
        {
            "origin": {"lat": ORIGIN[0], "lon": ORIGIN[1], "label": "Denver"},
            "destination": {"lat": DESTINATION[0], "lon": DESTINATION[1], "label": "Goodland"},
            "departure": "now",
            "load_lb": 42_000,
            "interval_mi": 10,
        },
        format="json",
    ).json()
    body: dict[str, Any] = {"load_lb": 42_000, "routes": plan["routes"], "scenario": "storm"}
    result = client.post("/api/assess", body, format="json").json()

    assert result["scenario"] == "storm"
    worst = max(r["miles"]["severe"] + r["miles"]["no_travel"] for r in result["routes"])
    assert worst > 20  # the storm sits across the trip
    departures = result["departures"]
    assert len(departures["options"]) == 13
    assert departures["best_offset_h"] > 0
    assert "later" in departures["reason"]
    best = departures["options"][departures["best_offset_h"] // 2]
    assert best["miles"]["severe"] + best["miles"]["no_travel"] < worst

    live = client.post("/api/assess", {**body, "scenario": "live"}, format="json").json()
    assert live["scenario"] == "live"
    assert all(r["max_level"] == "low" for r in live["routes"])
    assert live["departures"]["best_offset_h"] == 0
