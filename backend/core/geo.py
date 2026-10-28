"""Distances along a route and checkpoint sampling."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from .units import miles_to_meters

EARTH_RADIUS_M = 6_371_008.8  # IUGG mean radius

Coord = tuple[float, float]  # (lat, lon) in degrees
FloatArray = npt.NDArray[np.float64]


def cumulative_distances_m(coords: Sequence[Coord]) -> FloatArray:
    """Great-circle (haversine) distance from the first point to every point."""
    pts = np.radians(np.asarray(coords, dtype=np.float64))
    lat, lon = pts[:, 0], pts[:, 1]
    dlat = np.diff(lat)
    dlon = np.diff(lon)
    a = np.sin(dlat / 2) ** 2 + np.cos(lat[:-1]) * np.cos(lat[1:]) * np.sin(dlon / 2) ** 2
    seg = 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))
    return np.concatenate(([0.0], np.cumsum(seg)))


@dataclass(frozen=True)
class Checkpoint:
    index: int
    distance_m: float
    lat: float
    lon: float


def points_at(coords: Sequence[Coord], cum: FloatArray, targets_m: FloatArray) -> FloatArray:
    """Positions (lat, lon) at the given distances along the line, linearly interpolated."""
    pts = np.asarray(coords, dtype=np.float64)
    targets = np.clip(targets_m, 0.0, cum[-1])
    seg = np.clip(np.searchsorted(cum, targets, side="right") - 1, 0, len(cum) - 2)
    seg_len = cum[seg + 1] - cum[seg]
    with np.errstate(invalid="ignore", divide="ignore"):
        frac = np.where(seg_len > 0, (targets - cum[seg]) / seg_len, 0.0)
    out: FloatArray = pts[seg] + (pts[seg + 1] - pts[seg]) * frac[:, None]
    return out


def sample_checkpoints(coords: Sequence[Coord], interval_mi: float) -> list[Checkpoint]:
    """A checkpoint at the start, every ``interval_mi`` miles, and at the end."""
    if len(coords) < 2:
        raise ValueError("A route needs at least two points")
    if interval_mi <= 0:
        raise ValueError("interval_mi must be positive")
    cum = cumulative_distances_m(coords)
    total = float(cum[-1])
    step = miles_to_meters(interval_mi)
    targets = np.arange(0.0, total, step)
    # Always finish exactly at the destination; skip a near-duplicate of the last sample.
    if total - targets[-1] > 1.0:
        targets = np.append(targets, total)
    else:
        targets[-1] = total
    positions = points_at(coords, cum, targets)
    return [
        Checkpoint(index=i, distance_m=float(d), lat=float(p[0]), lon=float(p[1]))
        for i, (d, p) in enumerate(zip(targets, positions, strict=True))
    ]
