"""Choosing three genuinely different routes.

Routing providers sometimes return alternatives that share almost all of their road
with the main route, or fewer alternatives than requested. Here we measure how much
two routes overlap, pick a distinct set, and propose detour via-points to fill gaps.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from functools import lru_cache

from pyproj import Transformer
from shapely import LineString, Point

Coord = tuple[float, float]  # (lat, lon)

OVERLAP_BUFFER_M = 1_000
DISTINCT_MAX_OVERLAP = 0.85  # routes sharing more than this are "the same route"
RELAXED_MAX_OVERLAP = 0.97
MAX_TIME_RATIO = 1.6  # ignore candidates much slower than the fastest route


@dataclass(frozen=True)
class Candidate:
    key: str
    points: Sequence[Coord]
    duration_s: float


@lru_cache(maxsize=64)
def _projector(lat0: float, lon0: float) -> Transformer:
    return Transformer.from_crs(
        "EPSG:4326", f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +units=m", always_xy=True
    )


def local_projection(points: Sequence[Coord]) -> Transformer:
    """Azimuthal equidistant projection centred on the points: metres, little distortion."""
    lats = [p[0] for p in points]
    lons = [p[1] for p in points]
    return _projector(round((min(lats) + max(lats)) / 2, 2), round((min(lons) + max(lons)) / 2, 2))


def to_line(points: Sequence[Coord], proj: Transformer) -> LineString:
    xs, ys = proj.transform([p[1] for p in points], [p[0] for p in points])
    return LineString(list(zip(xs, ys, strict=True)))


def overlap_ratio(a: LineString, b: LineString, buffer_m: float = OVERLAP_BUFFER_M) -> float:
    """Share of b's length that runs within ``buffer_m`` of a."""
    if b.length == 0:
        return 1.0
    return float(b.intersection(a.buffer(buffer_m)).length / b.length)


def pick_distinct(candidates: Sequence[Candidate], count: int = 3) -> list[Candidate]:
    """Greedy pick in preference order, rejecting near-duplicates and slow detours."""
    if not candidates:
        return []
    fastest = min(c.duration_s for c in candidates)
    usable = [c for c in candidates if c.duration_s <= fastest * MAX_TIME_RATIO]
    proj = local_projection([p for c in usable for p in (c.points[0], c.points[-1])])
    lines = {c.key: to_line(c.points, proj) for c in usable}

    chosen: list[Candidate] = []
    for threshold in (DISTINCT_MAX_OVERLAP, RELAXED_MAX_OVERLAP):
        for cand in usable:
            if len(chosen) == count:
                return chosen
            if cand in chosen:
                continue
            line = lines[cand.key]
            if all(
                max(overlap_ratio(lines[c.key], line), overlap_ratio(line, lines[c.key]))
                <= threshold
                for c in chosen
            ):
                chosen.append(cand)
    return chosen


def detour_via_points(origin: Coord, destination: Coord) -> list[Coord]:
    """Two via-points, one each side of the straight line, to force different corridors.

    The offset is 15% of the trip's straight-line length, kept between 30 and 150 km.
    """
    proj = local_projection([origin, destination])
    (ox, dx), (oy, dy) = proj.transform([origin[1], destination[1]], [origin[0], destination[0]])
    length = math.hypot(dx - ox, dy - oy)
    if length < 1_000:
        return []
    offset = min(max(0.15 * length, 30_000), 150_000)
    mx, my = (ox + dx) / 2, (oy + dy) / 2
    nx, ny = -(dy - oy) / length, (dx - ox) / length  # unit normal
    inverse = Transformer.from_crs(proj.target_crs, "EPSG:4326", always_xy=True)
    vias: list[Coord] = []
    for side in (1, -1):
        lon, lat = inverse.transform(mx + side * nx * offset, my + side * ny * offset)
        vias.append((float(lat), float(lon)))
    return vias


def simplify(points: Sequence[Coord], tolerance_m: float = 15.0) -> list[Coord]:
    """Douglas-Peucker in metres, for sending route lines to the browser."""
    if len(points) < 3:
        return list(points)
    proj = local_projection(points)
    inverse = Transformer.from_crs(proj.target_crs, "EPSG:4326", always_xy=True)
    simple = to_line(points, proj).simplify(tolerance_m, preserve_topology=False)
    xs, ys = zip(*simple.coords, strict=True)
    lons, lats = inverse.transform(xs, ys)
    return [(float(lat), float(lon)) for lat, lon in zip(lats, lons, strict=True)]


def distance_to_line_m(point: Coord, line_points: Sequence[Coord]) -> float:
    proj = local_projection(line_points)
    x, y = proj.transform(point[1], point[0])
    return float(to_line(line_points, proj).distance(Point(x, y)))
