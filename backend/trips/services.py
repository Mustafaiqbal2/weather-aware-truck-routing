"""Application services: glue between the HTTP layer, providers and the pure core.

Each function serves one endpoint and is stateless, so any function instance can answer
any request.
"""

from __future__ import annotations

import base64
import logging
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
from timezonefinder import TimezoneFinder

from core.eta import travel_times_at
from core.geo import cumulative_distances_m, sample_checkpoints
from core.heatmap_grid import build_grid
from core.mileage import MileBreakdown, attribute_miles
from core.ranking import (
    DepartureOption,
    RouteScore,
    best_departure,
    explain_departure,
    recommend,
)
from core.risk import Assessment, RiskLevel, assess_conditions, risk_index
from core.route_select import Candidate, detour_via_points, pick_distinct, simplify
from core.storm import StormFrame, overlay
from core.units import (
    LEGAL_GROSS_LIMIT_LB,
    cm_to_in,
    gross_weight_lb,
    kmh_to_mph,
    lb_to_kg,
    meters_to_miles,
    miles_to_meters,
    mm_to_in,
)
from core.weather_align import HourlySeries, WeatherAt, weather_at
from providers import openmeteo, routing, tomtom
from providers.http import UpstreamError

from .errors import ProviderError

logger = logging.getLogger(__name__)

Coord = tuple[float, float]

MAX_ADVANCE = timedelta(days=7)
PAST_GRACE = timedelta(minutes=15)
HEATMAP_HOURS = 48
ROUTE_IDS = ("A", "B", "C")


class TripInputError(ValueError):
    """The request is well-formed but can't be planned (e.g. departure in the past)."""


@lru_cache(maxsize=1)
def _tz_finder() -> TimezoneFinder:
    return TimezoneFinder(in_memory=True)


def tz_at(lat: float, lon: float) -> str:
    return _tz_finder().timezone_at(lng=lon, lat=lat) or "UTC"


def iso(t: datetime) -> str:
    return t.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def upstream_error(exc: UpstreamError) -> ProviderError:
    if exc.status == 429:
        return ProviderError(
            f"{exc.service} is rate-limiting requests right now. Try again in a minute.",
            code="rate_limited",
            http_status=503,
        )
    if exc.status in (400, 404):
        return ProviderError(
            f"{exc.service} rejected the request: {exc.message}", code="bad_request"
        )
    if exc.status in (401, 403):
        return ProviderError(
            f"{exc.service} refused our API key. Check the server configuration.",
            code="provider_auth",
        )
    return ProviderError(f"{exc.service} is unavailable: {exc.message}")


# --- Routes -----------------------------------------------------------------------


@dataclass(frozen=True)
class Place:
    lat: float
    lon: float
    label: str


@dataclass(frozen=True)
class _Option:
    candidate: Candidate
    raw: tomtom.RawRoute
    source: str  # "tomtom" | "tomtom_alternative" | "detour"


def plan_routes(
    origin: Place,
    destination: Place,
    departure_local: datetime | None,
    load_lb: float,
    interval_mi: int,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Plan routes. ``departure_local`` is wall-clock time at the origin; None means now."""
    now = (now or datetime.now(UTC)).replace(second=0, microsecond=0)
    origin_tz = tz_at(origin.lat, origin.lon)
    departure = (
        departure_local.replace(tzinfo=ZoneInfo(origin_tz)).astimezone(UTC)
        if departure_local is not None
        else now
    )
    if departure < now - PAST_GRACE:
        raise TripInputError("Departure time is in the past.")
    if departure > now + MAX_ADVANCE:
        raise TripInputError("Departure must be within the next 7 days so forecasts stay useful.")
    departure = max(departure, now)

    options = _route_options(
        (origin.lat, origin.lon), (destination.lat, destination.lon), departure, now, load_lb
    )
    chosen = pick_distinct([o.candidate for o in options.values()], count=3)
    if not chosen:
        raise ProviderError("No truck route was found between these places.", code="no_route")
    picked = [options[c.key] for c in chosen]
    labels = route_labels([o.raw.roads for o in picked])

    routes = [
        _route_payload(route_id, option, label, departure, interval_mi)
        for route_id, option, label in zip(ROUTE_IDS, picked, labels, strict=False)
    ]
    warnings: list[str] = []
    gross = gross_weight_lb(load_lb)
    if gross > LEGAL_GROSS_LIMIT_LB:
        warnings.append(
            f"Estimated gross weight is {gross:,.0f} lb, over the {LEGAL_GROSS_LIMIT_LB:,} lb "
            "federal limit. An overweight permit is required."
        )
    if len(routes) < 3:
        warnings.append(f"Only {len(routes)} distinct truck route(s) exist for this trip.")
    return {
        "origin": {"lat": origin.lat, "lon": origin.lon, "label": origin.label, "tz": origin_tz},
        "destination": {
            "lat": destination.lat,
            "lon": destination.lon,
            "label": destination.label,
            "tz": tz_at(destination.lat, destination.lon),
        },
        "departure": iso(departure),
        "load_lb": load_lb,
        "interval_mi": interval_mi,
        "routes": routes,
        "warnings": warnings,
    }


# TomTom's compute time grows fast with alternatives on long trips (Denver to Chicago:
# about 6 s for 2, 15 s for 4). Two alternatives plus the two detours give five candidates.
MAIN_ALTERNATIVES = 2


def _route_options(
    origin: Coord, destination: Coord, departure: datetime, now: datetime, load_lb: float
) -> dict[str, _Option]:
    """Main route with alternatives, plus two forced detours, requested in parallel."""
    depart_at = departure if departure > now + timedelta(minutes=2) else None
    weight_kg = round(lb_to_kg(gross_weight_lb(load_lb)))

    def call(locations: list[Coord], alternatives: int) -> list[tomtom.RawRoute]:
        return routing.calculate_routes(
            locations, depart_at=depart_at, gross_weight_kg=weight_kg,
            max_alternatives=alternatives,
        )  # fmt: skip

    vias = detour_via_points(origin, destination)
    with ThreadPoolExecutor(max_workers=3) as pool:
        main_future = pool.submit(call, [origin, destination], MAIN_ALTERNATIVES)
        detour_futures = [pool.submit(call, [origin, via, destination], 0) for via in vias]
        try:
            main = main_future.result()
        except UpstreamError as exc:
            raise upstream_error(exc) from exc
        detours: list[tomtom.RawRoute] = []
        for future in detour_futures:
            try:
                detours.extend(future.result()[:1])
            except UpstreamError as exc:  # a detour is optional; the main route is not
                logger.warning("Detour route failed: %s", exc)

    options: dict[str, _Option] = {}
    for i, raw in enumerate(main):
        source = "tomtom" if i == 0 else "tomtom_alternative"
        options[f"main{i}"] = _Option(
            Candidate(f"main{i}", raw.points, raw.travel_time_s), raw, source
        )
    for i, raw in enumerate(detours):
        options[f"via{i}"] = _Option(
            Candidate(f"via{i}", raw.points, raw.travel_time_s), raw, "detour"
        )
    return {k: v for k, v in options.items() if len(v.raw.points) >= 2}


def route_labels(roads: Sequence[Sequence[str]]) -> list[str]:
    """Short distinct names such as "via I-80 & I-88" from each route's main roads."""
    labels: list[str] = []
    for i, names in enumerate(roads):
        depth = 2
        label = _via(names, depth)
        while label in labels and depth < len(names):
            depth += 1
            label = _via(names, depth)
        if not label or label in labels:
            label = f"Route {ROUTE_IDS[i]}"
        labels.append(label)
    return labels


def _via(names: Sequence[str], depth: int) -> str:
    top = list(names[:depth])
    return f"via {' & '.join(top)}" if top else ""


def _route_payload(
    route_id: str, option: _Option, label: str, departure: datetime, interval_mi: int
) -> dict[str, Any]:
    raw = option.raw
    cum = cumulative_distances_m(raw.points)
    total_m = float(cum[-1])
    progress = list(raw.progress)
    last = len(raw.points) - 1
    if not progress or progress[0][0] != 0:
        progress.insert(0, (0, 0.0))
    if progress[-1][0] != last:
        progress.append((last, raw.travel_time_s))
    checkpoints = sample_checkpoints(raw.points, interval_mi)
    seconds = travel_times_at(cum, progress, [c.distance_m for c in checkpoints], raw.travel_time_s)
    return {
        "id": route_id,
        "label": label,
        "source": option.source,
        "roads": raw.roads[:6],
        "distance_mi": round(meters_to_miles(total_m), 2),
        "duration_s": round(raw.travel_time_s),
        "traffic_delay_s": round(raw.traffic_delay_s),
        "departure": iso(departure),
        "arrival": iso(departure + timedelta(seconds=raw.travel_time_s)),
        "geometry": [[round(lon, 5), round(lat, 5)] for lat, lon in simplify(raw.points)],
        "checkpoints": [
            {
                "index": c.index,
                "mile": round(meters_to_miles(c.distance_m), 2),
                "lat": round(c.lat, 5),
                "lon": round(c.lon, 5),
                "eta": iso(departure + timedelta(seconds=float(s))),
                "tz": tz_at(c.lat, c.lon),
            }
            for c, s in zip(checkpoints, seconds, strict=True)
        ],
    }


# --- Assessment ---------------------------------------------------------------------

DEPARTURE_WINDOW_H = 24
DEPARTURE_STEP_H = 2


def _weather(
    points: Sequence[Coord], start: datetime, end: datetime, storm: StormFrame | None
) -> list[HourlySeries]:
    try:
        series = openmeteo.fetch_hourly(points, start, end)
    except UpstreamError as exc:
        raise upstream_error(exc) from exc
    if storm is None:
        return series
    return [overlay(s, p, storm) for s, p in zip(series, points, strict=True)]


def _storm_for(origin: Coord, destination: Coord, departure: datetime) -> StormFrame:
    return StormFrame(origin, destination, openmeteo.hour_floor(departure).timestamp())


@dataclass(frozen=True)
class _Scored:
    score: RouteScore
    miles: MileBreakdown
    rows: list[tuple[WeatherAt | None, Assessment | None]]


def _score_route(
    route: dict[str, Any], series: Sequence[HourlySeries], load_lb: float, shift_s: float
) -> _Scored:
    """Weather and risk at every checkpoint if the truck left ``shift_s`` seconds later."""
    rows: list[tuple[WeatherAt | None, Assessment | None]] = []
    for cp, s in zip(route["checkpoints"], series, strict=True):
        w = weather_at(s, cp["eta"].timestamp() + shift_s)
        a = assess_conditions(w.wind_mph, w.rain_in_hr, w.snow_in_hr, load_lb) if w else None
        rows.append((w, a))
    miles = attribute_miles(
        [miles_to_meters(cp["mile"]) for cp in route["checkpoints"]],
        [a.level if a else None for _, a in rows],
        total_m=miles_to_meters(route["distance_mi"]),
    )
    score = RouteScore(
        route_id=route["id"],
        label=route["label"],
        miles=miles.by_level,
        unknown_miles=miles.unknown,
        average_risk=miles.average_risk,
        duration_s=route["duration_s"],
    )
    return _Scored(score, miles, rows)


def _max_level(miles: dict[RiskLevel, float]) -> str | None:
    present = [lvl for lvl, mi in miles.items() if mi > 0.05]
    return max(present).key if present else None


def _miles_payload(miles: MileBreakdown) -> dict[str, float]:
    return {
        **{lvl.key: round(mi, 2) for lvl, mi in miles.by_level.items()},
        "unknown": round(miles.unknown, 2),
    }


def assess_routes(
    routes: Sequence[dict[str, Any]], load_lb: float, scenario: str = "live"
) -> dict[str, Any]:
    """Weather and risk at every checkpoint, miles per level, the recommendation, and the
    best departure time within the next 24 hours."""
    checkpoints = [cp for r in routes for cp in r["checkpoints"]]
    etas = [cp["eta"] for cp in checkpoints]
    departure = min(etas)
    first = routes[0]["checkpoints"]
    storm = (
        _storm_for(
            (first[0]["lat"], first[0]["lon"]), (first[-1]["lat"], first[-1]["lon"]), departure
        )
        if scenario == "storm"
        else None
    )
    # One fetch covers the trip and every later departure we compare against.
    series = _weather(
        [(cp["lat"], cp["lon"]) for cp in checkpoints],
        departure - timedelta(hours=1),
        max(etas) + timedelta(hours=DEPARTURE_WINDOW_H + 1),
        storm,
    )
    per_route: list[list[HourlySeries]] = []
    offset = 0
    for route in routes:
        n = len(route["checkpoints"])
        per_route.append(series[offset : offset + n])
        offset += n

    scored = [_score_route(r, s, load_lb, 0) for r, s in zip(routes, per_route, strict=True)]
    rec = recommend([s.score for s in scored])

    options: list[DepartureOption] = []
    for hours in range(0, DEPARTURE_WINDOW_H + 1, DEPARTURE_STEP_H):
        shifted = [
            _score_route(r, s, load_lb, hours * 3600).score
            for r, s in zip(routes, per_route, strict=True)
        ]
        winner = recommend(shifted).route_id
        best_score = next(s for s in shifted if s.route_id == winner)
        complete = all(round(s.unknown_miles, 1) == 0 for s in shifted)
        options.append(DepartureOption(hours, best_score, complete))
    best = best_departure(options)

    return {
        "routes": [
            {
                "id": route["id"],
                "checkpoints": [
                    _checkpoint_payload(cp["index"], w, a)
                    for cp, (w, a) in zip(route["checkpoints"], s.rows, strict=True)
                ],
                "miles": _miles_payload(s.miles),
                "average_risk": round(s.miles.average_risk, 3),
                "max_level": _max_level(s.miles.by_level),
            }
            for route, s in zip(routes, scored, strict=True)
        ],
        "recommendation": {
            "route_id": rec.route_id,
            "ranking": rec.ranking,
            "criterion": rec.criterion,
            "reason": rec.reason,
            "tradeoff": rec.tradeoff,
            "safe": rec.safe,
            "warnings": rec.warnings,
        },
        "departures": {
            "options": [
                {
                    "offset_h": o.offset_h,
                    "departure": iso(departure + timedelta(hours=o.offset_h)),
                    "route_id": o.best.route_id,
                    "complete": o.complete,
                    "miles": {lvl.key: round(mi, 2) for lvl, mi in o.best.miles.items()},
                    "average_risk": round(o.best.average_risk, 3),
                    "max_level": _max_level(o.best.miles),
                    "arrival": iso(
                        departure + timedelta(hours=o.offset_h, seconds=o.best.duration_s)
                    ),
                }
                for o in options
            ],
            "best_offset_h": best.offset_h if best else None,
            "reason": explain_departure(options[0], best) if best else None,
        },
        "scenario": scenario,
    }


def _checkpoint_payload(index: int, w: WeatherAt | None, a: Assessment | None) -> dict[str, Any]:
    if w is None or a is None:
        return {"index": index, "weather": None, "risk": None}
    return {
        "index": index,
        "weather": {
            "wind_mph": round(w.wind_mph, 2),
            "gust_mph": None if w.gust_mph is None else round(w.gust_mph, 1),
            "rain_in_hr": round(w.rain_in_hr, 4),
            "snow_in_hr": round(w.snow_in_hr, 4),
            "weather_code": w.weather_code,
            "valid_from": iso(datetime.fromtimestamp(w.valid_from, UTC)),
            "valid_to": iso(datetime.fromtimestamp(w.valid_to, UTC)),
        },
        "risk": {
            "level": a.level.key,
            "value": int(a.level),
            "wind": a.wind.key,
            "rain": a.rain.key,
            "snow": a.snow.key,
            "load": a.load.key if a.load is not None else None,
            "drivers": list(a.drivers),
            "summary": a.summary,
        },
    }


# --- Heatmap ------------------------------------------------------------------------

NODATA = 255
# Values are packed into one byte per cell per hour; value = byte * scale.
BYTE_SCALES = {"risk": 4 / 250, "wind": 0.5, "rain": 0.01, "snow": 0.02}


def heatmap(
    lines: Sequence[Sequence[Coord]], start: datetime, load_lb: float, scenario: str = "live"
) -> dict[str, Any]:
    grid = build_grid(lines)
    start_hour = openmeteo.hour_floor(start)
    end_hour = start_hour + timedelta(hours=HEATMAP_HOURS)
    storm = _storm_for(lines[0][0], lines[0][-1], start) if scenario == "storm" else None
    series = _weather(grid.centers, start_hour, end_hour, storm)

    hours = HEATMAP_HOURS + 1
    n = len(grid.cells)
    packed = {k: np.full((hours, n), NODATA, dtype=np.uint8) for k in BYTE_SCALES}
    frame_times = [int((start_hour + timedelta(hours=h)).timestamp()) for h in range(hours)]
    for cell, s in enumerate(series):
        index = {t: i for i, t in enumerate(s.times)}
        for h, t in enumerate(frame_times):
            i = index.get(t)
            if i is None:
                continue
            wind, rain, showers, snow = s.wind_kmh[i], s.rain_mm[i], s.showers_mm[i], s.snow_cm[i]
            if wind is None or rain is None or snow is None:
                continue
            # On the hour, weather_at() reduces to the values at that timestamp.
            values = {
                "wind": kmh_to_mph(wind),
                "rain": mm_to_in(rain + (showers or 0.0)),
                "snow": cm_to_in(snow),
            }
            values["risk"] = risk_index(values["wind"], values["rain"], values["snow"], load_lb)
            for key, value in values.items():
                packed[key][h, cell] = min(round(value / BYTE_SCALES[key]), NODATA - 1)

    return {
        "start": iso(start_hour),
        "hours": hours,
        "grid": {
            "west": grid.west,
            "south": grid.south,
            "east": grid.east,
            "north": grid.north,
            "cols": grid.cols,
            "rows": grid.rows,
            "cells": grid.cells,
            "edge": [round(min(d / grid.buffer_m, 1.0), 3) for d in grid.distance_m],
        },
        "scales": BYTE_SCALES,
        "nodata": NODATA,
        "frames": {k: base64.b64encode(v.tobytes()).decode("ascii") for k, v in packed.items()},
        "scenario": scenario,
    }


# --- Geocoding ----------------------------------------------------------------------


def geocode(query: str) -> list[dict[str, Any]]:
    try:
        places = routing.search_places(query)
    except UpstreamError as exc:
        raise upstream_error(exc) from exc
    return [p.__dict__ for p in places]
