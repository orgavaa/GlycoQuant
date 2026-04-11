"""GlycoQuant FastAPI entry point."""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app import __version__
from backend.app.routers import analysis, demo, priors

# Frontend origin(s) allowed to call the API. Set via env var in
# production; defaults permit local Vite dev + Railway production.
DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",  # Vite dev server
    "http://localhost:4173",  # Vite preview
    "http://localhost:3000",  # alt local port
]


def _resolve_cors_origins() -> list[str]:
    env = os.environ.get("CORS_ORIGINS", "").strip()
    if not env:
        return DEFAULT_CORS_ORIGINS
    origins = [o.strip() for o in env.split(",") if o.strip()]
    return origins or DEFAULT_CORS_ORIGINS


app = FastAPI(
    title="GlycoQuant API",
    description=(
        "REST API for the GlycoQuant glycocalyx mechanotransduction "
        "analysis platform. Segments fluorescence microscopy images, "
        "extracts 26 interpretable per-cell features + optional DINOv2 "
        "embeddings, and serves the Tab 2 dual-prior ranking data."
    ),
    version=__version__,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolve_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis.router)
app.include_router(priors.router)
app.include_router(demo.router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    """Liveness endpoint for Railway healthcheck.

    Also reports the active compute device so a GPU-tier deployment
    can be verified from ``curl .../health`` without opening a shell.
    """
    from glycoquant.compute import describe_device, resolve_device

    return {
        "status": "ok",
        "version": __version__,
        "device": resolve_device(),
        "device_detail": describe_device(),
    }


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {
        "service": "glycoquant-api",
        "version": __version__,
        "docs": "/docs",
        "openapi": "/openapi.json",
    }
