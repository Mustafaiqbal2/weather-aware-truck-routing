"""Synthetic routes and places for local development and end-to-end tests only.

Routes are smooth curves between the real end points, driven at a steady 55 mph. They
are never used in production (see ``providers.routing``).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import datetime

import numpy as np

from core.geo import cumulative_distances_m
from core.units import miles_to_meters

from .tomtom import Place, RawRoute

Coord = tuple[float, float]
SPEED_MPH = 55.0

CITIES = [
    ("Denver, CO", 39.7392, -104.9903),
    ("Chicago, IL", 41.8781, -87.6298),
    ("Seattle, WA", 47.6062, -122.3321),
    ("Spokane, WA", 47.6588, -117.4260),
    ("Dallas, TX", 32.7767, -96.7970),
    ("Atlanta, GA", 33.7490, -84.3880),
    ("Kansas City, MO", 39.0997, -94.5786),
    ("Salt Lake City, UT", 40.7608, -111.8910),
    ("Minneapolis, MN", 44.9778, -93.2650),
    ("Omaha, NE", 41.2565, -95.9345),
]


def _curve(points: Sequence[Coord], bend: float, n: int = 600) -> list[Coord]:
    """A smooth line through the given points, bowed sideways by ``bend`` degrees."""
    pts = np.asarray(points, dtype=float)
    seg = np.linspace(0, len(pts) - 1, n)
    lat = np.interp(seg, np.arange(len(pts)), pts[:, 0])
    lon = np.interp(seg, np.arange(len(pts)), pts[:, 1])
    dlat, dlon = pts[-1] - pts[0]
    norm = math.hypot(dlat, dlon) or 1.0
    shape = np.sin(np.linspace(0, math.pi, n))
    wobble = 0.08 * np.sin(np.linspace(0, 7 * math.pi, n))
    lat = lat + (bend + wobble) * shape * (dlon / norm)
    lon = lon - (bend + wobble) * shape * (dlat / norm)
    return [(float(a), float(b)) for a, b in zip(lat, lon, strict=True)]


def _route(points: list[Coord], roads: list[str]) -> RawRoute:
    cum = cumulative_distances_m(points)
    seconds = cum / miles_to_meters(SPEED_MPH) * 3600
    step = max(len(points) // 40, 1)
    progress = [(i, float(seconds[i])) for i in range(0, len(points), step)]
    progress.append((len(points) - 1, float(seconds[-1])))
    return RawRoute(
        points=points,
        length_m=float(cum[-1]),
        travel_time_s=float(seconds[-1]),
        traffic_delay_s=0.0,
        progress=progress,
        roads=roads,
    )


def calculate_routes(
    locations: Sequence[Coord],
    *,
    depart_at: datetime | None,
    gross_weight_kg: int,
    max_alternatives: int = 0,
) -> list[RawRoute]:
    if len(locations) > 2:
        return [_route(_curve(locations, 0.0), ["Synthetic detour", "Demo Rd"])]
    routes = [_route(_curve(locations, 0.0), ["Synthetic I-1", "Demo Hwy"])]
    for i, bend in enumerate((0.6, -0.7)[:max_alternatives]):
        routes.append(_route(_curve(locations, bend), [f"Synthetic US-{i + 2}", "Demo Rd"]))
    return routes


def search_places(query: str, *, limit: int = 6) -> list[Place]:
    q = query.lower()
    return [
        Place(id=name, label=name, detail="Demo place", lat=lat, lon=lon, kind="Geography")
        for name, lat, lon in CITIES
        if q in name.lower()
    ][:limit]
