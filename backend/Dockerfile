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
# Cell-DINO checkpoint: place the channel-adaptive ViT-L/16 weights
# (~1.2 GB) at models/channel_adaptive_dino_vitl16.pth in the repo
# root BEFORE building. The Dockerfile copies it into the image.
# If the file is absent, the pipeline falls back to DINOv2-base.
#
# To get the checkpoint:
#   1. Accept the FAIR form at https://ai.meta.com/resources/models-and-libraries/cell-dino-downloads/
#   2. Download channel_adaptive_dino_vitl16_pretrain_cells-ef7c17ff.pth
#   3. Place at models/channel_adaptive_dino_vitl16.pth

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

# Copy the Cell-DINO checkpoint if it exists in the repo.
# The file is 1.2 GB and gitignored — place it at
# models/channel_adaptive_dino_vitl16.pth before building.
# If absent, the COPY uses a wildcard so the build doesn't fail.
COPY model[s]/channel_adaptive_dino_vitl16.pt[h] /app/models/

# Set the runtime env var. If the file wasn't copied (didn't exist
# at build time), the worker falls back to DINOv2-base gracefully.
ENV GLYCOQUANT_CELL_DINO_CKPT=/app/models/channel_adaptive_dino_vitl16.pth

EXPOSE 8000

# Railway sets $PORT; default to 8000 for local docker runs
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
