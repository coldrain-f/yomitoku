from fastapi import APIRouter

from app.api.routes import admin, health, readings

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(readings.router)
api_router.include_router(admin.router)
