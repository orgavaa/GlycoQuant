"""Per-cell profile assembly over a multi-channel image.

``ProfileAssembler`` is the backbone of Tab 1: it takes a dict of
raw channel arrays (DAPI / glycocalyx / YAP / paxillin / actin),
optionally runs Cellpose-SAM for segmentation, and loops over each
detected cell to assemble a flat pandas ``DataFrame`` from the
per-cell feature extractors in ``glycoquant.features``.

The assembler is deliberately Streamlit-agnostic — the Tab 1 UI
imports and calls it, but this module has no Streamlit dependency
and is fully unit-testable against the synthetic fixtures without
ever loading Cellpose weights.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from glycoquant.features import (
    ActinParams,
    DinoV2Embedder,
    DinoV2Params,
    FocalAdhesionParams,
    GlycocalyxParams,
    extract_actin_features,
    extract_fa_features,
    extract_glycocalyx_features,
    extract_morphology_features,
    extract_nuclear_morphology_features,
    extract_yap_features,
)
from glycoquant.preprocessing import (
    DEFAULT_BACKGROUND_RADIUS_PX,
    DEFAULT_BACKGROUND_RADIUS_UM,
    subtract_background,
)
from glycoquant.profiles.mechano_score import (
    MechanoScoreSummary,
    apply_population_post_processing,
)
from glycoquant.segmentation import CellSegmenter

# Canonical channel names accepted by ``process_image``. The assembler
# only runs an extractor if its channel is present, so callers can
# pass any subset.
CANONICAL_CHANNELS = ("dapi", "glycocalyx", "yap", "paxillin", "actin")


@dataclass
class AssemblerConfig:
    """Container for the per-extractor parameter dataclasses.

    All fields default to each extractor's own defaults, which mirror
    ``configs/default.yaml``. Overriding a single field keeps the
    other extractors at their defaults.

    Attributes
    ----------
    glycocalyx, focal_adhesions, actin : dataclass params
        Per-extractor parameters.
    include_radial_profile : bool
        If True, expand the 20-bin radial profile into flat columns
        ``glycocalyx_radial_profile_00..19`` in the output DataFrame.
    include_deep_features : bool
        If True, run the DINOv2 embedder and add 768 deep feature
        columns named ``deep_000..deep_767`` to each row.
    dinov2 : DinoV2Params
        DINOv2 parameters (model name, crop size, channel assignment).
    """

    glycocalyx: GlycocalyxParams = None  # type: ignore[assignment]
    focal_adhesions: FocalAdhesionParams = None  # type: ignore[assignment]
    actin: ActinParams = None  # type: ignore[assignment]
    dinov2: DinoV2Params = None  # type: ignore[assignment]
    include_radial_profile: bool = False
    include_deep_features: bool = False
    # Physical pixel size in microns. Surfaced as a first-class
    # parameter (rather than a hardcoded constant inside each
    # extractor) because µm-denominated thresholds — most importantly
    # focal-adhesion maturation bins — are wrong on any image whose
    # acquisition optics differ from the default. Demo manifests carry
    # per-image overrides; the frontend exposes this in the sidebar.
    pixel_size_um: float = 0.325
    # Mechanotransduction composite score mode. ``"pca"`` fits PC1
    # over the curated panel; ``"weighted_sum"`` is the transparent
    # equal-weight fallback used automatically when fewer than 30
    # cells are available.
    mechano_score_mode: str = "pca"
    # Illumination / background correction applied to every intensity
    # channel before feature extraction (DAPI is skipped). The radius
    # is µm-native (``background_radius_um``) so the physical
    # footprint stays invariant across acquisition optics — at the
    # default 7.5 µm it resolves to 23 px on 0.325 µm/px confocal and
    # to 11 px on BBBC022's 0.656 µm/px, *same biological feature cap*.
    # ``background_radius_px`` is kept as a legacy override for unit
    # tests that need a deterministic pixel size; when non-None it
    # takes precedence over ``background_radius_um``. Setting either
    # to 0 disables the correction.
    background_radius_um: float = DEFAULT_BACKGROUND_RADIUS_UM
    background_radius_px: int | None = None

    def __post_init__(self) -> None:
        from dataclasses import replace

        # Every child Param class carries its own ``pixel_size_um``
        # so its µm-native fields can resolve to pixels locally. The
        # assembler is the single source of truth — we propagate
        # ``self.pixel_size_um`` into every child unless the child
        # was explicitly constructed with a non-default value (which
        # we detect by comparing against the class default 0.325).
        def _with_pixel_size(obj):  # noqa: ANN001 - any Param dataclass
            if obj is None:
                return None
            if not hasattr(obj, "pixel_size_um"):
                return obj
            if obj.pixel_size_um == self.pixel_size_um:
                return obj
            # Only overwrite when the child still holds the class
            # default — preserves the caller's deliberate overrides.
            if obj.pixel_size_um == 0.325:
                return replace(obj, pixel_size_um=self.pixel_size_um)
            return obj

        if self.glycocalyx is None:
            object.__setattr__(
                self, "glycocalyx", GlycocalyxParams(pixel_size_um=self.pixel_size_um)
            )
        else:
            object.__setattr__(self, "glycocalyx", _with_pixel_size(self.glycocalyx))

        if self.focal_adhesions is None:
            object.__setattr__(
                self,
                "focal_adhesions",
                FocalAdhesionParams(pixel_size_um=self.pixel_size_um),
            )
        else:
            object.__setattr__(
                self, "focal_adhesions", _with_pixel_size(self.focal_adhesions)
            )

        if self.actin is None:
            object.__setattr__(
                self, "actin", ActinParams(pixel_size_um=self.pixel_size_um)
            )
        else:
            object.__setattr__(self, "actin", _with_pixel_size(self.actin))

        if self.dinov2 is None:
            object.__setattr__(
                self, "dinov2", DinoV2Params(pixel_size_um=self.pixel_size_um)
            )
        else:
            object.__setattr__(self, "dinov2", _with_pixel_size(self.dinov2))


class ProfileAssembler:
    """Run segmentation + feature extraction over a multi-channel image.

    Parameters
    ----------
    config : AssemblerConfig, optional
        Per-extractor parameters and the radial-profile inclusion flag.
    segmenter : CellSegmenter, optional
        Pre-built segmenter. Constructed lazily on first use if not
        provided; unit tests that pass ``cell_mask`` and
        ``nuclear_mask`` directly will never trigger construction,
        so the 1.2 GB Cellpose weights download is avoided.
    """

    def __init__(
        self,
        config: AssemblerConfig | None = None,
        segmenter: CellSegmenter | None = None,
        dinov2_embedder: DinoV2Embedder | None = None,
    ) -> None:
        self.config = config or AssemblerConfig()
        self._segmenter = segmenter
        self._dinov2_embedder = dinov2_embedder
        # Last :class:`MechanoScoreSummary` produced by
        # ``process_image``. The backend reads this after the call to
        # populate ``JobResult.mechano_score_summary`` for the UI.
        self.last_mechano_summary: MechanoScoreSummary | None = None

    def process_image(
        self,
        channels: dict[str, np.ndarray],
        cell_mask: np.ndarray | None = None,
        nuclear_mask: np.ndarray | None = None,
        segmentation_channel: str = "actin",
    ) -> pd.DataFrame:
        """Assemble a per-cell feature DataFrame from a multi-channel image.

        Parameters
        ----------
        channels : dict[str, np.ndarray]
            Keys from ``CANONICAL_CHANNELS``. All arrays must share
            the same 2D shape. Missing channels simply skip their
            feature extractor (useful for tests).
        cell_mask, nuclear_mask : np.ndarray, optional
            Pre-computed labeled integer masks with matching IDs (see
            ``CellSegmenter.segment_both``). If either is ``None``,
            the assembler invokes Cellpose-SAM on ``channels[segmentation_channel]``
            and ``channels['dapi']``.
        segmentation_channel : str
            Which channel to use as the cytoplasmic input when running
            Cellpose-SAM. Defaults to ``"actin"`` (phalloidin is the
            standard cell-body marker).

        Returns
        -------
        pd.DataFrame
            Indexed by ``cell_id`` with one row per detected cell.
            Columns are the flat feature dicts from each extractor,
            concatenated in a stable order. The list-valued
            ``glycocalyx_radial_profile`` is dropped unless
            ``config.include_radial_profile`` is True, in which case
            it is expanded into ``glycocalyx_radial_profile_00``,
            ``_01``, etc.

        Raises
        ------
        ValueError
            On empty ``channels`` or shape inconsistency.
        """
        if not channels:
            raise ValueError("channels dict must not be empty")
        self._validate_channel_shapes(channels)

        if cell_mask is None or nuclear_mask is None:
            cell_mask, nuclear_mask = self._segment(channels, segmentation_channel)

        # White top-hat background subtraction on every intensity
        # channel (glycocalyx / YAP / paxillin / actin). DAPI is left
        # untouched — it drives segmentation and nuclear morphometry
        # where top-hat would destroy nucleolar brights. The structuring
        # element is µm-native so its physical footprint is invariant
        # across acquisition optics; the legacy px override takes
        # precedence only when explicitly set (typically by tests).
        if self.config.background_radius_px is not None:
            if self.config.background_radius_px > 0:
                channels = subtract_background(
                    channels, radius_px=self.config.background_radius_px
                )
        elif self.config.background_radius_um > 0:
            channels = subtract_background(
                channels,
                radius_um=self.config.background_radius_um,
                pixel_size_um=self.config.pixel_size_um,
            )

        cell_ids = sorted(int(v) for v in np.unique(cell_mask).tolist() if v != 0)
        if not cell_ids:
            return pd.DataFrame()

        def _extract_one(cell_id: int) -> dict[str, float | list[float]]:
            row: dict[str, float | list[float]] = {"cell_id": float(cell_id)}
            self._extract_row(row, cell_id, channels, cell_mask, nuclear_mask)
            return row

        # Parallelize per-cell feature extraction across threads.
        # The NumPy / scikit-image operations release the GIL, so
        # threads give meaningful speedup on multi-core machines.
        from concurrent.futures import ThreadPoolExecutor

        max_w = min(8, max(1, len(cell_ids)))
        with ThreadPoolExecutor(max_workers=max_w) as pool:
            rows: list[dict[str, float | list[float]]] = list(
                pool.map(_extract_one, cell_ids)
            )

        df = pd.DataFrame(rows).set_index("cell_id")
        df = self._finalize_radial_profile(df)

        # Population-level post-processing: Jones-2024 size correction
        # for YAP and the composite mechanotransduction score. Both
        # operate on the entire cell population (not per-cell), so
        # they live outside the per-cell extraction loop.
        df, summary = apply_population_post_processing(
            df, mode=self.config.mechano_score_mode
        )
        self.last_mechano_summary = summary

        if self.config.include_deep_features:
            df = self._attach_deep_features(df, channels, cell_mask, cell_ids)

        return df

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _segment(
        self,
        channels: dict[str, np.ndarray],
        segmentation_channel: str,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Run Cellpose-SAM on the chosen channel + DAPI."""
        if segmentation_channel not in channels:
            raise ValueError(
                f"segmentation_channel '{segmentation_channel}' not in channels"
            )
        if "dapi" not in channels:
            raise ValueError(
                "'dapi' channel is required for nuclear segmentation; "
                "pass it or provide pre-computed masks"
            )
        if self._segmenter is None:
            from glycoquant.compute import use_gpu

            self._segmenter = CellSegmenter(gpu=use_gpu())
        return self._segmenter.segment_both(
            channels[segmentation_channel],
            channels["dapi"],
        )

    def _extract_row(
        self,
        row: dict[str, float | list[float]],
        cell_id: int,
        channels: dict[str, np.ndarray],
        cell_mask: np.ndarray,
        nuclear_mask: np.ndarray,
    ) -> None:
        """Populate ``row`` in place with all applicable feature extractors."""
        if "glycocalyx" in channels:
            row.update(
                extract_glycocalyx_features(
                    channels["glycocalyx"], cell_mask, cell_id, self.config.glycocalyx
                )
            )
        if "yap" in channels:
            row.update(
                extract_yap_features(
                    channels["yap"], cell_mask, nuclear_mask, cell_id
                )
            )
        if "paxillin" in channels:
            row.update(
                extract_fa_features(
                    channels["paxillin"], cell_mask, cell_id, self.config.focal_adhesions
                )
            )
        if "actin" in channels:
            row.update(
                extract_actin_features(
                    channels["actin"], cell_mask, cell_id, self.config.actin
                )
            )
        row.update(extract_morphology_features(cell_mask, cell_id))
        # Nuclear morphometry runs whenever a nuclear mask is available
        # — it only needs DAPI-derived geometry, not a YAP channel.
        row.update(
            extract_nuclear_morphology_features(cell_mask, nuclear_mask, cell_id)
        )

    def _attach_deep_features(
        self,
        df: pd.DataFrame,
        channels: dict[str, np.ndarray],
        cell_mask: np.ndarray,
        cell_ids: list[int],
    ) -> pd.DataFrame:
        """Run the configured deep embedder and append its columns.

        The embedder is whichever object was injected at construction
        time (DINOv2-base by default, Cell-DINO channel-adaptive when
        the worker dispatched on ``GLYCOQUANT_CELL_DINO_CKPT``). The
        column-name layout is owned by the embedder via
        ``column_names()`` so the assembler stays agnostic about the
        backbone:

            - ``DinoV2Embedder``                → ``deep_000..deep_767``
            - ``ChannelAdaptiveDinoEmbedder``   → ``deep_dapi_0000..deep_actin_1023``

        Cells that the embedder skips (bbox extraction failure) get
        NaN rows so the DataFrame shape stays consistent with the
        interpretable-feature rows.
        """
        if self._dinov2_embedder is None:
            self._dinov2_embedder = DinoV2Embedder(params=self.config.dinov2)

        used_ids, embeddings = self._dinov2_embedder.embed_image_with_masks(
            channels, cell_mask
        )
        deep_cols = self._dinov2_embedder.column_names()
        if embeddings.size and embeddings.shape[1] != len(deep_cols):
            raise RuntimeError(
                f"deep embedder shape mismatch: got {embeddings.shape[1]} "
                f"dims but column_names() returned {len(deep_cols)}"
            )

        deep_df = pd.DataFrame(
            embeddings,
            index=pd.Index(used_ids, name="cell_id"),
            columns=deep_cols,
        )
        # Reindex so every cell in the interpretable DataFrame has a row
        deep_df = deep_df.reindex(df.index)
        return df.join(deep_df)

    def _finalize_radial_profile(self, df: pd.DataFrame) -> pd.DataFrame:
        """Drop or expand the list-typed radial-profile column."""
        profile_col = "glycocalyx_radial_profile"
        if profile_col not in df.columns:
            return df
        if self.config.include_radial_profile:
            profiles = np.vstack([np.asarray(p, dtype=np.float32) for p in df[profile_col]])
            n_bins = profiles.shape[1]
            for i in range(n_bins):
                df[f"{profile_col}_{i:02d}"] = profiles[:, i]
        return df.drop(columns=[profile_col])

    @staticmethod
    def _validate_channel_shapes(channels: dict[str, np.ndarray]) -> None:
        """All channel arrays must share the same 2D shape."""
        shapes = {name: arr.shape for name, arr in channels.items()}
        reference = next(iter(shapes.values()))
        if not all(s == reference for s in shapes.values()):
            raise ValueError(f"channel shapes must all match; got {shapes}")
        if len(reference) != 2:
            raise ValueError(f"channels must be 2D; got shape {reference}")
