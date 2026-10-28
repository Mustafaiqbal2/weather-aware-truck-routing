"""Uniform JSON error shape: {"error": {"code": ..., "message": ..., "details": ...}}."""

from typing import Any

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class ProviderError(APIException):
    """A third-party API (routing, geocoding, weather) failed or refused the request."""

    status_code = status.HTTP_502_BAD_GATEWAY
    default_code = "provider_error"
    default_detail = "An upstream data provider failed."

    def __init__(self, message: str, *, code: str = "provider_error", http_status: int = 502):
        super().__init__(detail=message, code=code)
        self.status_code = http_status


def exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    code = getattr(exc, "default_code", "error")
    if isinstance(exc, APIException):
        codes = exc.get_codes()
        if isinstance(codes, str):
            code = codes
    if isinstance(response.data, dict) and "detail" in response.data:
        message = str(response.data["detail"])
        details = None
    else:
        message = "Invalid request."
        details = response.data
    response.data = {"error": {"code": code, "message": message, "details": details}}
    return response
