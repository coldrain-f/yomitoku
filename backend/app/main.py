from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings

settings = get_settings()
app = FastAPI(
    title="Yomitoku API",
    version="0.1.0",
    description="Reading practice API and AI generation workflow.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "Idempotency-Key", "X-Dev-Role", "X-Dev-User-Id"],
)
app.include_router(api_router)
