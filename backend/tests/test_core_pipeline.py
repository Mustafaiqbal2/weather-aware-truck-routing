"""Units, checkpoint sampling, ETA interpolation, weather alignment, miles and ranking."""

from datetime import UTC, datetime

import numpy as np
import pytest

from core.eta import travel_times_at
from core.geo import cumulative_distances_m, sample_checkpoints
from core.mileage import attribute_miles
from core.ranking import RouteScore, recommend
from core.risk import RiskLevel
from core.units import (
    cm_to_in,
    gross_weight_lb,
    kmh_to_mph,
    lb_to_kg,
    meters_to_miles,
    miles_to_meters,
    mm_to_in,
)
from core.weather_align import HourlySeries, weather_at

L, M, H, S, N = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)

# --- units ------------------------------------------------------------------------


def test_unit_conversions() -> None:
    assert meters_to_miles(1609.344) == pytest.approx(1.0)
    assert miles_to_meters(10) == pytest.approx(16_093.44)
    assert lb_to_kg(1) == pytest.approx(0.45359237)
    assert mm_to_in(25.4) == pytest.approx(1.0)
    assert cm_to_in(2.54) == pytest.approx(1.0)
    assert kmh_to_mph(1.609344) == pytest.approx(1.0)


def test_gross_weight_adds_typical_tare() -> None:
    assert gross_weight_lb(40_000) == 75_000


# --- geometry & sampling -----------------------------------------------------------

EQUATOR_DEGREE_M = 111_195.08  # one degree of longitude on the equator, mean earth radius


def test_cumulative_distance_on_equator() -> None:
    coords = [(0.0, 0.0), (0.0, 0.5), (0.0, 1.0)]
    cum = cumulative_distances_m(coords)
    assert cum[0] == 0
    assert cum[-1] == pytest.approx(EQUATOR_DEGREE_M, rel=1e-6)


def test_checkpoints_every_interval_plus_start_and_end() -> None:
    coords = [(0.0, 0.0), (0.0, 1.0)]  # about 69.09 miles
    cps = sample_checkpoints(coords, interval_mi=10)
    miles = [round(meters_to_miles(c.distance_m), 2) for c in cps]
    assert miles == [0, 10, 20, 30, 40, 50, 60, 69.09]
    assert cps[0].lat == 0 and cps[0].lon == 0
    assert cps[-1].lon == pytest.approx(1.0)
    # 10 miles along a 69.09 mile line is 0.1447 of the way
    assert cps[1].lon == pytest.approx(miles_to_meters(10) / EQUATOR_DEGREE_M, rel=1e-6)


def test_end_is_not_duplicated_when_route_length_is_a_multiple() -> None:
    length_deg = miles_to_meters(50) / EQUATOR_DEGREE_M
    cps = sample_checkpoints([(0.0, 0.0), (0.0, length_deg)], interval_mi=25)
    assert [round(meters_to_miles(c.distance_m)) for c in cps] == [0, 25, 50]


def test_sampling_handles_repeated_points() -> None:
    coords = [(0.0, 0.0), (0.0, 0.0), (0.0, 1.0), (0.0, 1.0)]
    cps = sample_checkpoints(coords, interval_mi=25)
    assert [round(meters_to_miles(c.distance_m)) for c in cps] == [0, 25, 50, 69]


def test_sampling_rejects_bad_input() -> None:
    with pytest.raises(ValueError):
        sample_checkpoints([(0.0, 0.0)], interval_mi=10)
    with pytest.raises(ValueError):
        sample_checkpoints([(0.0, 0.0), (0.0, 1.0)], interval_mi=0)


# --- ETA -------------------------------------------------------------------------


def test_travel_time_interpolates_between_progress_points() -> None:
    cum = np.array([0.0, 10, 20, 30, 40])
    progress = [(0, 0.0), (2, 100.0), (4, 300.0)]
    times = travel_times_at(cum, progress, targets_m=[0, 10, 30, 40], total_s=300)
    assert list(times) == pytest.approx([0, 50, 200, 300])


def test_travel_time_falls_back_to_uniform_speed() -> None:
    cum = np.array([0.0, 50, 100])
    times = travel_times_at(cum, [], targets_m=[25, 100], total_s=1000)
    assert list(times) == pytest.approx([250, 1000])


# --- weather alignment -------------------------------------------------------------

T0 = int(datetime(2026, 1, 10, 12, tzinfo=UTC).timestamp())


def _series() -> HourlySeries:
    return HourlySeries(
        times=[T0, T0 + 3600, T0 + 7200],
        wind_kmh=[10.0, 20.0, 30.0],
        gust_kmh=[15.0, 25.0, 40.0],
        rain_mm=[0.0, 2.54, 5.08],
        showers_mm=[0.0, 0.0, 2.54],
        snow_cm=[0.0, 2.54, 0.0],
        weather_code=[0, 61, 63],
    )


def test_precipitation_uses_the_hour_containing_the_eta() -> None:
    # 13:30 sits in the 13:00-14:00 hour, which Open-Meteo labels 14:00.
    w = weather_at(_series(), T0 + 5400)
    assert w is not None
    assert w.rain_in_hr == pytest.approx(0.3)  # (5.08 + 2.54) mm
    assert w.snow_in_hr == pytest.approx(0.0)
    assert w.gust_mph == pytest.approx(kmh_to_mph(40))
    assert w.valid_from == T0 + 3600 and w.valid_to == T0 + 7200


def test_wind_is_interpolated_between_instant_readings() -> None:
    w = weather_at(_series(), T0 + 5400)
    assert w is not None
    assert w.wind_mph == pytest.approx(kmh_to_mph(25))


def test_eta_exactly_on_the_hour() -> None:
    w = weather_at(_series(), T0 + 3600)
    assert w is not None
    assert w.wind_mph == pytest.approx(kmh_to_mph(20))
    assert w.rain_in_hr == pytest.approx(0.1)
    assert w.snow_in_hr == pytest.approx(1.0)


def test_eta_outside_forecast_returns_none() -> None:
    assert weather_at(_series(), T0 + 7201) is None
    assert weather_at(_series(), T0 - 1) is None


def test_missing_values_return_none() -> None:
    s = _series()
    s = HourlySeries(**{**s.__dict__, "rain_mm": [0.0, None, None]})
    assert weather_at(s, T0 + 5400) is None


# --- miles per level ---------------------------------------------------------------


def test_each_checkpoint_covers_half_way_to_its_neighbours() -> None:
    d = [miles_to_meters(m) for m in (0, 10, 20, 25)]
    miles = attribute_miles(d, [L, H, S, L], total_m=miles_to_meters(25))
    assert miles.by_level[L] == pytest.approx(5 + 2.5)
    assert miles.by_level[H] == pytest.approx(10)
    assert miles.by_level[S] == pytest.approx(7.5)
    assert miles.by_level[M] == 0 and miles.by_level[N] == 0
    assert miles.unknown == 0
    assert miles.average_risk == pytest.approx((10 * 2 + 7.5 * 3) / 25)


def test_unknown_weather_is_reported_separately() -> None:
    d = [miles_to_meters(m) for m in (0, 10, 20)]
    miles = attribute_miles(d, [L, None, H], total_m=miles_to_meters(20))
    assert miles.unknown == pytest.approx(10)
    assert miles.average_risk == pytest.approx((5 * 2) / 10)


# --- ranking ----------------------------------------------------------------------


def _score(rid: str, *, nt=0.0, sev=0.0, high=0.0, avg=0.0, mins=600.0, unknown=0.0):
    return RouteScore(
        route_id=rid,
        label=f"Route {rid}",
        miles={L: 100.0, M: 0.0, H: high, S: sev, N: nt},
        unknown_miles=unknown,
        average_risk=avg,
        duration_s=mins * 60,
    )


def test_fewest_severe_miles_wins_over_faster_route() -> None:
    rec = recommend([_score("A", sev=20, mins=500), _score("B", sev=5, mins=700)])
    assert rec.route_id == "B"
    assert rec.criterion == "severe"
    assert "Severe" in rec.reason


def test_no_travel_miles_rank_worse_than_severe() -> None:
    rec = recommend([_score("A", nt=1, sev=0), _score("B", nt=0, sev=50)])
    assert rec.route_id == "B"
    assert rec.criterion == "no_travel"


def test_then_high_then_average_then_time() -> None:
    assert recommend([_score("A", high=9), _score("B", high=3)]).criterion == "high"
    rec = recommend([_score("A", avg=0.6), _score("B", avg=0.4)])
    assert (rec.route_id, rec.criterion) == ("B", "average")
    rec = recommend([_score("A", mins=650), _score("B", mins=600)])
    assert (rec.route_id, rec.criterion) == ("B", "duration")


def test_tiny_mileage_differences_are_ties() -> None:
    rec = recommend([_score("A", sev=10.02, mins=500), _score("B", sev=10.0, mins=600)])
    assert (rec.route_id, rec.criterion) == ("A", "duration")


def test_full_ranking_order() -> None:
    rec = recommend([_score("A", sev=5), _score("B", nt=2), _score("C")])
    assert rec.ranking == ["C", "A", "B"]


def test_warns_when_every_route_has_no_travel_miles() -> None:
    rec = recommend([_score("A", nt=5), _score("B", nt=9)])
    assert rec.safe is False
    assert any("No Travel" in w for w in rec.warnings)


def test_safe_recommendation_has_no_no_travel_warning() -> None:
    rec = recommend([_score("A", sev=3), _score("B", sev=9)])
    assert rec.safe is True
    assert any("Severe" in w for w in rec.warnings)


def test_unknown_miles_produce_a_warning() -> None:
    rec = recommend([_score("A", unknown=40)])
    assert any("forecast" in w for w in rec.warnings)


def test_tradeoff_explains_what_the_fastest_route_costs() -> None:
    rec = recommend(
        [_score("A", sev=120, mins=500), _score("B", sev=0, mins=536), _score("C", mins=560)]
    )
    assert rec.route_id == "B"
    assert rec.tradeoff == (
        "It avoids 120 mi of Severe conditions on the fastest route, Route A, "
        "for 36 min more driving."
    )


def test_no_tradeoff_when_the_fastest_route_wins() -> None:
    assert recommend([_score("A", mins=500), _score("B", mins=536)]).tradeoff is None
