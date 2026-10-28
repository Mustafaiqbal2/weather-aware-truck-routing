"""Request validation and response shapes (the latter feed the OpenAPI schema)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.risk import RiskLevel

LEVEL_KEYS = [lvl.key for lvl in RiskLevel]
MAX_LOAD_LB = 120_000


@extend_schema_field(OpenApiTypes.STR)
class LocalDateTimeField(serializers.Field[datetime | None, str, str, Any]):
    """A wall-clock time with no offset, e.g. "2026-11-02T06:30" in the origin's time zone.

    The literal "now" means leave immediately. The browser can't know the origin's time
    zone, so it shouldn't guess what "now" is there.
    """

    default_error_messages = {  # noqa: RUF012
        "invalid": 'Use "now" or the format YYYY-MM-DDTHH:MM, without a time zone offset.',
    }

    def to_internal_value(self, data: Any) -> datetime | None:
        if data == "now":
            return None
        try:
            value = datetime.fromisoformat(str(data))
        except ValueError:
            self.fail("invalid")
        if value.tzinfo is not None:
            self.fail("invalid")
        return value

    def to_representation(self, value: datetime | None) -> str:
        return "now" if value is None else value.isoformat(timespec="minutes")


# --- Requests ----------------------------------------------------------------------


class PlaceSerializer(serializers.Serializer[Any]):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    label = serializers.CharField(max_length=200)


class RoutesRequestSerializer(serializers.Serializer[Any]):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure = LocalDateTimeField(
        help_text='"now", or local time at the origin such as 2026-11-02T06:30'
    )
    load_lb = serializers.FloatField(min_value=0, max_value=MAX_LOAD_LB)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50], default=25)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        o, d = attrs["origin"], attrs["destination"]
        if abs(o["lat"] - d["lat"]) < 1e-3 and abs(o["lon"] - d["lon"]) < 1e-3:
            raise serializers.ValidationError("Origin and destination are the same place.")
        return attrs


class CheckpointInputSerializer(serializers.Serializer[Any]):
    index = serializers.IntegerField(min_value=0)
    mile = serializers.FloatField(min_value=0)
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    eta = serializers.DateTimeField()


class RouteInputSerializer(serializers.Serializer[Any]):
    id = serializers.ChoiceField(choices=["A", "B", "C"])
    label = serializers.CharField(max_length=200)
    distance_mi = serializers.FloatField(min_value=0)
    duration_s = serializers.FloatField(min_value=0)
    checkpoints = CheckpointInputSerializer(many=True, min_length=2, max_length=600)


SCENARIOS = ["live", "storm"]


class AssessRequestSerializer(serializers.Serializer[Any]):
    load_lb = serializers.FloatField(min_value=0, max_value=MAX_LOAD_LB)
    routes = RouteInputSerializer(many=True, min_length=1, max_length=3)
    scenario = serializers.ChoiceField(
        choices=SCENARIOS,
        default="live",
        help_text='"storm" lays a clearly simulated storm over the real forecast (demo).',
    )


class HeatmapRequestSerializer(serializers.Serializer[Any]):
    start = serializers.DateTimeField()
    load_lb = serializers.FloatField(min_value=0, max_value=MAX_LOAD_LB)
    scenario = serializers.ChoiceField(choices=SCENARIOS, default="live")
    routes = serializers.ListField(
        child=serializers.ListField(
            child=serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2),
            min_length=2,
            max_length=5_000,
        ),
        min_length=1,
        max_length=3,
        help_text="Route lines as [[lon, lat], ...]",
    )


class GeocodeQuerySerializer(serializers.Serializer[Any]):
    q = serializers.CharField(min_length=3, max_length=120)


# --- Responses ---------------------------------------------------------------------


class PlaceOutSerializer(PlaceSerializer):
    tz = serializers.CharField()


class CheckpointOutSerializer(serializers.Serializer[Any]):
    index = serializers.IntegerField()
    mile = serializers.FloatField()
    lat = serializers.FloatField()
    lon = serializers.FloatField()
    eta = serializers.DateTimeField()
    tz = serializers.CharField()


class RouteOutSerializer(serializers.Serializer[Any]):
    id = serializers.CharField()
    label = serializers.CharField()
    source = serializers.ChoiceField(choices=["tomtom", "tomtom_alternative", "detour"])
    roads = serializers.ListField(child=serializers.CharField())
    distance_mi = serializers.FloatField()
    duration_s = serializers.IntegerField()
    traffic_delay_s = serializers.IntegerField()
    departure = serializers.DateTimeField()
    arrival = serializers.DateTimeField()
    geometry = serializers.ListField(
        child=serializers.ListField(child=serializers.FloatField()),
        help_text="[[lon, lat], ...]",
    )
    checkpoints = CheckpointOutSerializer(many=True)


class RoutesResponseSerializer(serializers.Serializer[Any]):
    origin = PlaceOutSerializer()
    destination = PlaceOutSerializer()
    departure = serializers.DateTimeField()
    load_lb = serializers.FloatField()
    interval_mi = serializers.IntegerField()
    routes = RouteOutSerializer(many=True)
    warnings = serializers.ListField(child=serializers.CharField())


class WeatherOutSerializer(serializers.Serializer[Any]):
    wind_mph = serializers.FloatField()
    gust_mph = serializers.FloatField(allow_null=True)
    rain_in_hr = serializers.FloatField()
    snow_in_hr = serializers.FloatField()
    weather_code = serializers.IntegerField(allow_null=True)
    valid_from = serializers.DateTimeField()
    valid_to = serializers.DateTimeField()


class RiskOutSerializer(serializers.Serializer[Any]):
    level = serializers.ChoiceField(choices=LEVEL_KEYS)
    value = serializers.IntegerField(min_value=0, max_value=4)
    wind = serializers.ChoiceField(choices=LEVEL_KEYS)
    rain = serializers.ChoiceField(choices=LEVEL_KEYS)
    snow = serializers.ChoiceField(choices=LEVEL_KEYS)
    load = serializers.ChoiceField(choices=LEVEL_KEYS, allow_null=True)
    drivers = serializers.ListField(
        child=serializers.ChoiceField(choices=["wind", "rain", "snow", "load"])
    )
    summary = serializers.CharField()


class AssessedCheckpointSerializer(serializers.Serializer[Any]):
    index = serializers.IntegerField()
    weather = WeatherOutSerializer(allow_null=True)
    risk = RiskOutSerializer(allow_null=True)


class MilesSerializer(serializers.Serializer[Any]):
    low = serializers.FloatField()
    moderate = serializers.FloatField()
    high = serializers.FloatField()
    severe = serializers.FloatField()
    no_travel = serializers.FloatField()
    unknown = serializers.FloatField()


class AssessedRouteSerializer(serializers.Serializer[Any]):
    id = serializers.CharField()
    checkpoints = AssessedCheckpointSerializer(many=True)
    miles = MilesSerializer()
    average_risk = serializers.FloatField()
    max_level = serializers.ChoiceField(choices=LEVEL_KEYS, allow_null=True)


class RecommendationSerializer(serializers.Serializer[Any]):
    route_id = serializers.CharField()
    ranking = serializers.ListField(child=serializers.CharField())
    criterion = serializers.ChoiceField(
        choices=["no_travel", "severe", "high", "average", "duration", "tie", "only"]
    )
    reason = serializers.CharField()
    tradeoff = serializers.CharField(allow_null=True)
    safe = serializers.BooleanField()
    warnings = serializers.ListField(child=serializers.CharField())


class LevelMilesSerializer(serializers.Serializer[Any]):
    low = serializers.FloatField()
    moderate = serializers.FloatField()
    high = serializers.FloatField()
    severe = serializers.FloatField()
    no_travel = serializers.FloatField()


class DepartureOptionSerializer(serializers.Serializer[Any]):
    offset_h = serializers.IntegerField()
    departure = serializers.DateTimeField()
    route_id = serializers.CharField()
    complete = serializers.BooleanField(
        help_text="False when part of the trip is beyond the forecast"
    )
    miles = LevelMilesSerializer()
    average_risk = serializers.FloatField()
    max_level = serializers.ChoiceField(choices=LEVEL_KEYS, allow_null=True)
    arrival = serializers.DateTimeField()


class DeparturesSerializer(serializers.Serializer[Any]):
    options = DepartureOptionSerializer(many=True)
    best_offset_h = serializers.IntegerField(allow_null=True)
    reason = serializers.CharField(allow_null=True)


class AssessResponseSerializer(serializers.Serializer[Any]):
    routes = AssessedRouteSerializer(many=True)
    recommendation = RecommendationSerializer()
    departures = DeparturesSerializer()
    scenario = serializers.ChoiceField(choices=SCENARIOS)


class HeatmapGridSerializer(serializers.Serializer[Any]):
    west = serializers.FloatField()
    south = serializers.FloatField()
    east = serializers.FloatField()
    north = serializers.FloatField()
    cols = serializers.IntegerField()
    rows = serializers.IntegerField()
    cells = serializers.ListField(child=serializers.IntegerField())
    edge = serializers.ListField(
        child=serializers.FloatField(), help_text="Distance to route / buffer, 0..1, per cell"
    )


class HeatmapScalesSerializer(serializers.Serializer[Any]):
    risk = serializers.FloatField()
    wind = serializers.FloatField()
    rain = serializers.FloatField()
    snow = serializers.FloatField()


class HeatmapFramesSerializer(serializers.Serializer[Any]):
    risk = serializers.CharField(help_text="base64 uint8, hour-major: [hour][cell]")
    wind = serializers.CharField()
    rain = serializers.CharField()
    snow = serializers.CharField()


class HeatmapResponseSerializer(serializers.Serializer[Any]):
    start = serializers.DateTimeField()
    hours = serializers.IntegerField()
    grid = HeatmapGridSerializer()
    scales = HeatmapScalesSerializer()
    nodata = serializers.IntegerField()
    frames = HeatmapFramesSerializer()
    scenario = serializers.ChoiceField(choices=SCENARIOS)


class GeocodeResultSerializer(serializers.Serializer[Any]):
    id = serializers.CharField()
    label = serializers.CharField()
    detail = serializers.CharField()
    lat = serializers.FloatField()
    lon = serializers.FloatField()
    kind = serializers.CharField()


class ErrorBodySerializer(serializers.Serializer[Any]):
    code = serializers.CharField()
    message = serializers.CharField()
    details = serializers.JSONField(allow_null=True)


class ErrorSerializer(serializers.Serializer[Any]):
    error = ErrorBodySerializer()
