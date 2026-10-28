"""Routing provider selection.

Production always uses TomTom. Local development and end-to-end tests can set
FAKE_ROUTING=1 (only honoured when DEBUG is on) to use synthetic routes, so the UI can be
built and tested without a TomTom key or network access.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from django.conf import settings

from . import fake_routing, tomtom

Coord = tuple[float, float]


def _fake() -> bool:
    return bool(settings.DEBUG and settings.FAKE_ROUTING)


def calculate_routes(
    locations: Sequence[Coord],
    *,
    depart_at: datetime | None,
    gross_weight_kg: int,
    max_alternatives: int = 0,
) -> list[tomtom.RawRoute]:
    impl = fake_routing.calculate_routes if _fake() else tomtom.calculate_routes
    return impl(
        locations,
        depart_at=depart_at,
        gross_weight_kg=gross_weight_kg,
        max_alternatives=max_alternatives,
    )


def reverse_geocode(lat: float, lon: float) -> tomtom.Place | None:
    impl = fake_routing.reverse_geocode if _fake() else tomtom.reverse_geocode
    return impl(lat, lon)


def search_places(query: str, *, limit: int = 6) -> list[tomtom.Place]:
    if _fake():
        return fake_routing.search_places(query, limit=limit)
    return tomtom.search_places(query, limit=limit)
