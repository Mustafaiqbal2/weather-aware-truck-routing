"""Weather risk classification, exactly as specified in the assignment brief.

    Condition   Low        Moderate     High         Severe       No Travel
    Wind        <25 mph    25-34        35-44        45-54        >=55 mph
    Rain        <0.10 in/h 0.10-0.25    0.25-0.50    0.50-1.00    >1.00
    Snow        <0.5 in/h  0.5-1.0      1.0-2.0      2.0-3.0      >3.0

    Load rules: >=55 mph is No Travel for any load; 45-54 mph with >30,000 lb is
    No Travel; 35-44 mph with >40,000 lb is Severe.

Interpretation of the table's shared edges (documented in the README):
* Every band includes its lower edge and excludes its upper edge, so 0.25 in/hr of
  rain is High, not Moderate, and 35 mph is High.
* No Travel for rain and snow is written as strictly greater than (">1.00", ">3.0"),
  so exactly 1.00 in/hr of rain and exactly 3.0 in/hr of snow remain Severe.
* Load thresholds are strict ("> 30,000 lb"), so exactly 30,000 lb does not trigger.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import IntEnum


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return _LABELS[self]

    @property
    def key(self) -> str:
        return self.name.lower()


_LABELS = {
    RiskLevel.LOW: "Low",
    RiskLevel.MODERATE: "Moderate",
    RiskLevel.HIGH: "High",
    RiskLevel.SEVERE: "Severe",
    RiskLevel.NO_TRAVEL: "No Travel",
}

# Keeps floor(index) inside the band for values just under an upper edge.
_MAX_FRACTION = 0.999


@dataclass(frozen=True)
class Scale:
    """One row of the risk table.

    ``edges`` are the lower edges of Moderate, High, Severe and No Travel.
    """

    name: str
    unit: str
    edges: tuple[float, float, float, float]
    no_travel_exclusive: bool

    def classify(self, value: float) -> RiskLevel:
        _validate(self.name, value)
        moderate, high, severe, no_travel = self.edges
        if value > no_travel or (value == no_travel and not self.no_travel_exclusive):
            return RiskLevel.NO_TRAVEL
        if value >= severe:
            return RiskLevel.SEVERE
        if value >= high:
            return RiskLevel.HIGH
        if value >= moderate:
            return RiskLevel.MODERATE
        return RiskLevel.LOW

    def index(self, value: float) -> float:
        """Continuous risk in [0, 4]: band number plus position inside the band.

        Used only to draw smooth heatmap gradients. ``floor(index) == classify()`` always
        holds, so the heatmap can never contradict a checkpoint's level.
        """
        level = self.classify(value)
        if level is RiskLevel.NO_TRAVEL:
            return 4.0
        lower = 0.0 if level is RiskLevel.LOW else self.edges[level - 1]
        upper = self.edges[level]
        fraction = (value - lower) / (upper - lower)
        return level + min(max(fraction, 0.0), _MAX_FRACTION)


WIND = Scale("wind", "mph", (25, 35, 45, 55), no_travel_exclusive=False)
RAIN = Scale("rain", "in/hr", (0.10, 0.25, 0.50, 1.00), no_travel_exclusive=True)
SNOW = Scale("snow", "in/hr", (0.5, 1.0, 2.0, 3.0), no_travel_exclusive=True)


@dataclass(frozen=True)
class LoadRule:
    """Wind in [min_mph, max_mph) with a load strictly above ``over_lb`` becomes ``level``."""

    min_mph: float
    max_mph: float
    over_lb: float
    level: RiskLevel


LOAD_RULES = (
    LoadRule(min_mph=45, max_mph=55, over_lb=30_000, level=RiskLevel.NO_TRAVEL),
    LoadRule(min_mph=35, max_mph=45, over_lb=40_000, level=RiskLevel.SEVERE),
)
NO_TRAVEL_WIND_MPH = 55.0


def classify_wind(mph: float) -> RiskLevel:
    return WIND.classify(mph)


def classify_rain(in_per_hr: float) -> RiskLevel:
    return RAIN.classify(in_per_hr)


def classify_snow(in_per_hr: float) -> RiskLevel:
    return SNOW.classify(in_per_hr)


def matching_load_rule(wind_mph: float, load_lb: float) -> LoadRule | None:
    _validate("wind", wind_mph)
    _validate("load", load_lb)
    for rule in LOAD_RULES:
        if rule.min_mph <= wind_mph < rule.max_mph and load_lb > rule.over_lb:
            return rule
    return None


def load_adjusted_level(wind_mph: float, load_lb: float) -> RiskLevel | None:
    """The level the load rules impose, or None when no load rule applies."""
    _validate("wind", wind_mph)
    if wind_mph >= NO_TRAVEL_WIND_MPH:
        return RiskLevel.NO_TRAVEL
    rule = matching_load_rule(wind_mph, load_lb)
    return rule.level if rule else None


@dataclass(frozen=True)
class Assessment:
    wind: RiskLevel
    rain: RiskLevel
    snow: RiskLevel
    # Set only when a load rule makes the result stricter than the plain wind band.
    load: RiskLevel | None
    level: RiskLevel
    # Factors responsible for the final level, in table order: wind, rain, snow, load.
    drivers: tuple[str, ...]
    summary: str


def assess_conditions(
    wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float
) -> Assessment:
    wind = classify_wind(wind_mph)
    rain = classify_rain(rain_in_hr)
    snow = classify_snow(snow_in_hr)
    load_level = load_adjusted_level(wind_mph, load_lb)
    load = load_level if load_level is not None and load_level > wind else None

    factors = {"wind": wind, "rain": rain, "snow": snow}
    if load is not None:
        factors["load"] = load
    level = max(factors.values())
    drivers = (
        tuple(name for name, lvl in factors.items() if lvl == level)
        if level > RiskLevel.LOW
        else ()
    )
    return Assessment(
        wind=wind,
        rain=rain,
        snow=snow,
        load=load,
        level=level,
        drivers=drivers,
        summary=_summarise(drivers, level, wind_mph, rain_in_hr, snow_in_hr, load_lb),
    )


def risk_index(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> float:
    """Continuous counterpart of ``assess_conditions(...).level`` for heatmaps."""
    wind_idx = WIND.index(wind_mph)
    load_level = load_adjusted_level(wind_mph, load_lb)
    if load_level is not None and load_level > int(wind_idx):
        # Promote into the stricter band, keeping the position inside the wind band so
        # the gradient stays smooth.
        wind_idx = 4.0 if load_level is RiskLevel.NO_TRAVEL else load_level + (wind_idx % 1)
    return max(wind_idx, RAIN.index(rain_in_hr), SNOW.index(snow_in_hr))


def rules_table() -> dict[str, object]:
    """Machine-readable copy of the rules, served to the frontend for its legend."""
    return {
        "levels": [{"value": lvl.value, "key": lvl.key, "label": lvl.label} for lvl in RiskLevel],
        "scales": [
            {
                "name": s.name,
                "unit": s.unit,
                "edges": list(s.edges),
                "no_travel_exclusive": s.no_travel_exclusive,
            }
            for s in (WIND, RAIN, SNOW)
        ],
        "load_rules": [
            {
                "min_mph": r.min_mph,
                "max_mph": r.max_mph,
                "over_lb": r.over_lb,
                "level": r.level.key,
            }
            for r in LOAD_RULES
        ],
        "no_travel_wind_mph": NO_TRAVEL_WIND_MPH,
    }


def _validate(name: str, value: float) -> None:
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"{name} must be a finite, non-negative number, got {value!r}")


def _floor(value: float, decimals: int) -> str:
    """Format without rounding up across a band edge (34.99 mph shows as 34.9, not 35)."""
    factor = 10**decimals
    return f"{math.floor(value * factor + 1e-9) / factor:.{decimals}f}"


def _summarise(
    drivers: tuple[str, ...],
    level: RiskLevel,
    wind_mph: float,
    rain_in_hr: float,
    snow_in_hr: float,
    load_lb: float,
) -> str:
    if level is RiskLevel.LOW:
        return "All conditions are below the risk thresholds."
    parts: list[str] = []
    for driver in drivers:
        if driver == "wind":
            parts.append(f"Wind {_floor(wind_mph, 1)} mph is {level.label}.")
        elif driver == "rain":
            parts.append(f"Rain {_floor(rain_in_hr, 2)} in/hr is {level.label}.")
        elif driver == "snow":
            parts.append(f"Snow {_floor(snow_in_hr, 2)} in/hr is {level.label}.")
        elif driver == "load":
            rule = matching_load_rule(wind_mph, load_lb)
            over = f" (over {rule.over_lb:,.0f} lb)" if rule else ""
            parts.append(
                f"Wind {_floor(wind_mph, 1)} mph with a {load_lb:,.0f} lb load{over} "
                f"is {level.label}."
            )
    return " ".join(parts)
