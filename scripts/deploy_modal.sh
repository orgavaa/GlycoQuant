#!/usr/bin/env bash
# Deploy the GlycoQuant GPU pipeline to Modal.
#
# Prerequisites:
#   pip install modal
#   modal token new        # one-time browser auth, writes ~/.modal.toml
#
# After a successful deploy, set the following env vars on the Railway
# backend service so FastAPI can call the remote function:
#
#   GLYCOQUANT_GPU_PROVIDER=modal
#   MODAL_TOKEN_ID=<from ~/.modal.toml>
#   MODAL_TOKEN_SECRET=<from ~/.modal.toml>
#
set -euo pipefail

cd "$(dirname "$0")/.."

modal deploy backend/modal_app.py
