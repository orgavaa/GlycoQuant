# GlycoQuant backend — FastAPI + Cellpose + DINOv2
FROM python:3.11-slim-bookworm

# System deps for scikit-image / opencv / PyTorch CPU
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      libglib2.0-0 \
      libsm6 \
      libxext6 \
      libxrender1 \
      libgl1 \
      curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/app/.cache/huggingface \
    CELLPOSE_LOCAL_MODELS_PATH=/app/.cache/cellpose

WORKDIR /app

# Copy only metadata first for better layer caching
COPY pyproject.toml README.md ./
COPY glycoquant ./glycoquant
COPY backend ./backend
COPY data ./data
COPY configs ./configs

# Install runtime deps (matches pyproject.toml core + fastapi)
RUN pip install --upgrade pip && \
    pip install --prefer-binary -e .

EXPOSE 8000

# Railway sets $PORT; default to 8000 for local docker runs
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
