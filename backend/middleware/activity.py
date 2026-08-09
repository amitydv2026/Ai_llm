"""
activity.py — Middleware that logs every API request to the activity_logs table.

Non-blocking: if the logging insert fails, the request proceeds normally.
Skips: /health, /docs, /redoc, /openapi.json
"""

import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from database.supabase import get_supabase_admin
from services.auth_service import verify_token

logger = logging.getLogger("my_llm.activity")

# Paths that should NOT be logged
_SKIP_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


def _extract_user_id(request: Request) -> str | None:
    """Parse the Bearer token and extract the user's UUID, or return None."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header[7:]
    payload = verify_token(token)
    if payload:
        return payload.get("sub")
    return None


def _get_client_ip(request: Request) -> str:
    """Extract the real client IP, respecting X-Forwarded-For."""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # X-Forwarded-For can be a comma-separated list; take the first
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class ActivityLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Always process the request first
        response = await call_next(request)

        # Skip logging for internal / doc paths
        if path in _SKIP_PATHS or path.startswith("/app/"):
            return response

        # Non-blocking log attempt
        try:
            user_id = _extract_user_id(request)
            action = f"{request.method} {path}"
            ip_address = _get_client_ip(request)
            user_agent = request.headers.get("user-agent", "")

            client = get_supabase_admin()
            client.table("activity_logs").insert(
                {
                    "user_id": user_id,
                    "action": action,
                    "metadata": {
                        "query_params": dict(request.query_params),
                        "status_code": response.status_code,
                    },
                    "ip_address": ip_address,
                    "user_agent": user_agent,
                }
            ).execute()
        except Exception as exc:
            # Never let logging failures affect the response
            logger.warning("Activity logging failed: %s", exc)

        return response
