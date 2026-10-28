"""Route selection, heatmap grid, and provider response parsing."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
import respx

from core.heatmap_grid import build_grid
from core.route_select import (
    Candidate,
    detour_via_points,
    distance_to_line_m,
    pick_distinct,
    simplify,
)
from providers import openmeteo, tomtom
from tests.conftest import _line
from trips.services import route_labels

# --- route selection ---------------------------------------------------------------


def test_pick_distinct_skips_near_duplicates_and_slow_routes() -> None:
    main = Candidate("main", _line(0.0), 3600)
    twin = Candidate("twin", _line(0.003), 3610)
    north = Candidate("north", _line(0.9), 4000)
    crawl = Candidate("crawl", _line(-0.9), 3600 * 1.7)
    south = Candidate("south", _line(-0.8), 4200)
    picked = pick_distinct([main, twin, north, crawl, south])
    assert [c.key for c in picked] == ["main", "north", "south"]


def test_pick_distinct_relaxes_when_short_of_routes() -> None:
    main = Candidate("main", _line(0.0), 3600)
    close = Candidate("close", _line(0.15), 3700)  # shares a lot of road, but not all
    picked = pick_distinct([main, close])
    assert [c.key for c in picked] == ["main", "close"]


def test_detour_points_sit_either_side_of_the_trip() -> None:
    o, d = (39.74, -104.99), (39.75, -100.0)
    north, south = detour_via_points(o, d)
    assert north[0] > 40.0 and south[0] < 39.5
    assert -103.5 < north[1] < -101.5


def test_simplify_keeps_shape_with_far_fewer_points() -> None:
    line = _line(0.5, n=2000)
    simple = simplify(line)
    assert len(simple) < 200
    assert simple[0] == pytest.approx(line[0], abs=1e-6)
    assert simple[-1] == pytest.approx(line[-1], abs=1e-6)
    worst = max(distance_to_line_m(p, simple) for p in line[::50])
    assert worst < 20


def test_route_labels_are_distinct() -> None:
    labels = route_labels([["I-70", "US-24"], ["I-70", "US-24", "CO-94"], []])
    assert labels == ["via I-70 & US-24", "via I-70 & US-24 & CO-94", "Route C"]


# --- heatmap grid ------------------------------------------------------------------


def test_grid_keeps_only_corridor_cells_near_target_count() -> None:
    grid = build_grid([_line(0.0), _line(0.9)], buffer_m=80_000, target_cells=240)
    assert 190 <= len(grid.cells) <= 290
    assert all(d <= 80_000 for d in grid.distance_m)
    assert max(grid.cells) < grid.cols * grid.rows
    assert grid.west < -104.99 and grid.east > -100.0
    assert grid.south < 39.74 and grid.north > 40.6


def test_grid_rows_run_north_to_south() -> None:
    grid = build_grid([_line(0.0)], target_cells=120)
    first, last = grid.centers[0], grid.centers[-1]
    assert first[0] > last[0]


# --- TomTom parsing ----------------------------------------------------------------

TOMTOM_ROUTE: dict[str, Any] = {
    "summary": {"lengthInMeters": 3000, "travelTimeInSeconds": 300, "trafficDelayInSeconds": 30},
    "legs": [
        {
            "points": [
                {"latitude": 40.0, "longitude": -105.0},
                {"latitude": 40.0, "longitude": -104.99},
            ]
        },
        {
            "points": [
                {"latitude": 40.0, "longitude": -104.99},
                {"latitude": 40.0, "longitude": -104.97},
            ]
        },
    ],
    "progress": [
        {"pointIndex": 0, "travelTimeInSeconds": 0, "distanceInMeters": 0},
        {"pointIndex": 3, "travelTimeInSeconds": 300, "distanceInMeters": 3000},
    ],
    "guidance": {
        "instructions": [
            {"routeOffsetInMeters": 0, "street": "Colfax Ave"},
            {"routeOffsetInMeters": 500, "roadNumbers": ["I-70"]},
            {"routeOffsetInMeters": 2900, "street": "Main St"},
        ]
    },
}


def test_parse_tomtom_route_joins_legs_and_ranks_roads() -> None:
    raw = tomtom._parse_route(TOMTOM_ROUTE)
    assert len(raw.points) == 4
    assert raw.travel_time_s == 300
    assert raw.progress == [(0, 0.0), (3, 300.0)]
    assert raw.roads == ["I-70", "Colfax Ave", "Main St"]


@respx.mock
def test_tomtom_request_uses_truck_profile(settings: Any) -> None:
    settings.TOMTOM_API_KEY = "test-key"
    route = respx.get(url__regex=r"https://api\.tomtom\.com/routing/1/calculateRoute/.*").mock(
        return_value=httpx.Response(200, json={"routes": [TOMTOM_ROUTE]})
    )
    routes = tomtom.calculate_routes(
        [(40.0, -105.0), (40.0, -104.97)], depart_at=None, gross_weight_kg=34_000
    )
    assert len(routes) == 1
    params = route.calls.last.request.url.params
    assert params["travelMode"] == "truck"
    assert params["vehicleWeight"] == "34000"
    assert params["vehicleCommercial"] == "true"
    assert params.get_list("extendedRouteRepresentation") == ["travelTime", "distance"]


@respx.mock
def test_tomtom_search_parses_places(settings: Any) -> None:
    settings.TOMTOM_API_KEY = "test-key"
    respx.get(url__regex=r"https://api\.tomtom\.com/search/2/search/.*").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": "x1",
                        "type": "Geography",
                        "address": {
                            "freeformAddress": "Denver, CO",
                            "municipality": "Denver",
                            "countrySubdivision": "CO",
                        },
                        "position": {"lat": 39.74, "lon": -104.99},
                    }
                ]
            },
        )
    )
    [place] = tomtom.search_places("denver")
    assert (place.label, place.detail) == ("Denver, CO", "Denver, CO")
    assert (place.lat, place.lon) == (39.74, -104.99)


# --- Open-Meteo parsing ------------------------------------------------------------


def _om_item(wind: float) -> dict[str, Any]:
    return {
        "hourly": {
            "time": [1_800_000_000, 1_800_003_600],
            "wind_speed_10m": [wind, wind],
            "wind_gusts_10m": [wind, wind],
            "rain": [0.0, 0.0],
            "showers": [0.0, 0.0],
            "snowfall": [0.0, 0.0],
            "weather_code": [0, 0],
        }
    }


@respx.mock
def test_open_meteo_batches_dedupes_and_caches() -> None:
    from datetime import UTC, datetime

    route = respx.get(url__regex=r"https://api\.open-meteo\.com/v1/forecast.*").mock(
        return_value=httpx.Response(200, json=[_om_item(5), _om_item(9)])
    )
    start = datetime.fromtimestamp(1_800_000_000, UTC)
    points = [(40.001, -105.0), (41.0, -100.0), (40.0, -105.0)]  # first and last round alike
    series = openmeteo.fetch_hourly(points, start, start)
    assert route.call_count == 1
    assert [s.wind_kmh[0] for s in series] == [5, 9, 5]
    assert route.calls.last.request.url.params["timeformat"] == "unixtime"
    openmeteo.fetch_hourly(points, start, start)
    assert route.call_count == 1  # served from cache


@respx.mock
def test_open_meteo_single_location_object_response() -> None:
    from datetime import UTC, datetime

    respx.get(url__regex=r"https://api\.open-meteo\.com/v1/forecast.*").mock(
        return_value=httpx.Response(200, json=_om_item(7))
    )
    start = datetime.fromtimestamp(1_800_000_000, UTC)
    [series] = openmeteo.fetch_hourly([(45.0, -110.0)], start, start)
    assert series.wind_kmh[0] == 7
