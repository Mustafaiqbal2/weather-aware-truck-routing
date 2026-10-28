"""Generate deterministic API responses for the frontend's end-to-end tests.

Uses the synthetic routing provider and a scripted storm instead of live weather, so the
fixtures exercise every risk level without depending on today's forecast:

* a snow band (Severe) sitting across the straight Denver-Chicago corridor in Nebraska,
* strong wind (High, and Severe for loads over 40,000 lb) over western Iowa,
* light rain (Moderate) near Chicago.

Run from backend/:  python -m uv run python scripts/make_e2e_fixtures.py ../frontend/e2e/fixtures
"""

from __future__ import annotations

import json
import os
import sys
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
os.environ["FAKE_ROUTING"] = "1"
os.environ["DJANGO_DEBUG"] = "1"

import django  # noqa: E402

django.setup()

from rest_framework.test import APIClient  # noqa: E402

from core.weather_align import HourlySeries  # noqa: E402
from providers import openmeteo  # noqa: E402

Coord = tuple[float, float]


def storm(lat: float, lon: float, t: int) -> tuple[float, float, float, float]:
    """(wind km/h, rain mm, showers mm, snow cm) for a slow, eastward-drifting storm."""
    hours = (t - START) / 3600
    drift = 0.05 * hours  # degrees of longitude per hour
    wind, rain, snow = 14.0, 0.0, 0.0
    if lat > 40.0 and -101.0 + drift < lon < -98.5 + drift:
        snow = 5.6  # 2.2 in/hr: Severe
    if lat > 40.5 and -96.0 + drift < lon < -94.0 + drift:
        wind = 64.0  # 39.8 mph: High, Severe above 40,000 lb
    if lat < 40.0 and -93.0 < lon < -91.0:
        rain = 7.6  # 0.30 in/hr: High
    if lon > -89.0:
        rain = 3.3  # 0.13 in/hr: Moderate
    return wind, rain, 0.0, snow


def fake_fetch(points: Sequence[Coord], start: datetime, end: datetime) -> list[HourlySeries]:
    s = start.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    hours = int((end - s) / timedelta(hours=1)) + 2
    times = [int((s + timedelta(hours=h)).timestamp()) for h in range(hours)]
    out = []
    for lat, lon in points:
        vals = [storm(lat, lon, t) for t in times]
        out.append(
            HourlySeries(
                times=times,
                wind_kmh=[v[0] for v in vals],
                gust_kmh=[v[0] * 1.45 for v in vals],
                rain_mm=[v[1] for v in vals],
                showers_mm=[v[2] for v in vals],
                snow_cm=[v[3] for v in vals],
                weather_code=[73 if v[3] else 61 if v[1] else 3 for v in vals],
            )
        )
    return out


START = int(datetime.now(UTC).replace(minute=0, second=0, microsecond=0).timestamp())


def main(out_dir: Path) -> None:
    openmeteo.fetch_hourly = fake_fetch  # type: ignore[assignment]
    client = APIClient()
    out_dir.mkdir(parents=True, exist_ok=True)

    plan = client.post(
        "/api/routes",
        {
            "origin": {"lat": 39.7392, "lon": -104.9903, "label": "Denver, CO"},
            "destination": {"lat": 41.8781, "lon": -87.6298, "label": "Chicago, IL"},
            "departure": "now",
            "load_lb": 42000,
            "interval_mi": 25,
        },
        format="json",
    ).json()
    assess = client.post(
        "/api/assess", {"load_lb": plan["load_lb"], "routes": plan["routes"]}, format="json"
    ).json()
    heat = client.post(
        "/api/heatmap",
        {
            "start": plan["departure"],
            "load_lb": plan["load_lb"],
            "routes": [r["geometry"][::4] for r in plan["routes"]],
        },
        format="json",
    ).json()
    geocode = client.get("/api/geocode", {"q": "den"}).json()

    for name, data in {
        "routes": plan,
        "assess": assess,
        "heatmap": heat,
        "geocode": geocode,
    }.items():
        (out_dir / f"{name}.json").write_text(json.dumps(data), encoding="utf-8")
    rec = assess["recommendation"]
    print("recommended", rec["route_id"], "-", rec["reason"], "|", rec["tradeoff"])
    for r in assess["routes"]:
        print(r["id"], r["max_level"], {k: round(v) for k, v in r["miles"].items() if v})


if __name__ == "__main__":
    main(Path(sys.argv[1]))
