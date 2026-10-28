"""Route recommendation.

The brief's preference order, with one addition: No Travel miles are compared first,
because a route that crosses No Travel conditions can't be safer than one that only
crosses Severe conditions.

    1. Fewest No Travel miles   (added)
    2. Fewest Severe miles
    3. Fewest High miles
    4. Lowest average risk      (distance-weighted, Low = 0 ... No Travel = 4)
    5. Shortest travel time

Miles are compared at 0.1 mile precision and average risk at 0.001, so measurement
noise can't decide the outcome on its own.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from .risk import RiskLevel

MILE_PRECISION = 1
AVERAGE_PRECISION = 3


@dataclass(frozen=True)
class RouteScore:
    route_id: str
    label: str
    miles: dict[RiskLevel, float]
    unknown_miles: float
    average_risk: float
    duration_s: float

    def key(self) -> tuple[float, float, float, float, float]:
        return (
            round(self.miles[RiskLevel.NO_TRAVEL], MILE_PRECISION),
            round(self.miles[RiskLevel.SEVERE], MILE_PRECISION),
            round(self.miles[RiskLevel.HIGH], MILE_PRECISION),
            round(self.average_risk, AVERAGE_PRECISION),
            self.duration_s,
        )


CRITERIA = ("no_travel", "severe", "high", "average", "duration")


@dataclass(frozen=True)
class Recommendation:
    route_id: str
    ranking: list[str]
    criterion: str  # which rule separated the winner from the runner-up ("tie" if none)
    reason: str
    # What choosing this route buys compared with the fastest one (None if it is fastest).
    tradeoff: str | None
    safe: bool  # False when even the best route crosses No Travel conditions
    warnings: list[str] = field(default_factory=list)


def recommend(scores: Sequence[RouteScore]) -> Recommendation:
    if not scores:
        raise ValueError("No routes to rank")
    ranked = sorted(scores, key=lambda s: s.key())
    best = ranked[0]
    ranking = [s.route_id for s in ranked]

    if len(ranked) == 1:
        criterion, reason = "only", "It is the only route available."
    else:
        criterion, reason = _explain(best, ranked[1])
    fastest = min(scores, key=lambda s: s.duration_s)
    tradeoff = _tradeoff(best, fastest) if fastest.route_id != best.route_id else None

    warnings: list[str] = []
    nt = best.miles[RiskLevel.NO_TRAVEL]
    safe = round(nt, MILE_PRECISION) == 0
    if not safe:
        warnings.append(
            "Every route crosses No Travel conditions at this departure time. "
            f"The best option still has {_mi(nt)} of them. Consider delaying departure."
        )
    severe = best.miles[RiskLevel.SEVERE]
    if round(severe, MILE_PRECISION) > 0:
        warnings.append(f"The recommended route includes {_mi(severe)} of Severe conditions.")
    if round(best.unknown_miles, MILE_PRECISION) > 0:
        warnings.append(
            f"{_mi(best.unknown_miles)} of this route fall beyond the weather forecast, "
            "so they could not be scored."
        )
    return Recommendation(
        route_id=best.route_id,
        ranking=ranking,
        criterion=criterion,
        reason=reason,
        tradeoff=tradeoff,
        safe=safe,
        warnings=warnings,
    )


def _explain(best: RouteScore, runner_up: RouteScore) -> tuple[str, str]:
    a, b = best.key(), runner_up.key()
    other = runner_up.label
    for criterion, va, vb in zip(CRITERIA, a, b, strict=True):
        if va == vb:
            continue
        if criterion == "no_travel":
            return criterion, (f"Fewest No Travel miles: {_mi(va)}, against {_mi(vb)} on {other}.")
        if criterion == "severe":
            return criterion, f"Fewest Severe miles: {_mi(va)}, against {_mi(vb)} on {other}."
        if criterion == "high":
            return criterion, f"Fewest High miles: {_mi(va)}, against {_mi(vb)} on {other}."
        if criterion == "average":
            return criterion, (
                f"Same Severe and High mileage as {other}, with lower average risk: "
                f"{va:.2f}, against {vb:.2f}."
            )
        return criterion, (
            f"Risk is level with {other}, and this route is {_duration(vb - va)} faster."
        )
    return "tie", f"It ties with {other} on every measure, including drive time."


_LEVEL_NAMES = {"no_travel": "No Travel", "severe": "Severe", "high": "High"}


def _tradeoff(best: RouteScore, fastest: RouteScore) -> str | None:
    extra = _duration(best.duration_s - fastest.duration_s)
    for criterion, va, vb in zip(CRITERIA[:4], best.key(), fastest.key(), strict=False):
        if va == vb:
            continue
        if criterion in _LEVEL_NAMES:
            return (
                f"It avoids {_mi(vb - va)} of {_LEVEL_NAMES[criterion]} conditions on the "
                f"fastest route, {fastest.label}, for {extra} more driving."
            )
        return (
            f"It carries less average risk than the fastest route, {fastest.label} "
            f"({va:.2f} against {vb:.2f}), for {extra} more driving."
        )
    return None


def _mi(miles: float) -> str:
    return f"{miles:,.0f} mi" if miles >= 10 else f"{miles:,.1f} mi"


def _duration(seconds: float) -> str:
    minutes = round(seconds / 60)
    if minutes < 60:
        return f"{minutes} min"
    hours, rem = divmod(minutes, 60)
    return f"{hours} h {rem} min" if rem else f"{hours} h"
