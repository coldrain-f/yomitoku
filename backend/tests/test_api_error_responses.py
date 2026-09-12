from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient

from app.core.errors import (
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)


def create_app() -> FastAPI:
    app = FastAPI()
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    @app.get("/missing")
    async def missing() -> None:
        raise HTTPException(status_code=404, detail="Internal lookup detail")

    @app.get("/validation")
    async def validation(value: int) -> dict[str, int]:
        return {"value": value}

    @app.get("/failed")
    async def failed() -> None:
        raise RuntimeError("Internal stack detail")

    return app


def test_http_errors_return_stable_code_without_detail() -> None:
    response = TestClient(create_app()).get("/missing")

    assert response.status_code == 404
    assert response.json() == {"code": "RESOURCE_NOT_FOUND"}


def test_request_validation_returns_stable_code_without_field_messages() -> None:
    response = TestClient(create_app()).get("/validation", params={"value": "text"})

    assert response.status_code == 422
    assert response.json() == {"code": "VALIDATION_ERROR"}


def test_unhandled_errors_do_not_expose_internal_detail() -> None:
    response = TestClient(create_app(), raise_server_exceptions=False).get("/failed")

    assert response.status_code == 500
    assert response.json() == {"code": "INTERNAL_ERROR"}
