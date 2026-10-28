"""Shared HTTP client with retries for third-party APIs."""

from __future__ import annotations

import logging
import random
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {429, 500, 502, 503, 504}

# One client per warm function instance: keeps TLS connections alive between requests.
_client = httpx.Client(
    timeout=httpx.Timeout(20.0, connect=5.0),
    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
    headers={"User-Agent": "weather-aware-truck-routing/1.0"},
)


class UpstreamError(Exception):
    def __init__(self, service: str, status: int | None, message: str):
        super().__init__(f"{service}: {message}")
        self.service = service
        self.status = status
        self.message = message


def get_json(
    service: str,
    url: str,
    params: dict[str, Any] | list[tuple[str, Any]] | None = None,
    *,
    attempts: int = 3,
) -> Any:
    """GET a JSON document, retrying rate limits, server errors and network failures."""
    last_error: UpstreamError | None = None
    for attempt in range(attempts):
        try:
            response = _client.get(url, params=params)
        except httpx.HTTPError as exc:
            last_error = UpstreamError(service, None, f"network error: {exc.__class__.__name__}")
        else:
            if response.status_code < 400:
                return response.json()
            last_error = UpstreamError(service, response.status_code, _error_text(response))
            if response.status_code not in RETRYABLE_STATUS:
                raise last_error
        if attempt < attempts - 1:
            delay = _retry_delay(attempt, last_error)
            logger.warning("%s failed (%s); retrying in %.1fs", service, last_error, delay)
            time.sleep(delay)
    assert last_error is not None
    raise last_error


def _retry_delay(attempt: int, error: UpstreamError) -> float:
    base = 1.5 if error.status == 429 else 0.5
    return base * (2**attempt) + random.uniform(0, 0.25)


def _error_text(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return f"HTTP {response.status_code}"
    if isinstance(body, dict):
        for key in ("reason", "errorText", "message", "detailedError", "error"):
            value = body.get(key)
            if isinstance(value, str):
                return value
            if isinstance(value, dict) and isinstance(value.get("message"), str):
                return str(value["message"])
    return f"HTTP {response.status_code}"
