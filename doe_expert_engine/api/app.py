"""FastAPI transport layer for DOE design recommendations.

The API is intentionally small and stateless for the controlled beta.  The
limits below protect the single-process service from malformed or abusive
requests; they are not a distributed security boundary.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from starlette.exceptions import HTTPException as StarletteHTTPException

from doe_expert_engine.engine.decision_engine import recommend_design


API_VERSION = "1.2"
MAX_BODY_BYTES = 64 * 1024
MAX_CONTEXT_KEYS = 20
MAX_CONTEXT_BYTES = 8 * 1024
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_REQUESTS = 60

logger = logging.getLogger("doe_expert_engine.api")


class RecommendationRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=32)
    num_factors: int = Field(..., ge=1, le=64)
    user_budget: int = Field(..., ge=1, le=100_000)
    context: Optional[Dict[str, Any]] = None

    class Config:
        extra = "forbid"

    @validator("goal")
    def normalize_goal(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("goal must not be empty")
        return value

    @validator("context")
    def validate_context(cls, value: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if value is None:
            return None
        if len(value) > MAX_CONTEXT_KEYS:
            raise ValueError(f"context supports at most {MAX_CONTEXT_KEYS} keys")
        try:
            encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError) as exc:
            raise ValueError("context must contain JSON-compatible values") from exc
        if len(encoded.encode("utf-8")) > MAX_CONTEXT_BYTES:
            raise ValueError("context is too large")
        return value


class RecommendationResponse(BaseModel):
    design_type: str
    display_name: str
    engineering_reason: str
    decision_status: str
    fallback: bool
    warnings: List[str]
    next_actions: List[str]
    context_used: bool
    trace: Dict[str, Any]
    engine_version: str
    backbone_version: str
    generator_version: str
    log_record: Dict[str, Any]


app = FastAPI(title="DOE Expert Decision Engine", version=API_VERSION)
_rate_lock = threading.Lock()
_rate_buckets: Dict[str, List[float]] = {}


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def _error_response(request: Request, code: str, message: str, status_code: int) -> JSONResponse:
    response = JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "request_id": _request_id(request)}},
    )
    response.headers["X-Request-ID"] = _request_id(request)
    if status_code == 429:
        response.headers["Retry-After"] = str(RATE_LIMIT_WINDOW_SECONDS)
    return response


def _client_key(request: Request) -> str:
    # Deployments behind a trusted reverse proxy may set this to the proxy's
    # validated client address before forwarding the request. We do not trust
    # arbitrary X-Forwarded-For headers here.
    return request.client.host if request.client else "unknown"


def _allow_request(key: str) -> bool:
    now = time.monotonic()
    cutoff = now - RATE_LIMIT_WINDOW_SECONDS
    with _rate_lock:
        recent = [stamp for stamp in _rate_buckets.get(key, []) if stamp > cutoff]
        if len(recent) >= RATE_LIMIT_REQUESTS:
            _rate_buckets[key] = recent
            return False
        recent.append(now)
        _rate_buckets[key] = recent
        return True


def _allowed_origins() -> List[str]:
    raw = os.getenv("DOE_ALLOWED_ORIGINS", "")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@app.middleware("http")
async def request_guard(request: Request, call_next):
    request.state.request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    started = time.perf_counter()

    if request.method == "POST" and request.url.path == "/recommend-design":
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_BODY_BYTES:
            response = _error_response(request, "request_too_large", "Request body is too large.", 413)
        elif request.headers.get("content-type", "").split(";", 1)[0].lower() != "application/json":
            response = _error_response(request, "unsupported_content_type", "Content-Type must be application/json.", 415)
        elif not _allow_request(_client_key(request)):
            response = _error_response(request, "rate_limited", "Too many requests. Please retry later.", 429)
        else:
            response = None
        if response is not None:
            response.headers["X-Request-ID"] = _request_id(request)
            logger.info("request_id=%s method=%s path=%s status=%s duration_ms=%.1f", _request_id(request), request.method, request.url.path, response.status_code, (time.perf_counter() - started) * 1000)
            return response

    try:
        response = await call_next(request)
    except Exception:
        logger.exception("request_id=%s method=%s path=%s error=unhandled_exception", _request_id(request), request.method, request.url.path)
        response = _error_response(request, "internal_error", "The service could not process the request.", 500)
    response.headers["X-Request-ID"] = _request_id(request)
    logger.info("request_id=%s method=%s path=%s status=%s duration_ms=%.1f", _request_id(request), request.method, request.url.path, response.status_code, (time.perf_counter() - started) * 1000)
    return response


@app.middleware("http")
async def cors_policy(request: Request, call_next):
    response = await call_next(request)
    origin = request.headers.get("origin")
    if origin and origin in _allowed_origins():
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Request-ID"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return _error_response(request, "validation_error", "Request contains invalid or unsupported fields.", 422)


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException):
    messages = {404: "Resource not found.", 405: "Method not allowed."}
    return _error_response(request, f"http_{exc.status_code}", messages.get(exc.status_code, "Request could not be processed."), exc.status_code)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "doe-expert-engine", "version": API_VERSION}


@app.post("/recommend-design", response_model=RecommendationResponse)
def recommend_design_endpoint(request: RecommendationRequest) -> Dict[str, object]:
    return recommend_design(request.goal, request.num_factors, request.user_budget, request.context)
