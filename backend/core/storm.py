"""A simulated storm for demonstrations ("storm drill").

Real weather is often calm, which makes the risk rules hard to show. When the user turns
the drill on, this synthetic storm is laid over the real forecast (each value is the
larger of the two). The UI labels every result as simulated.

The storm is placed relative to the trip so it always matters:
* its centre starts 40% of the way from origin to destination and drifts towards the
  destination at 30 km/h;
* north of the trip axis (left of travel direction) it brings heavy snow and strong
  wind; south of the axis, heavy rain;
* it builds over the first few hours, peaks, and has faded out after about a day, so
  leaving later is genuinely safer and the departure-window feature has something to find.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .weather_align import HourlySeries

Coord = tuple[float, float]  # (lat, lon)

KM_PER_DEG_LAT = 110.57
DRIFT_KMH = 30.0
ALONG_SIGMA_KM = 90.0
CORE_OFFSET_KM = 30.0  # the snow core sits this far left of the trip axis
CORE_SIGMA_KM = 50.0
RAIN_OFFSET_KM = -70.0  # the rain band sits this far right of it
RAIN_SIGMA_KM = 50.0

PEAK_SNOW_CM = 6.6  # 2.6 in/hr: Severe
PEAK_WIND_KMH = 72.0  # 44.7 mph: High, Severe with a load over 40,000 lb
PEAK_RAIN_MM = 9.0  # 0.35 in/hr: High


@dataclass(frozen=True)
class StormFrame:
    """The trip axis in a local flat frame (km), plus the storm's start time."""

    origin: Coord
    destination: Coord
    start_ts: float

    def _xy(self, lat: float, lon: float) -> tuple[float, float]:
        lat0 = math.radians(self.origin[0])
        return (
            (lon - self.origin[1]) * KM_PER_DEG_LAT * math.cos(lat0),
            (lat - self.origin[0]) * KM_PER_DEG_LAT,
        )

    def conditions(self, lat: float, lon: float, ts: float) -> tuple[float, float, float]:
        """(wind km/h, rain mm/hr, snow cm/hr) the storm adds at a place and time."""
        dx, dy = self._xy(*self.destination)
        length = math.hypot(dx, dy)
        if length < 1:
            return (0.0, 0.0, 0.0)
        ux, uy = dx / length, dy / length
        px, py = self._xy(lat, lon)
        along = px * ux + py * uy
        across = -px * uy + py * ux  # positive = left of the travel direction

        hours = (ts - self.start_ts) / 3600
        centre = 0.4 * length + DRIFT_KMH * hours
        strength = _life(hours) * math.exp(-0.5 * ((along - centre) / ALONG_SIGMA_KM) ** 2)
        if strength < 1e-3:
            return (0.0, 0.0, 0.0)
        core = math.exp(-0.5 * ((across - CORE_OFFSET_KM) / CORE_SIGMA_KM) ** 2)
        rain = math.exp(-0.5 * ((across - RAIN_OFFSET_KM) / RAIN_SIGMA_KM) ** 2)
        return (
            PEAK_WIND_KMH * strength * core,
            PEAK_RAIN_MM * strength * rain,
            PEAK_SNOW_CM * strength * core,
        )


def _life(hours: float) -> float:
    """Builds over 3 hours, holds until hour 12, gone by hour 26."""
    if hours < 0:
        return 0.6
    if hours < 3:
        return 0.6 + 0.4 * hours / 3
    if hours < 12:
        return 1.0
    return max(0.0, 1.0 - (hours - 12) / 14)


def overlay(series: HourlySeries, point: Coord, frame: StormFrame) -> HourlySeries:
    """The real forecast with the storm laid over it (larger value wins).

    Wind is an instant value, so the storm is evaluated at each timestamp. Rain and snow
    are totals for the hour before each timestamp, so the storm is evaluated mid-hour.
    Missing real values stay missing, so the drill never invents a forecast.
    """
    wind: list[float | None] = []
    rain: list[float | None] = []
    snow: list[float | None] = []
    codes: list[int | None] = []
    for i, ts in enumerate(series.times):
        storm_wind, _, _ = frame.conditions(point[0], point[1], ts)
        _, storm_rain, storm_snow = frame.conditions(point[0], point[1], ts - 1800)
        real_wind, real_rain, real_snow = series.wind_kmh[i], series.rain_mm[i], series.snow_cm[i]
        showers = series.showers_mm[i] or 0.0
        wind.append(None if real_wind is None else max(real_wind, storm_wind))
        # Showers are folded into rain here, so the result's showers are zero.
        rain.append(None if real_rain is None else max(real_rain + showers, storm_rain))
        snow.append(None if real_snow is None else max(real_snow, storm_snow))
        code = series.weather_code[i]
        if storm_snow > 0.5:
            code = 75  # heavy snowfall
        elif storm_rain > 2.0:
            code = 63  # moderate rain
        codes.append(code)
    return HourlySeries(
        times=series.times,
        wind_kmh=wind,
        gust_kmh=[
            None if w is None else max(w * 1.4, g or 0.0)
            for w, g in zip(wind, series.gust_kmh, strict=True)
        ],
        rain_mm=rain,
        showers_mm=[0.0 if r is not None else None for r in rain],
        snow_cm=snow,
        weather_code=codes,
    )
