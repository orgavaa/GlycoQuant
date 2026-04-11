"""GlycoQuant FastAPI backend — exposes the glycoquant library over HTTP.

Two routers:
- ``analysis`` — upload-and-analyze jobs with async polling
- ``priors``   — Tab 2 dual-prior ranking data
- ``demo``     — bundled demo image metadata

The heavy Cellpose / DINOv2 inference runs in a background worker via
FastAPI ``BackgroundTasks``; the HTTP API returns a ``job_id`` immediately
and the frontend polls ``GET /jobs/{id}`` every 2 s for progress.
"""
__version__ = "0.3.0"
