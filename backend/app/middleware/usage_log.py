"""Usage-log middleware.

Emits one JSON-Lines record per inbound request to stdout. Railway's
log pipeline captures stdout, so no storage dependency is introduced.
The middleware is strictly observational: it never mutates the
request, the response, or the response body, and any exception raised
while serialising the log record is swallowed so telemetry failure
cannot take the API down.
"""
from __future__ import annotations

import json
import time
from typing import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Low-signal paths are skipped so the Railway health probe and the
# frontend's 30 s liveness poll do not drown out real usage.
_SKIP_PATHS = frozenset({"/health", "/", "/openapi.json", "/docs", "/favicon.ico"})


def _client_ip(request: Request) -> str:
    # Railway puts the origin client IP in X-Forwarded-For (comma
    # separated, first entry is the original client). Fall back to
    # the direct peer address when the header is absent (local dev).
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "-"


class UsageLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        path = request.url.path
        if path in _SKIP_PATHS:
            return await call_next(request)

        t0 = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)

        try:
            record = {
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "evt": "usage",
                "method": request.method,
                "path": path,
                "status": response.status_code,
                "elapsed_ms": elapsed_ms,
                "ip": _client_ip(request),
                "ua": request.headers.get("user-agent", "-"),
                "ref": request.headers.get("referer", "-"),
            }
            print(json.dumps(record, separators=(",", ":")), flush=True)
        except Exception:
            # Telemetry must never take down the request path.
            pass

        return response
