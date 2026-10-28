"""How many miles of a route fall into each risk level.

Each checkpoint stands for the road halfway back to the previous checkpoint and halfway
on to the next one. The first and last checkpoints extend to the route's ends.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .risk import RiskLevel
from .units import meters_to_miles


@dataclass(frozen=True)
class MileBreakdown:
    by_level: dict[RiskLevel, float]
    unknown: float  # miles whose weather is outside the forecast
    average_risk: float  # distance-weighted mean level (0 = Low ... 4 = No Travel)

    @property
    def total(self) -> float:
        return sum(self.by_level.values()) + self.unknown


def attribute_miles(
    distances_m: Sequence[float], levels: Sequence[RiskLevel | None], total_m: float
) -> MileBreakdown:
    if len(distances_m) != len(levels) or not distances_m:
        raise ValueError("Need one level per checkpoint")
    n = len(distances_m)
    bounds = [0.0]
    bounds += [(distances_m[i - 1] + distances_m[i]) / 2 for i in range(1, n)]
    bounds.append(total_m)

    by_level = dict.fromkeys(RiskLevel, 0.0)
    unknown = 0.0
    for i, level in enumerate(levels):
        miles = meters_to_miles(max(bounds[i + 1] - bounds[i], 0.0))
        if level is None:
            unknown += miles
        else:
            by_level[level] += miles

    known = sum(by_level.values())
    average = sum(lvl * mi for lvl, mi in by_level.items()) / known if known > 0 else 0.0
    return MileBreakdown(by_level=by_level, unknown=unknown, average_risk=average)
