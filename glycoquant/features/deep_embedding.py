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

    def column_names(self) -> list[str]:
        """Per-feature column names for the assembler DataFrame.

        Generic ``deep_NNN`` since DINOv2-base has no per-channel
        decomposition — the 768-D embedding is over a synthetic 3-channel
        stack picked by ``params.channel_assignment``.
        """
        return [f"deep_{i:03d}" for i in range(_DINOV2_EMBEDDING_DIM)]

    def backend_name(self) -> str:
        """Stable string identifier for the JobResult provenance field."""
        return "dinov2_base"

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


# ---------------------------------------------------------------------------
# Cell-DINO channel-adaptive embedder
# ---------------------------------------------------------------------------
#
# Cell-DINO (Meta FAIR, in review at PLOS Comp Biol 2025) is a DINOv2
# variant pretrained directly on cell fluorescence microscopy. The
# ``channel_adaptive_dino_vitl16`` checkpoint is a ViT-L/16 backbone that
# accepts arbitrary channel counts at inference: internally, the
# ``get_intermediate_layers()`` path reshapes ``(B, C, H, W)`` to
# ``(B*C, 1, H, W)`` so each channel is processed as a 1-channel grayscale
# crop, then re-aggregates the per-channel CLS tokens back into a
# ``(B, C*embed_dim)`` block per cell. For our 5-channel panel that's
# ``(B, 5*1024 = 5120)``, with the channel order preserved exactly as the
# user supplies it.
#
# Critical API detail: ``model.forward(x)`` does NOT do the per-channel
# split — only ``model.get_intermediate_layers(x, n=N, return_class_token=
# True)`` triggers the channel-adaptive branch. We exploit that explicitly.
#
# License: code CC-BY-NC, weights FAIR Non-Commercial Research License.
# Suitable for research use only. The checkpoint is gated behind a Meta
# form at https://ai.meta.com/resources/models-and-libraries/cell-dino-downloads/
# and must be downloaded manually before this embedder will load.

# ViT-L embedding dim per channel; total output is 5 * this for our panel.
_CELL_DINO_PER_CHANNEL_DIM = 1024
_CELL_DINO_INPUT_SIZE = 224

# Canonical channel ordering for the (5, H, W) per-cell tensor. Must match
# CANONICAL_CHANNELS in glycoquant.profiles.assembler so the column names
# below align with the actual physical channels in the input image.
_CELL_DINO_CHANNEL_ORDER: tuple[str, ...] = (
    "dapi",
    "glycocalyx",
    "yap",
    "paxillin",
    "actin",
)

# ImageNet normalization mean/std (one value per RGB channel). Cell-DINO's
# eval pipeline applies these to each grayscale channel after min-max
# scaling, treating the channel as a single greyscale plane. We pick the
# luminance-style first values for each.
_IMAGENET_MEAN_GREY = 0.485
_IMAGENET_STD_GREY = 0.229


@dataclass(frozen=True)
class ChannelAdaptiveDinoParams:
    """Parameters for the Cell-DINO channel-adaptive embedder.

    Attributes
    ----------
    crop_size : int
        Side length of the per-channel crop fed to the model. Cell-DINO
        ViT-L/16 was trained at 224, so this defaults to 224.
    bbox_padding_px : int
        Pixels of pericellular padding around each cell's bbox before
        cropping — same convention as ``DinoV2Params``.
    channel_order : tuple[str, ...]
        Names of the channels stacked along the C axis of the input
        tensor, in this exact order. Must match the assembler's
        canonical channel order. Default
        ``("dapi", "glycocalyx", "yap", "paxillin", "actin")``.
    device : str
        Torch device, e.g. ``"cpu"`` or ``"cuda"``.
    checkpoint_path : str | None
        Filesystem path to the downloaded ``.pth`` checkpoint
        (FAIR-emailed after the form is accepted). When ``None``,
        instantiation raises with the FAIR access URL.
    repo_dir : str | None
        Path to the local clone of the dinov2 repo. Defaults to
        ``<repo_root>/third_party/dinov2``.
    """

    crop_size: int = _CELL_DINO_INPUT_SIZE
    bbox_padding_px: int = 8
    channel_order: tuple[str, ...] = field(
        default_factory=lambda: _CELL_DINO_CHANNEL_ORDER
    )
    device: str = "cpu"
    checkpoint_path: str | None = None
    repo_dir: str | None = None


class ChannelAdaptiveDinoEmbedder:
    """Cell-DINO channel-adaptive ViT-L/16 embedder for per-cell crops.

    Outputs a per-cell vector of length ``len(channel_order) * 1024``
    where each contiguous 1024-D block corresponds to one input channel
    (in ``channel_order``). For the canonical 5-channel panel that's a
    5120-D vector with layout::

        [dapi(1024) | glycocalyx(1024) | yap(1024) | paxillin(1024) | actin(1024)]

    The model is loaded lazily on first use via ``torch.hub.load`` from
    a local clone of the dinov2 repository (``third_party/dinov2``).
    The 304 M weights load once per process and stay cached.
    """

    def __init__(self, params: ChannelAdaptiveDinoParams | None = None) -> None:
        self.params = params or ChannelAdaptiveDinoParams()
        if self.params.checkpoint_path is None:
            raise ValueError(
                "ChannelAdaptiveDinoEmbedder requires a Cell-DINO checkpoint. "
                "Set GLYCOQUANT_CELL_DINO_CKPT to the path of a .pth file "
                "downloaded after accepting the FAIR Non-Commercial Research "
                "License at https://ai.meta.com/resources/models-and-libraries/cell-dino-downloads/"
            )
        self._model: Any = None

    def embedding_dim(self) -> int:
        """Total per-cell embedding length: ``num_channels * 1024``."""
        return len(self.params.channel_order) * _CELL_DINO_PER_CHANNEL_DIM

    def column_names(self) -> list[str]:
        """Per-channel column names so the assembler keeps stain identity.

        Layout: ``deep_<channel>_NNN`` for ``NNN`` in ``[000, 1023]``,
        one block per channel in ``params.channel_order``. The block
        order in the column list mirrors the C-axis order of the input
        tensor exactly.
        """
        names: list[str] = []
        for ch in self.params.channel_order:
            for i in range(_CELL_DINO_PER_CHANNEL_DIM):
                names.append(f"deep_{ch}_{i:04d}")
        return names

    def backend_name(self) -> str:
        """Stable string identifier for the JobResult provenance field."""
        return "cell_dino_channel_adaptive"

    def embed_image_with_masks(
        self,
        channels: dict[str, np.ndarray],
        cell_mask: np.ndarray,
    ) -> tuple[list[int], np.ndarray]:
        """Build (n_cells, num_channels, H, W) crops and run Cell-DINO.

        Parameters
        ----------
        channels : dict[str, np.ndarray]
            Multi-channel image dict; must contain every name in
            ``params.channel_order``.
        cell_mask : np.ndarray
            Labeled integer mask, ``0`` = background, ``1..N`` = cell IDs.

        Returns
        -------
        (cell_ids, embeddings) : tuple[list[int], np.ndarray]
            ``embeddings`` shape ``(n_cells, num_channels * 1024)`` float32.
        """
        missing = [c for c in self.params.channel_order if c not in channels]
        if missing:
            raise ValueError(
                f"channels missing for Cell-DINO panel {self.params.channel_order}: {missing}"
            )
        for name in self.params.channel_order:
            if channels[name].shape != cell_mask.shape:
                raise ValueError(
                    f"channel '{name}' shape {channels[name].shape} "
                    f"!= cell_mask shape {cell_mask.shape}"
                )

        cell_ids = sorted(int(v) for v in np.unique(cell_mask).tolist() if v != 0)
        crops: list[np.ndarray] = []
        used_ids: list[int] = []
        for cell_id in cell_ids:
            crop = build_cell_crop_multichannel(
                channels, cell_mask, cell_id, self.params
            )
            if crop is not None:
                crops.append(crop)
                used_ids.append(cell_id)

        if not crops:
            return [], np.zeros((0, self.embedding_dim()), dtype=np.float32)

        embeddings = self._embed_batch(np.stack(crops, axis=0))
        return used_ids, embeddings

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _embed_batch(self, crops: np.ndarray) -> np.ndarray:
        """Run Cell-DINO on a ``(B, C, H, W)`` batch of per-cell crops.

        The channel-adaptive ViT requires the
        ``get_intermediate_layers(x, n=1, return_class_token=True)``
        entry point — the plain ``forward()`` does NOT trigger the
        per-channel batch reshape and would fail because the model is
        built with ``in_chans=1``.
        """
        self._lazy_load()
        import torch  # local — keep module importable without torch at startup

        device = self.params.device
        with torch.no_grad():
            x = torch.from_numpy(crops).to(device).float()
            # ImageNet normalization, applied per channel as a single
            # luminance-style affine. Cell-DINO eval uses the same.
            x = (x - _IMAGENET_MEAN_GREY) / _IMAGENET_STD_GREY

            # ChannelAdaptive entry point. n=1 returns the last block
            # only; the result is a tuple of length 1, with each element
            # being (patch_tokens, cls_token). With bag_of_channels=True,
            # cls_token has already been reshape(B, C*D) by the model
            # so its shape is (B, num_channels * 1024).
            outputs = self._model.get_intermediate_layers(
                x, n=1, return_class_token=True
            )
            _patch_tokens, cls_tokens = outputs[0]
            embeddings = cls_tokens.detach().cpu().numpy().astype(np.float32)

        expected_dim = self.embedding_dim()
        if embeddings.shape[1] != expected_dim:
            raise RuntimeError(
                f"Cell-DINO returned embedding dim {embeddings.shape[1]}; "
                f"expected {expected_dim} = "
                f"{len(self.params.channel_order)} channels × {_CELL_DINO_PER_CHANNEL_DIM}"
            )
        return embeddings

    def _lazy_load(self) -> None:
        """Load the Cell-DINO checkpoint via torch.hub on first use."""
        if self._model is not None:
            return
        import torch

        repo_dir = self.params.repo_dir or str(
            Path(__file__).resolve().parents[2] / "third_party" / "dinov2"
        )
        if not Path(repo_dir).is_dir():
            raise RuntimeError(
                f"dinov2 submodule not found at {repo_dir}. Run "
                "'git submodule update --init --recursive' first."
            )
        self._model = torch.hub.load(
            repo_dir,
            "channel_adaptive_dino_vitl16",
            source="local",
            pretrained_path=self.params.checkpoint_path,
        )
        self._model.eval()
        self._model = self._model.to(self.params.device)


def build_cell_crop_multichannel(
    channels: dict[str, np.ndarray],
    cell_mask: np.ndarray,
    cell_id: int,
    params: ChannelAdaptiveDinoParams,
) -> np.ndarray | None:
    """Bounding-box crop + resize + N-channel stack as ``(C, H, W)``.

    Sibling of ``build_cell_crop`` for the channel-adaptive embedder.
    Differences from the 3-channel DinoV2 version:
        - Output is ``(C, H, W)`` (channel-first) not ``(H, W, 3)``
        - C is the length of ``params.channel_order``, not fixed at 3
        - Each channel is min-max normalized to [0, 1] independently;
          ImageNet normalization is applied later, in ``_embed_batch``,
          so this helper stays torch-free and unit-testable.
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
    for ch_name in params.channel_order:
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

    return np.stack(channel_crops, axis=0)  # (C, H, W)
