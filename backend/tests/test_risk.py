"""Risk classification rules from the assignment brief.

Bands are half-open [lower, upper): each band includes its lower edge and excludes its
upper edge. The table writes No Travel for rain and snow as strictly greater than
(>1.00, >3.00), so exactly 1.00 in/hr rain and 3.00 in/hr snow are still Severe.
"""

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from core.risk import (
    RiskLevel,
    assess_conditions,
    classify_rain,
    classify_snow,
    classify_wind,
    load_adjusted_level,
    risk_index,
)

L, M, H, S, N = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)


@pytest.mark.parametrize(
    ("mph", "expected"),
    [
        (0, L),
        (24.99, L),
        (25, M),
        (34.99, M),
        (35, H),
        (44.99, H),
        (45, S),
        (54.99, S),
        (55, N),
        (80, N),
    ],
)
def test_wind_bands(mph: float, expected: RiskLevel) -> None:
    assert classify_wind(mph) is expected


@pytest.mark.parametrize(
    ("in_hr", "expected"),
    [
        (0, L),
        (0.0999, L),
        (0.10, M),
        (0.2499, M),
        (0.25, H),
        (0.4999, H),
        (0.50, S),
        (1.00, S),
        (1.0001, N),
        (3.0, N),
    ],
)
def test_rain_bands(in_hr: float, expected: RiskLevel) -> None:
    assert classify_rain(in_hr) is expected


@pytest.mark.parametrize(
    ("in_hr", "expected"),
    [
        (0, L),
        (0.499, L),
        (0.5, M),
        (0.999, M),
        (1.0, H),
        (1.999, H),
        (2.0, S),
        (3.0, S),
        (3.01, N),
        (6.0, N),
    ],
)
def test_snow_bands(in_hr: float, expected: RiskLevel) -> None:
    assert classify_snow(in_hr) is expected


@pytest.mark.parametrize(
    ("mph", "load_lb", "expected"),
    [
        # >=55 mph is No Travel for any load
        (55, 0, N),
        (70, 1_000, N),
        # 45-54 mph and > 30,000 lb is No Travel
        (45, 30_001, N),
        (54.99, 45_000, N),
        (45, 30_000, None),  # exactly 30,000 is not "> 30,000"
        # 35-44 mph and > 40,000 lb is Severe
        (35, 40_001, S),
        (44.99, 60_000, S),
        (35, 40_000, None),  # exactly 40,000 is not "> 40,000"
        (34.99, 80_000, None),  # below 35 mph, load rules don't apply
        (20, 80_000, None),
    ],
)
def test_load_rules(mph: float, load_lb: float, expected: RiskLevel | None) -> None:
    assert load_adjusted_level(mph, load_lb) is expected


def test_assessment_takes_worst_factor() -> None:
    a = assess_conditions(wind_mph=10, rain_in_hr=0.3, snow_in_hr=0.6, load_lb=10_000)
    assert a.level is H
    assert a.drivers == ("rain",)


def test_assessment_load_rule_escalates_wind() -> None:
    a = assess_conditions(wind_mph=38, rain_in_hr=0, snow_in_hr=0, load_lb=42_000)
    assert a.wind is H
    assert a.load is S
    assert a.level is S
    assert a.drivers == ("load",)
    assert "42,000 lb" in a.summary
    assert "Severe" in a.summary


def test_assessment_heavy_load_in_severe_wind_is_no_travel() -> None:
    a = assess_conditions(wind_mph=47, rain_in_hr=0, snow_in_hr=0, load_lb=35_000)
    assert a.level is N


def test_assessment_light_load_in_severe_wind_stays_severe() -> None:
    a = assess_conditions(wind_mph=47, rain_in_hr=0, snow_in_hr=0, load_lb=30_000)
    assert a.level is S
    assert a.load is None


def test_assessment_ties_list_every_driver() -> None:
    a = assess_conditions(wind_mph=36, rain_in_hr=0.3, snow_in_hr=0, load_lb=0)
    assert a.level is H
    assert a.drivers == ("wind", "rain")


def test_calm_conditions_summary() -> None:
    a = assess_conditions(wind_mph=5, rain_in_hr=0, snow_in_hr=0, load_lb=20_000)
    assert a.level is L
    assert a.drivers == ()
    assert a.summary


@pytest.mark.parametrize("bad", [-1, math.nan, math.inf])
def test_rejects_invalid_measurements(bad: float) -> None:
    with pytest.raises(ValueError):
        classify_wind(bad)


# --- Properties -----------------------------------------------------------------

speeds = st.floats(min_value=0, max_value=120, allow_nan=False)
rates = st.floats(min_value=0, max_value=8, allow_nan=False)
loads = st.floats(min_value=0, max_value=100_000, allow_nan=False)


@given(speeds, speeds, rates, rates, loads)
def test_more_wind_never_lowers_risk(
    a: float, b: float, rain: float, snow: float, load: float
) -> None:
    lo, hi = sorted((a, b))
    assert (
        assess_conditions(lo, rain, snow, load).level
        <= assess_conditions(hi, rain, snow, load).level
    )


@given(speeds, rates, rates, loads, loads)
def test_more_load_never_lowers_risk(
    wind: float, rain: float, snow: float, a: float, b: float
) -> None:
    lo, hi = sorted((a, b))
    assert (
        assess_conditions(wind, rain, snow, lo).level
        <= assess_conditions(wind, rain, snow, hi).level
    )


@given(speeds, rates, rates, rates, loads)
def test_more_precip_never_lowers_risk(
    wind: float, a: float, b: float, snow: float, load: float
) -> None:
    lo, hi = sorted((a, b))
    assert (
        assess_conditions(wind, lo, snow, load).level
        <= assess_conditions(wind, hi, snow, load).level
    )
    assert (
        assess_conditions(wind, snow, lo, load).level
        <= assess_conditions(wind, snow, hi, load).level
    )


@given(speeds, rates, rates, loads)
def test_continuous_index_agrees_with_discrete_level(
    wind: float, rain: float, snow: float, load: float
) -> None:
    """The heatmap's smooth index must never disagree with the checkpoint level."""
    level = assess_conditions(wind, rain, snow, load).level
    idx = risk_index(wind, rain, snow, load)
    assert 0 <= idx <= 4
    assert min(math.floor(idx), 4) == level
