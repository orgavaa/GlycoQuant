"""DINOv2-based deep feature extraction for cell crops.

The scikit-image features in the other modules of ``glycoquant.features``
are interpretable and publishable. DINOv2 embeddings complement them
with learned, high-dimensional representations of each cell's visual
phenotype — useful for unsupervised discovery (UMAP clustering,
perturbation similarity) at the cost of interpretability.

The embedder is **channel-flexible**: DINOv2 expects a 3-channel input,
and by default we stack DAPI + WGA-lectin + YAP as the three input
channels, which covers the nucleus, the glycocalyx, and the
mechanotransduction readout in a single learned representation. The
assignment is configurable via ``DinoV2Params.channel_assignment``.

Model: ``facebook/dinov2-base`` (86 M params, 768-dim CLS embedding,
Apache 2.0 license). First call downloads ~340 MB to the HuggingFace
cache; subsequent instantiations are offline. No fine-tuning is
required for the baseline GlycoQuant pipeline; an optional linear-probe
head trained on Human Protein Atlas glycocalyx proteins can be loaded
via ``finetuned_head_path`` for glycocalyx-specialized embeddings.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from skimage.measure import regionprops
from skimage.transform import resize

_DINOV2_EMBEDDING_DIM = 768


@dataclass(frozen=True)
class DinoV2Params:
    """Parameters for the DINOv2 embedder.

    Attributes
    ----------
    model_name : str
        HuggingFace model identifier. ``facebook/dinov2-base`` is the
        default (86 M params, 768-dim embedding).
    crop_size : int
        Side length of the square crop fed to DINOv2 after bounding-box
        extraction and resizing. 224 matches the standard ViT input.
    channel_assignment : tuple[str, str, str]
        Which three channels from the ``channels`` dict to stack as
        the RGB input. Default: ``("dapi", "glycocalyx", "yap")``.
    bbox_padding_px : int
        Extra pixels added around each cell's bounding box before
        cropping, to capture pericellular context.
    device : str
        Torch device. ``"cpu"`` is the default for laptop/demo use.
    """

    model_name: str = "facebook/dinov2-base"
    crop_size: int = 224
    channel_assignment: tuple[str, str, str] = field(
        default_factory=lambda: ("dapi", "glycocalyx", "yap")
    )
    bbox_padding_px: int = 8
    device: str = "cpu"


class DinoV2Embedder:
    """DINOv2 embedder for per-cell image crops.

    The model and HF processor are loaded lazily on first use so unit
    tests that only exercise the crop-building logic do not need to
    download 340 MB of weights. Once loaded, the model is cached on
    the instance for the lifetime of the object; wrap in
    ``st.cache_resource`` in the Streamlit app.
    """

    def __init__(
        self,
        params: DinoV2Params | None = None,
        finetuned_head_path: Path | None = None,
    ) -> None:
        self.params = params or DinoV2Params()
        self._model: Any = None
        self._processor: Any = None
        self._finetuned_head: Any = None
        self._finetuned_head_path = finetuned_head_path

    def embedding_dim(self) -> int:
        """Output dimensionality of ``embed_cell_crops``."""
        return _DINOV2_EMBEDDING_DIM

    def embed_image_with_masks(
        self,
        channels: dict[str, np.ndarray],
        cell_mask: np.ndarray,
    ) -> tuple[list[int], np.ndarray]:
        """Extract per-cell 3-channel crops and return their DINOv2 embeddings.

        Parameters
        ----------
        channels : dict[str, np.ndarray]
            Multi-channel image dict (same contract as
            ``ProfileAssembler.process_image``). Must contain at least
            the three channels named in ``params.channel_assignment``.
        cell_mask : np.ndarray
            Labeled integer mask, 0 = background, 1..N = cell IDs.

        Returns
        -------
        (cell_ids, embeddings) : tuple[list[int], np.ndarray]
            ``cell_ids`` is the sorted list of cell IDs for which a
            valid crop was produced; ``embeddings`` is an
            ``(n_cells, 768)`` ``float32`` array, rows aligned to
            ``cell_ids``.

        Raises
        ------
        ValueError
            If any required channel from ``channel_assignment`` is
            missing, or if channel shapes do not all match ``cell_mask``.
        """
        missing = [c for c in self.params.channel_assignment if c not in channels]
        if missing:
            raise ValueError(
                f"channels missing for DINOv2 assignment {self.params.channel_assignment}: {missing}"
            )
        for name in self.params.channel_assignment:
            if channels[name].shape != cell_mask.shape:
                raise ValueError(
                    f"channel '{name}' shape {channels[name].shape} "
                    f"!= cell_mask shape {cell_mask.shape}"
                )

        cell_ids = sorted(int(v) for v in np.unique(cell_mask).tolist() if v != 0)
        crops: list[np.ndarray] = []
        used_ids: list[int] = []
        for cell_id in cell_ids:
            crop = self._build_crop(channels, cell_mask, cell_id)
            if crop is not None:
                crops.append(crop)
                used_ids.append(cell_id)

        if not crops:
            return [], np.zeros((0, _DINOV2_EMBEDDING_DIM), dtype=np.float32)

        embeddings = self.embed_cell_crops(crops)
        return used_ids, embeddings

    def embed_cell_crops(self, crops: list[np.ndarray]) -> np.ndarray:
        """Embed a batch of pre-built ``(H, W, 3)`` crops via DINOv2.

        Parameters
        ----------
        crops : list[np.ndarray]
            Each array ``(crop_size, crop_size, 3)`` in ``[0, 1]``
            float or ``[0, 255]`` uint8.

        Returns
        -------
        np.ndarray
            ``(len(crops), 768)`` float32 CLS-token embeddings. Returns
            an empty ``(0, 768)`` array if ``crops`` is empty.
        """
        if not crops:
            return np.zeros((0, _DINOV2_EMBEDDING_DIM), dtype=np.float32)

        self._lazy_load()
        pil_crops = [Image.fromarray(_to_uint8_rgb(crop)) for crop in crops]

        import torch  # local import keeps module importable without torch at startup

        device = self.params.device
        with torch.no_grad():
            inputs = self._processor(images=pil_crops, return_tensors="pt")
            # Move every tensor in the BatchFeature onto the target device
            inputs = {
                k: (v.to(device) if hasattr(v, "to") else v) for k, v in inputs.items()
            }
            outputs = self._model(**inputs)
            # CLS token = position 0 of the last hidden state
            cls = outputs.last_hidden_state[:, 0, :]
            if self._finetuned_head is not None:
                cls = self._finetuned_head(cls)
            embeddings = cls.detach().cpu().numpy().astype(np.float32)

        return embeddings

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _lazy_load(self) -> None:
        """Load the DINOv2 model and processor on first use.

        Moves the frozen ViT onto the device specified in
        ``self.params.device`` (``"cpu"`` or ``"cuda"``) so every
        forward pass runs on the correct hardware.
        """
        if self._model is not None:
            return
        from transformers import AutoImageProcessor, AutoModel

        self._model = AutoModel.from_pretrained(self.params.model_name)
        self._model.eval()
        self._model = self._model.to(self.params.device)
        self._processor = AutoImageProcessor.from_pretrained(self.params.model_name)

        if self._finetuned_head_path is not None and self._finetuned_head_path.exists():
            import torch

            self._finetuned_head = torch.load(
                self._finetuned_head_path, map_location=self.params.device, weights_only=True
            )

    def _build_crop(
        self,
        channels: dict[str, np.ndarray],
        cell_mask: np.ndarray,
        cell_id: int,
    ) -> np.ndarray | None:
        """Extract a 3-channel ``(crop_size, crop_size, 3)`` crop for one cell.

        Returns ``None`` if the cell is absent from ``cell_mask``.
        """
        return build_cell_crop(
            channels, cell_mask, cell_id, self.params
        )


# ---------------------------------------------------------------------------
# Pure helpers (unit-testable without torch/transformers)
# ---------------------------------------------------------------------------


def build_cell_crop(
    channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    cell_id: int,
    params: DinoV2Params,
) -> np.ndarray | None:
    """Bounding-box crop + resize + 3-channel stack for a single cell.

    This is the pure-Python, torch-free crop builder. It is separated
    from ``DinoV2Embedder`` so unit tests can exercise the cropping
    logic without downloading the DINOv2 model.
    """
    this_cell = (cell_mask == cell_id).astype(np.uint8)
    if not this_cell.any():
        return None

    props = regionprops(this_cell)
    if not props:
        return None
    minr, minc, maxr, maxc = props[0].bbox
    pad = params.bbox_padding_px
    minr = max(0, minr - pad)
    minc = max(0, minc - pad)
    maxr = min(cell_mask.shape[0], maxr + pad)
    maxc = min(cell_mask.shape[1], maxc + pad)

    channel_crops: list[np.ndarray] = []
    for ch_name in params.channel_assignment:
        ch = channels[ch_name][minr:maxr, minc:maxc].astype(np.float32)
        ch_max = float(ch.max()) if ch.size else 0.0
        if ch_max > 0.0:
            ch = ch / ch_max
        resized = resize(
            ch,
            (params.crop_size, params.crop_size),
            preserve_range=True,
            anti_aliasing=True,
        ).astype(np.float32)
        channel_crops.append(resized)

    return np.stack(channel_crops, axis=-1)


def _to_uint8_rgb(crop: np.ndarray) -> np.ndarray:
    """Coerce a ``(H, W, 3)`` float [0, 1] or uint8 crop to uint8 RGB."""
    if crop.dtype == np.uint8:
        return crop
    return (np.clip(crop, 0.0, 1.0) * 255.0).astype(np.uint8)
