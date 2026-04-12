# GlycoQuant backend — FastAPI + Cellpose-SAM + Cell-DINO
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
# Cell-DINO checkpoint: the channel-adaptive ViT-L/16 weights (~1.2 GB)
# are downloaded at build time if CELL_DINO_CKPT_URL is provided. The
# URL is the time-limited HTTPS link from the FAIR email. If not set,
# the pipeline falls back to DINOv2-base at runtime.
#
#   docker build -t glycoquant-api \
#       --build-arg CELL_DINO_CKPT_URL="https://cell-dino.llamameta.net/..." \
#       -f backend/Dockerfile .
#
# On Railway: add CELL_DINO_CKPT_URL as a Build Arg and
# GLYCOQUANT_CELL_DINO_CKPT=/app/models/channel_adaptive_dino_vitl16.pth
# as a runtime env var.

FROM python:3.11-slim-bookworm

ARG TORCH_VARIANT=cpu
ARG CELL_DINO_CKPT_URL=""

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

# Copy the dinov2 submodule so torch.hub.load(source='local') finds
# the channel_adaptive_dino_vitl16 entry point at runtime.
COPY third_party/dinov2 ./third_party/dinov2

# Install PyTorch with the requested variant BEFORE the editable install,
# so the later `pip install -e .` does not downgrade / overwrite it.
# CUDA variant targets CUDA 12.1, which matches Railway's current GPU
# runtime images (works on T4, L4, A10, A100).
# Cell-DINO deps (fvcore, iopath, omegaconf) are included via the
# [cell_dino] optional dependency group.
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
    pip install --prefer-binary -e ".[cell_dino]"

# Download Cell-DINO checkpoint at build time if the URL is provided.
# The FAIR-emailed URLs are time-limited — pass as a build arg, not an
# env var, so it's consumed during build and not leaked into the image
# metadata. If empty, the pipeline falls back to DINOv2-base at runtime.
RUN mkdir -p /app/models && \
    if [ -n "$CELL_DINO_CKPT_URL" ]; then \
        echo "[build] downloading Cell-DINO checkpoint (~1.2 GB)..." && \
        curl -L -o /app/models/channel_adaptive_dino_vitl16.pth "$CELL_DINO_CKPT_URL" && \
        echo "[build] checkpoint saved ($(du -h /app/models/channel_adaptive_dino_vitl16.pth | cut -f1))" ; \
    else \
        echo "[build] no CELL_DINO_CKPT_URL provided; Cell-DINO will fall back to DINOv2-base" ; \
    fi

# Set the runtime env var so the worker picks up the checkpoint
# automatically. If the file doesn't exist (URL wasn't provided),
# the worker falls back to DINOv2-base gracefully.
ENV GLYCOQUANT_CELL_DINO_CKPT=/app/models/channel_adaptive_dino_vitl16.pth

EXPOSE 8000

# Railway sets $PORT; default to 8000 for local docker runs
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
