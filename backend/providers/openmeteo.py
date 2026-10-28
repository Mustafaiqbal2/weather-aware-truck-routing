"""Open-Meteo hourly forecast client.

Everything is requested in metric (km/h, mm, cm) and converted in ``core.units``, so
there is a single, tested place where unit handling happens.
"""

from __future__ import annotations

from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from typing import Any

from django.conf import settings
from django.core.cache import cache

from core.weather_align import HourlySeries

from .http import get_json

SERVICE = "Open-Meteo"
HOURLY_VARIABLES = (
    "wind_speed_10m",
    "wind_gusts_10m",
    "rain",
    "showers",
    "snowfall",
    "weather_code",
)
CHUNK_SIZE = 100  # locations per request; keeps URLs short
MAX_PARALLEL = 4
CACHE_TTL_S = 30 * 60  # forecasts update hourly
COORD_DECIMALS = 2  # ~1 km; finer than the 3 km HRRR grid behind US forecasts
FORECAST_HORIZON = timedelta(days=16)

Coord = tuple[float, float]


def hour_floor(t: datetime) -> datetime:
    return t.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def hour_ceil(t: datetime) -> datetime:
    floor = hour_floor(t)
    return floor if floor == t else floor + timedelta(hours=1)


def forecast_end_limit(now: datetime | None = None) -> datetime:
    return hour_floor(now or datetime.now(UTC)) + FORECAST_HORIZON - timedelta(hours=1)


def fetch_hourly(points: Sequence[Coord], start: datetime, end: datetime) -> list[HourlySeries]:
    """Hourly series covering [start, end] (UTC, whole hours) for every point, in order."""
    start, end = hour_floor(start), hour_ceil(end)
    end = min(end, forecast_end_limit())
    if end < start:
        end = start
    rounded = [(round(lat, COORD_DECIMALS), round(lon, COORD_DECIMALS)) for lat, lon in points]

    results: dict[Coord, HourlySeries] = {}
    missing: list[Coord] = []
    for coord in dict.fromkeys(rounded):
        cached = cache.get(_cache_key(coord, start, end))
        if cached is not None:
            results[coord] = cached
        else:
            missing.append(coord)

    chunks = [missing[i : i + CHUNK_SIZE] for i in range(0, len(missing), CHUNK_SIZE)]
    if chunks:
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
            for chunk, series in zip(
                chunks, pool.map(lambda c: _fetch_chunk(c, start, end), chunks), strict=True
            ):
                for coord, s in zip(chunk, series, strict=True):
                    results[coord] = s
                    cache.set(_cache_key(coord, start, end), s, CACHE_TTL_S)
    return [results[c] for c in rounded]


def _cache_key(coord: Coord, start: datetime, end: datetime) -> str:
    return f"om:{coord[0]}:{coord[1]}:{int(start.timestamp())}:{int(end.timestamp())}"


def _fetch_chunk(chunk: Sequence[Coord], start: datetime, end: datetime) -> list[HourlySeries]:
    params: dict[str, Any] = {
        "latitude": ",".join(f"{lat}" for lat, _ in chunk),
        "longitude": ",".join(f"{lon}" for _, lon in chunk),
        "hourly": ",".join(HOURLY_VARIABLES),
        "timezone": "GMT",
        "timeformat": "unixtime",
        "start_hour": start.strftime("%Y-%m-%dT%H:%M"),
        "end_hour": end.strftime("%Y-%m-%dT%H:%M"),
    }
    if settings.OPEN_METEO_API_KEY:
        params["apikey"] = settings.OPEN_METEO_API_KEY
    data = get_json(SERVICE, f"{settings.OPEN_METEO_BASE_URL}/v1/forecast", params, attempts=4)
    items = data if isinstance(data, list) else [data]
    if len(items) != len(chunk):
        raise ValueError(f"Open-Meteo returned {len(items)} locations for {len(chunk)} requested")
    return [_parse(item) for item in items]


def _parse(item: dict[str, Any]) -> HourlySeries:
    h = item["hourly"]
    return HourlySeries(
        times=[int(t) for t in h["time"]],
        wind_kmh=h["wind_speed_10m"],
        gust_kmh=h["wind_gusts_10m"],
        rain_mm=h["rain"],
        showers_mm=h["showers"],
        snow_cm=h["snowfall"],
        weather_code=h["weather_code"],
    )
