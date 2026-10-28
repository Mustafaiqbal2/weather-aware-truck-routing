"""Pick the forecast values that apply when the truck reaches a checkpoint.

Open-Meteo hourly data mixes two kinds of value:
* Accumulations (rain, showers, snowfall) and gusts describe the hour *before* each
  timestamp. The 15:00 value is what falls between 14:00 and 15:00.
* Wind speed is an instant reading at the timestamp.

So for a truck arriving at 14:20 we use the 15:00 accumulations (the hour that contains
14:20) and interpolate wind between the 14:00 and 15:00 readings.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from .units import cm_to_in, kmh_to_mph, mm_to_in

HOUR_S = 3600


@dataclass(frozen=True)
class HourlySeries:
    times: Sequence[int]  # unix seconds UTC, on the hour, ascending
    wind_kmh: Sequence[float | None]
    gust_kmh: Sequence[float | None]
    rain_mm: Sequence[float | None]
    showers_mm: Sequence[float | None]
    snow_cm: Sequence[float | None]
    weather_code: Sequence[int | None]


@dataclass(frozen=True)
class WeatherAt:
    wind_mph: float
    gust_mph: float | None
    rain_in_hr: float  # liquid rain + showers during the hour containing the ETA
    snow_in_hr: float  # snowfall depth during that hour
    weather_code: int | None
    valid_from: int  # unix seconds: start of the hour the accumulations cover
    valid_to: int


def weather_at(series: HourlySeries, t: float) -> WeatherAt | None:
    """Weather for unix time ``t``, or None when the forecast doesn't cover it."""
    index = {ts: i for i, ts in enumerate(series.times)}
    floor_ts = math.floor(t / HOUR_S) * HOUR_S
    bucket_end = math.ceil(t / HOUR_S) * HOUR_S

    i_end = index.get(bucket_end)
    i_floor = index.get(floor_ts)
    if i_end is None or i_floor is None:
        return None

    wind_a, wind_b = series.wind_kmh[i_floor], series.wind_kmh[i_end]
    rain, showers = series.rain_mm[i_end], series.showers_mm[i_end]
    snow = series.snow_cm[i_end]
    if wind_a is None or wind_b is None or rain is None or snow is None:
        return None

    frac = 0.0 if bucket_end == floor_ts else (t - floor_ts) / HOUR_S
    wind_kmh = wind_a + (wind_b - wind_a) * frac
    gust = series.gust_kmh[i_end]
    return WeatherAt(
        wind_mph=kmh_to_mph(max(wind_kmh, 0.0)),
        gust_mph=kmh_to_mph(gust) if gust is not None else None,
        rain_in_hr=mm_to_in(max(rain + (showers or 0.0), 0.0)),
        snow_in_hr=cm_to_in(max(snow, 0.0)),
        weather_code=series.weather_code[i_end] if t > floor_ts else series.weather_code[i_floor],
        valid_from=bucket_end - HOUR_S,
        valid_to=bucket_end,
    )
