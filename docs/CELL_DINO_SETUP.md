# Cell-DINO setup

GlycoQuant ships with two deep-embedding backbones for the optional
"Compute deep embeddings" toggle on Tab 1:

| Backbone | Source | License | Default? |
|---|---|---|---|
| `facebook/dinov2-base` | Hugging Face | Apache 2.0 | yes |
| Cell-DINO `channel_adaptive_dino_vitl16` | Meta FAIR (in review at PLOS Comp Biol 2025) | **CC-BY-NC code, FAIR Non-Commercial Research License weights** | no — opt in |

The natural-image DINOv2 path is the default and works out of the box
in CI. Cell-DINO is the **right** scientific choice for a 5-channel
fluorescence panel — it was pretrained directly on cell microscopy
and processes all 5 channels natively (per-channel ViT inference, then
re-aggregated to a 5×1024 = 5120-D per-cell vector with stain identity
preserved). It's gated behind a Meta form, so it requires a one-time
operator setup before the worker can pick it up.

## What you need to do (one-time)

### 1. Accept the FAIR Non-Commercial Research License

Go to <https://ai.meta.com/resources/models-and-libraries/cell-dino-downloads/>
and submit the form. Meta emails a list of HTTPS download URLs after
acceptance, **typically within minutes**. The links are time-limited
(treat them as one-shot — download once, store the file locally).

You want the **channel-adaptive ViT-L/16** checkpoint — the email
will list four variants:

- `cell_dino_hpa_vitl16` — HPA-trained, **fixed 4-channel input**, skip
- `cell_dino_hpa_vitl14` — HPA-trained, ViT-L/14, fixed 4-channel, skip
- `cell_dino_cp_vits8` — Cell Painting, smaller, fixed 5-channel, skip
- **`channel_adaptive_dino_vitl16`** — what GlycoQuant integrates ✓

> **License reminder**: the weights are **non-commercial research only**.
> Suitable for a PhD project, methods chapter, internal lab demo, or
> any academic publication. **Not** suitable for clinical use, paid
> SaaS, or commercial product deployment.

### 2. Initialise the dinov2 git submodule

The `channel_adaptive_dino_vitl16` entry point lives inside the
upstream `facebookresearch/dinov2` repository, which GlycoQuant tracks
as a git submodule under `third_party/dinov2`:

```bash
git submodule update --init --recursive
```

After this, `third_party/dinov2/dinov2/hub/cell_dino/backbones.py`
should exist on disk. The submodule is read-only — never edit files
inside it.

### 3. Install the optional Cell-DINO dependencies

The dinov2 runtime needs three small extras (`fvcore`, `iopath`,
`omegaconf`) that aren't pulled in by the default GlycoQuant install:

```bash
pip install -e ".[cell_dino]"
```

Torch and transformers are already in the base `dependencies` block
(they're required by the natural-image DINOv2 path and by Cellpose),
so no version bumps are needed.

### 4. Point the worker at the checkpoint

Set the env var `GLYCOQUANT_CELL_DINO_CKPT` to the absolute path of
the `.pth` file you downloaded. The backend's `_get_embedder()`
dispatches on this — if the path exists, Cell-DINO loads; otherwise
it falls back to `facebook/dinov2-base`:

```bash
# Local dev (uvicorn)
export GLYCOQUANT_CELL_DINO_CKPT=/path/to/channel_adaptive_dino_vitl16.pth
.venv/Scripts/python.exe -m uvicorn backend.app.main:app --reload

# Railway / production
railway variables set GLYCOQUANT_CELL_DINO_CKPT=/cache/cell_dino/channel_adaptive_dino_vitl16.pth
```

Restart the server after setting the variable. On the next analysis
run with "Compute deep embeddings" toggled on, the worker logs:

```
[worker] initialising ChannelAdaptiveDinoEmbedder (Cell-DINO ViT-L/16) from /path/to/...
```

If you see `[worker] initialising DinoV2Embedder` instead, the env
var isn't set or the file doesn't exist — check `printenv` and `ls`.

### 5. (Modal GPU only) Upload to the persistent volume

For Railway Pro / Modal GPU bursts, the checkpoint needs to live on
the `glycoquant-models` persistent volume so cold starts don't
re-download anything. From a developer machine that already has
`modal` installed:

```bash
modal volume put glycoquant-models \
    /local/path/channel_adaptive_dino_vitl16.pth \
    /cell_dino/channel_adaptive_dino_vitl16.pth
```

Then uncomment the `GLYCOQUANT_CELL_DINO_CKPT` line in
`backend/modal_app.py`'s `image.env()` block (it points at
`/cache/cell_dino/channel_adaptive_dino_vitl16.pth` since the volume
is mounted at `/cache`), and re-deploy:

```bash
modal deploy backend/modal_app.py
```

The volume cost is ~$0.30/month for the 304 M weights. Negligible.

## Verification

After setup, a Tab 1 analysis with "Compute deep embeddings" on
should:

1. Backend log shows `[worker] initialising ChannelAdaptiveDinoEmbedder`
2. The per-cell DataFrame has 5120 deep columns named
   `deep_dapi_0000` … `deep_actin_1023`
3. `JobResult.deep_embedding_backend == "cell_dino_channel_adaptive"`
4. The Methods & QC card on Tab 1 reads:
   ```
   Deep embedding backbone: Cell-DINO ViT-L/16 (channel-adaptive)
   5×1024 = 5120 dim per cell · FAIR Non-Commercial Research License
   ```

If any of those are wrong, see `tests/test_channel_adaptive_dino.py`
for an isolated reproducer.

## What lives where

| File | Role |
|---|---|
| `third_party/dinov2/dinov2/hub/cell_dino/backbones.py` | upstream Cell-DINO entry points (CC-BY-NC code) |
| `third_party/dinov2/dinov2/models/vision_transformer.py` | the channel-adaptive `get_intermediate_layers` path that does the per-channel reshape |
| `glycoquant/features/deep_embedding.py` | `ChannelAdaptiveDinoEmbedder` class — wraps the upstream model behind the same `embed_image_with_masks` interface as `DinoV2Embedder` |
| `backend/app/workers.py::_get_embedder` | env-var dispatch — picks Cell-DINO when the checkpoint path exists |
| `backend/app/schemas.py` | `JobResult.deep_embedding_backend` field |
| `frontend/src/features/imaging/views/MethodsQCView.tsx` | surfaces the active backbone in the provenance card |
| `tests/test_channel_adaptive_dino.py` | env-var-gated tests; auto-skip when the checkpoint isn't provisioned |

## Why per-cell vector is 5120-D, not 1024

`channel_adaptive_dino_vitl16` is a ViT-L/16 (`embed_dim = 1024`) built
with `in_chans = 1`. Internally, when you call
`model.get_intermediate_layers(x, n=1, return_class_token=True)` on a
`(B, C, H, W)` tensor, the model reshapes it to `(B*C, 1, H, W)`,
runs each channel through the backbone independently, then reshapes
the per-channel CLS tokens back to `(B, C * 1024)`. For our 5-channel
panel that's `(B, 5120)`, with the channel order in the column layout
matching the input C-axis order:

```
[deep_dapi_0000..1023 | deep_glycocalyx_0000..1023 | deep_yap_0000..1023 |
 deep_paxillin_0000..1023 | deep_actin_0000..1023]
```

This is a deliberate design choice: stain identity is preserved in
the column names, so a downstream linear classifier can attend to
specific channel blocks. If you want a single 1024-D vector instead,
mean-pool across the channel blocks in your downstream code; the
embedder doesn't aggregate for you because aggregation throws away
the per-stain signal.

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---|---|---|
| Backend logs `initialising DinoV2Embedder` even after setting env var | The env var path doesn't point at an existing file, OR the variable wasn't visible to the uvicorn process | `ls $GLYCOQUANT_CELL_DINO_CKPT`; restart uvicorn after `export` |
| `RuntimeError: dinov2 submodule not found` | The `third_party/dinov2` directory is empty | `git submodule update --init --recursive` |
| `ModuleNotFoundError: No module named 'fvcore'` | Optional deps not installed | `pip install -e ".[cell_dino]"` |
| `state_dict mismatch` on `model.load_state_dict(strict=True)` | Wrong checkpoint variant — you downloaded `cell_dino_hpa_vitl16` instead of `channel_adaptive_dino_vitl16` | Re-request the channel-adaptive checkpoint via the FAIR form |
| 410 Gone when downloading from the FAIR-emailed URL | The link is time-limited; you waited too long | Re-submit the form to get a fresh email |
| Cell crops produce all-NaN embeddings | The `glycoquant.features.build_cell_crop_multichannel` didn't see any non-zero pixels in one of the channels | Check that all 5 channels in your input have signal — if YAP is dark, the per-channel min-max normalization divides by zero. The current code handles this by passing zeros through; if the model outputs NaN, it's a model-side numerical issue worth raising upstream. |

## Reference

- Cell-DINO repo: <https://github.com/facebookresearch/dinov2/blob/main/docs/README_CELL_DINO.md>
- Channel-adaptive entry point: `third_party/dinov2/dinov2/hub/cell_dino/backbones.py::channel_adaptive_dino_vitl16`
- Internal channel-batch reshape: `third_party/dinov2/dinov2/models/vision_transformer.py` lines 310–342, the `bag_of_channels` branch in `get_intermediate_layers`
- License: `third_party/dinov2/LICENSE_CELL_DINO_CODE` (CC-BY-NC code), `LICENSE_CELL_DINO_MODELS` (FAIR Non-Commercial Research License weights)
