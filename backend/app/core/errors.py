from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any, Final

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

ERROR_CODE_BY_STATUS: Final[dict[int, str]] = {
    status.HTTP_400_BAD_REQUEST: "INVALID_REQUEST",
    status.HTTP_401_UNAUTHORIZED: "AUTHENTICATION_REQUIRED",
    status.HTTP_403_FORBIDDEN: "PERMISSION_DENIED",
    status.HTTP_404_NOT_FOUND: "RESOURCE_NOT_FOUND",
    status.HTTP_409_CONFLICT: "CONFLICT",
    status.HTTP_422_UNPROCESSABLE_CONTENT: "VALIDATION_ERROR",
    status.HTTP_429_TOO_MANY_REQUESTS: "RATE_LIMITED",
    status.HTTP_503_SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
}
DEFAULT_ERROR_CODE: Final = "REQUEST_FAILED"
INTERNAL_ERROR_CODE: Final = "INTERNAL_ERROR"


def error_code_for(status_code: int, detail: Any) -> str:
    if isinstance(detail, Mapping):
        code = detail.get("code")
        if isinstance(code, str) and code:
            return code
    return ERROR_CODE_BY_STATUS.get(status_code, DEFAULT_ERROR_CODE)


def error_response(status_code: int, detail: Any, headers: Mapping[str, str] | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"code": error_code_for(status_code, detail)},
        headers=headers,
    )


async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return error_response(exc.status_code, exc.detail, exc.headers)


async def validation_exception_handler(
    _: Request,
    __: RequestValidationError,
) -> JSONResponse:
    return error_response(status.HTTP_422_UNPROCESSABLE_CONTENT, None)


async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled API error", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"code": INTERNAL_ERROR_CODE},
    )
