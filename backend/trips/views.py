"""HTTP endpoints. Thin: validate, call a service, return JSON."""

from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from typing import Any

from django.core.cache import cache
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from core.risk import rules_table
from providers.tomtom import MissingApiKey

from . import serializers as s
from . import services
from .errors import ProviderError

GEOCODE_CACHE_S = 24 * 3600


def _errors(view: Callable[[Request], Response]) -> Callable[[Request], Response]:
    """Turn domain exceptions into the API's error shape."""

    @wraps(view)
    def wrapper(request: Request) -> Response:
        try:
            return view(request)
        except services.TripInputError as exc:
            return _error("invalid_trip", str(exc), status.HTTP_422_UNPROCESSABLE_ENTITY)
        except MissingApiKey:
            return _error(
                "not_configured",
                "Routing isn't configured on this server yet (missing TomTom API key).",
                status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    return wrapper


def _error(code: str, message: str, http_status: int) -> Response:
    return Response({"error": {"code": code, "message": message, "details": None}}, http_status)


ERRORS = {
    400: s.ErrorSerializer,
    422: s.ErrorSerializer,
    502: s.ErrorSerializer,
    503: s.ErrorSerializer,
}


@extend_schema(responses={200: dict[str, str]})
@api_view(["GET"])
def health(request: Request) -> Response:
    return Response({"status": "ok"})


@extend_schema(responses={200: dict[str, Any]})
@api_view(["GET"])
def rules(request: Request) -> Response:
    return Response(rules_table())


@extend_schema(
    parameters=[OpenApiParameter("q", str, required=True, description="At least 3 characters")],
    responses={200: s.GeocodeResultSerializer(many=True), **ERRORS},
)
@api_view(["GET"])
@_errors
def geocode(request: Request) -> Response:
    query = s.GeocodeQuerySerializer(data=request.query_params)
    query.is_valid(raise_exception=True)
    q = " ".join(query.validated_data["q"].split()).lower()
    key = f"geo:{q}"
    results = cache.get(key)
    if results is None:
        results = services.geocode(q)
        cache.set(key, results, GEOCODE_CACHE_S)
    return Response(results)


@extend_schema(
    request=s.RoutesRequestSerializer, responses={200: s.RoutesResponseSerializer, **ERRORS}
)
@api_view(["POST"])
@_errors
def routes(request: Request) -> Response:
    body = s.RoutesRequestSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    v = body.validated_data
    result = services.plan_routes(
        origin=services.Place(**v["origin"]),
        destination=services.Place(**v["destination"]),
        departure_local=v["departure"],
        load_lb=v["load_lb"],
        interval_mi=int(v["interval_mi"]),
    )
    return Response(result)


@extend_schema(
    request=s.AssessRequestSerializer, responses={200: s.AssessResponseSerializer, **ERRORS}
)
@api_view(["POST"])
@_errors
def assess(request: Request) -> Response:
    body = s.AssessRequestSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    v = body.validated_data
    return Response(services.assess_routes(v["routes"], v["load_lb"], v["scenario"]))


@extend_schema(
    request=s.HeatmapRequestSerializer, responses={200: s.HeatmapResponseSerializer, **ERRORS}
)
@api_view(["POST"])
@_errors
def heatmap(request: Request) -> Response:
    body = s.HeatmapRequestSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    v = body.validated_data
    lines = [[(lat, lon) for lon, lat in line] for line in v["routes"]]
    return Response(services.heatmap(lines, v["start"], v["load_lb"], v["scenario"]))


__all__ = ["ProviderError", "assess", "geocode", "health", "heatmap", "routes", "rules"]
