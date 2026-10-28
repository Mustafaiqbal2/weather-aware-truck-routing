"""Travel time from the start to any distance along a route."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from .geo import FloatArray


def travel_times_at(
    cum_m: FloatArray,
    progress: Sequence[tuple[int, float]],
    targets_m: Sequence[float],
    total_s: float,
) -> FloatArray:
    """Seconds after departure at which the truck reaches each target distance.

    ``progress`` holds (point_index, seconds_from_start) pairs reported by the routing
    provider. Between those points, time is interpolated by distance, which assumes
    constant speed only within each short provider segment, so traffic and speed limits
    still shape the ETAs. Without progress data, the route is assumed to be driven at
    its average speed.
    """
    targets = np.asarray(targets_m, dtype=np.float64)
    total_m = float(cum_m[-1])
    if len(progress) >= 2:
        idx = np.array([p[0] for p in progress], dtype=np.int64)
        secs = np.array([p[1] for p in progress], dtype=np.float64)
        order = np.argsort(idx)
        x = cum_m[idx[order]]
        y = np.maximum.accumulate(secs[order])  # never let time run backwards
        result: FloatArray = np.interp(targets, x, y)
        return result
    if total_m <= 0:
        return np.zeros_like(targets)
    uniform: FloatArray = targets / total_m * total_s
    return uniform
