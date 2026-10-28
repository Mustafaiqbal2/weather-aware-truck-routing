"""Shared fakes: deterministic routes and weather so API tests never touch the network."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np
import pytest
from django.core.cache import cache

from core.weather_align import HourlySeries
from providers import tomtom
from providers.http import UpstreamError

Coord = tuple[float, float]

# Denver-ish to western Kansas along ~40°N (about 265 miles). Three corridors.
ORIGIN = (39.74, -104.99)
DESTINATION = (39.75, -100.0)


def _line(bend_deg: float, n: int = 400) -> list[Coord]:
    lons = np.linspace(ORIGIN[1], DESTINATION[1], n)
    lats = np.linspace(ORIGIN[0], DESTINATION[0], n) + bend_deg * np.sin(np.linspace(0, np.pi, n))
    return [(float(a), float(b)) for a, b in zip(lats, lons, strict=True)]


def fake_route(bend_deg: float, hours: float, roads: list[str]) -> tomtom.RawRoute:
    pts = _line(bend_deg)
    total_s = hours * 3600
    progress = [(i, total_s * i / (len(pts) - 1)) for i in range(0, len(pts), 50)]
    progress.append((len(pts) - 1, total_s))
    return tomtom.RawRoute(
        points=pts,
        length_m=0.0,
        travel_time_s=total_s,
        traffic_delay_s=120,
        progress=progress,
        roads=roads,
    )


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    cache.clear()


@pytest.fixture
def fake_tomtom(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Main route plus one near-duplicate and one genuinely different alternative."""
    calls: list[dict[str, Any]] = []

    def calculate_routes(locations: Sequence[Coord], **kwargs: Any) -> list[tomtom.RawRoute]:
        calls.append({"locations": list(locations), **kwargs})
        if len(locations) == 2:
            return [
                fake_route(0.0, 4.0, ["I-70", "US-24"]),
                fake_route(0.002, 4.05, ["I-70", "US-24"]),  # near-duplicate: rejected
                fake_route(0.9, 4.6, ["US-36", "CO-71"]),
            ]
        bend = -0.9 if locations[1][0] < ORIGIN[0] else 1.4
        return [fake_route(bend, 4.9, ["US-40", "I-70"])]

    monkeypatch.setattr(tomtom, "calculate_routes", calculate_routes)
    monkeypatch.setattr("trips.services.tomtom.calculate_routes", calculate_routes)
    return calls


WeatherFn = Callable[[float, float, int], tuple[float, float, float, float]]


def calm(lat: float, lon: float, t: int) -> tuple[float, float, float, float]:
    """(wind km/h, rain mm, showers mm, snow cm)."""
    return (10.0, 0.0, 0.0, 0.0)


@pytest.fixture
def fake_weather(monkeypatch: pytest.MonkeyPatch) -> Callable[[WeatherFn], None]:
    def install(fn: WeatherFn) -> None:
        def fetch_hourly(
            points: Sequence[Coord], start: datetime, end: datetime
        ) -> list[HourlySeries]:
            s = start.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
            hours = int((end - s) / timedelta(hours=1)) + 2
            times = [int((s + timedelta(hours=h)).timestamp()) for h in range(hours)]
            out = []
            for lat, lon in points:
                vals = [fn(lat, lon, t) for t in times]
                out.append(
                    HourlySeries(
                        times=times,
                        wind_kmh=[v[0] for v in vals],
                        gust_kmh=[v[0] * 1.5 for v in vals],
                        rain_mm=[v[1] for v in vals],
                        showers_mm=[v[2] for v in vals],
                        snow_cm=[v[3] for v in vals],
                        weather_code=[0 for _ in vals],
                    )
                )
            return out

        monkeypatch.setattr("trips.services.openmeteo.fetch_hourly", fetch_hourly)

    install(calm)
    return install


@pytest.fixture
def weather_down(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(*args: Any, **kwargs: Any) -> None:
        raise UpstreamError("Open-Meteo", 429, "Too many requests")

    monkeypatch.setattr("trips.services.openmeteo.fetch_hourly", fail)
