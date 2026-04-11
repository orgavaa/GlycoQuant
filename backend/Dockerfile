# GlycoQuant backend — FastAPI + Cellpose-SAM + DINOv2
#
# Supports both CPU and GPU deployments via a single build argument:
#
#   CPU (default, local dev, Hobby-tier Railway):
#       docker build -t glycoquant-api -f backend/Dockerfile .
#
#   GPU (Railway Pro with NVIDIA L4/T4/A10):
#       docker build -t glycoquant-api \
#           --build-arg TORCH_VARIANT=cuda \
#           -f backend/Dockerfile .
#
# On the Railway api service set the build arg under Settings → Build →
# Build Args:  TORCH_VARIANT=cuda
# and set the runtime env var GLYCOQUANT_DEVICE=cuda so the pipeline
# actually routes tensors to the GPU.

FROM python:3.11-slim-bookworm

ARG TORCH_VARIANT=cpu

# System deps for scikit-image / opencv / PyTorch
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      libglib2.0-0 \
      libsm6 \
      libxext6 \
      libxrender1 \
      libgl1 \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/app/.cache/huggingface \
    CELLPOSE_LOCAL_MODELS_PATH=/app/.cache/cellpose \
    GLYCOQUANT_DEVICE=auto

WORKDIR /app

# Copy metadata first for better layer caching
COPY pyproject.toml README.md ./
COPY glycoquant ./glycoquant
COPY backend ./backend
COPY data ./data
COPY configs ./configs

# Install PyTorch with the requested variant BEFORE the editable install,
# so the later `pip install -e .` does not downgrade / overwrite it.
# CUDA variant targets CUDA 12.1, which matches Railway's current GPU
# runtime images (works on T4, L4, A10, A100).
RUN pip install --upgrade pip && \
    if [ "$TORCH_VARIANT" = "cuda" ]; then \
        echo "[build] installing CUDA PyTorch" && \
        pip install --prefer-binary torch torchvision \
            --index-url https://download.pytorch.org/whl/cu121 ; \
    else \
        echo "[build] installing CPU PyTorch" && \
        pip install --prefer-binary torch torchvision \
            --index-url https://download.pytorch.org/whl/cpu ; \
    fi && \
    pip install --prefer-binary -e .

EXPOSE 8000

# Railway sets $PORT; default to 8000 for local docker runs
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
