"""TomTom Routing (truck mode) and Search (geocoding) clients."""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import quote

from django.conf import settings

from .http import get_json

BASE_URL = "https://api.tomtom.com"
SERVICE = "TomTom"

Coord = tuple[float, float]  # (lat, lon)

# Roads covering less than this share of a route are left out of its name: a 10 km
# truck bypass shouldn't headline a 450 km trip.
MIN_ROAD_SHARE = 0.05
_DIRECTION = re.compile(r"\s+[NSEW]$")  # "I-90 E" -> "I-90"

# A typical US 5-axle tractor with a 53 ft dry van. Dimensions make TomTom respect low
# bridges and length limits; weight comes from the driver's load plus tare.
TRUCK_PROFILE = {
    "vehicleLength": 21.9,  # m (72 ft overall)
    "vehicleWidth": 2.6,  # m (102 in)
    "vehicleHeight": 4.11,  # m (13 ft 6 in)
    "vehicleNumberOfAxles": 5,
    "vehicleCommercial": "true",
}


class MissingApiKey(Exception):
    pass


@dataclass(frozen=True)
class RawRoute:
    points: list[Coord]
    length_m: float
    travel_time_s: float
    traffic_delay_s: float
    progress: list[tuple[int, float]]  # (point index, seconds from start)
    roads: list[str]  # road numbers / names, longest stretch first


@dataclass(frozen=True)
class Place:
    id: str
    label: str
    detail: str
    lat: float
    lon: float
    kind: str


def _key() -> str:
    key: str = settings.TOMTOM_API_KEY
    if not key:
        raise MissingApiKey("TOMTOM_API_KEY is not configured")
    return key


def calculate_routes(
    locations: Sequence[Coord],
    *,
    depart_at: datetime | None,
    gross_weight_kg: int,
    max_alternatives: int = 0,
) -> list[RawRoute]:
    """Truck routes through ``locations`` (origin, optional via points, destination)."""
    path = ":".join(f"{lat:.6f},{lon:.6f}" for lat, lon in locations)
    params: list[tuple[str, Any]] = [
        ("key", _key()),
        ("travelMode", "truck"),
        ("routeType", "fastest"),
        ("traffic", "true"),
        ("departAt", depart_at.isoformat(timespec="seconds") if depart_at else "now"),
        ("vehicleWeight", gross_weight_kg),
        *TRUCK_PROFILE.items(),
        ("maxAlternatives", max_alternatives),
        # TomTom rejects alternativeType on requests without alternatives (detour legs).
        *([("alternativeType", "anyRoute")] if max_alternatives > 0 else []),
        ("instructionsType", "coded"),
        ("routeRepresentation", "polyline"),
        ("extendedRouteRepresentation", "travelTime"),
        ("extendedRouteRepresentation", "distance"),
    ]
    data = get_json(SERVICE, f"{BASE_URL}/routing/1/calculateRoute/{path}/json", params)
    return [_parse_route(r) for r in data.get("routes", [])]


def _parse_route(route: dict[str, Any]) -> RawRoute:
    points = [
        (float(p["latitude"]), float(p["longitude"]))
        for leg in route.get("legs", [])
        for p in leg.get("points", [])
    ]
    summary = route["summary"]
    progress = [
        (int(e["pointIndex"]), float(e["travelTimeInSeconds"]))
        for e in route.get("progress", [])
        if "travelTimeInSeconds" in e and int(e["pointIndex"]) < len(points)
    ]
    instructions = route.get("guidance", {}).get("instructions", [])
    return RawRoute(
        points=points,
        length_m=float(summary["lengthInMeters"]),
        travel_time_s=float(summary["travelTimeInSeconds"]),
        traffic_delay_s=float(summary.get("trafficDelayInSeconds", 0)),
        progress=progress,
        roads=_main_roads(instructions, float(summary["lengthInMeters"])),
    )


def _main_roads(instructions: list[dict[str, Any]], length_m: float) -> list[str]:
    """Main roads ranked by how far the route follows them (from guidance instructions).

    Directions are merged ("I-90 E" and "I-90 W" are one road) and roads under
    ``MIN_ROAD_SHARE`` of the route are dropped, except the longest.
    """
    ordered = sorted(instructions, key=lambda i: i.get("routeOffsetInMeters", 0))
    distance: dict[str, float] = defaultdict(float)
    for current, nxt in zip(ordered, [*ordered[1:], None], strict=True):
        start = current.get("routeOffsetInMeters", 0)
        end = nxt.get("routeOffsetInMeters", length_m) if nxt else length_m
        numbers = current.get("roadNumbers") or []
        name = numbers[0] if numbers else current.get("street")
        if name:
            distance[_DIRECTION.sub("", name)] += max(end - start, 0)
    ranked = sorted(distance.items(), key=lambda kv: -kv[1])
    return [
        name
        for i, (name, metres) in enumerate(ranked)
        if i == 0 or metres >= MIN_ROAD_SHARE * length_m
    ]


def reverse_geocode(lat: float, lon: float) -> Place | None:
    """The town (and street address) nearest a point; None over open water."""
    url = f"{BASE_URL}/search/2/reverseGeocode/{lat:.6f},{lon:.6f}.json"
    data = get_json(SERVICE, url, {"key": _key(), "language": "en-US"})
    for result in data.get("addresses", []):
        address = result.get("address", {})
        if not address.get("countryCode"):
            continue  # ocean: TomTom answers with a world-sized bounding box
        town = address.get("municipality") or address.get("localName")
        region = address.get("countrySubdivisionCode") or address.get("countrySubdivision")
        label = ", ".join(x for x in (town, region) if x) or address.get("freeformAddress", "")
        if not label:
            continue
        return Place(
            id=str(result.get("id", "")),
            label=label,
            detail=address.get("freeformAddress") or address.get("country", ""),
            lat=lat,
            lon=lon,
            kind="Point",
        )
    return None


def search_places(query: str, *, limit: int = 6) -> list[Place]:
    params = {
        "key": _key(),
        "typeahead": "true",
        "limit": limit,
        "countrySet": "US,CA",
        "language": "en-US",
    }
    url = f"{BASE_URL}/search/2/search/{quote(query, safe='')}.json"
    data = get_json(SERVICE, url, params)
    places: list[Place] = []
    for r in data.get("results", []):
        address = r.get("address", {})
        poi = r.get("poi", {}).get("name")
        freeform = address.get("freeformAddress", "")
        region = ", ".join(
            x for x in (address.get("municipality"), address.get("countrySubdivision")) if x
        )
        places.append(
            Place(
                id=str(r.get("id", "")),
                label=poi or freeform,
                detail=freeform if poi else region or address.get("country", ""),
                lat=float(r["position"]["lat"]),
                lon=float(r["position"]["lon"]),
                kind=str(r.get("type", "")),
            )
        )
    return places
