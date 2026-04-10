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
    FocalAdhesionParams,
    GlycocalyxParams,
    extract_actin_features,
    extract_fa_features,
    extract_glycocalyx_features,
    extract_morphology_features,
    extract_yap_features,
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
    """

    glycocalyx: GlycocalyxParams = None  # type: ignore[assignment]
    focal_adhesions: FocalAdhesionParams = None  # type: ignore[assignment]
    actin: ActinParams = None  # type: ignore[assignment]
    include_radial_profile: bool = False

    def __post_init__(self) -> None:
        if self.glycocalyx is None:
            object.__setattr__(self, "glycocalyx", GlycocalyxParams())
        if self.focal_adhesions is None:
            object.__setattr__(self, "focal_adhesions", FocalAdhesionParams())
        if self.actin is None:
            object.__setattr__(self, "actin", ActinParams())


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
    ) -> None:
        self.config = config or AssemblerConfig()
        self._segmenter = segmenter

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

        cell_ids = sorted(int(v) for v in np.unique(cell_mask).tolist() if v != 0)
        if not cell_ids:
            return pd.DataFrame()

        rows: list[dict[str, float | list[float]]] = []
        for cell_id in cell_ids:
            row: dict[str, float | list[float]] = {"cell_id": float(cell_id)}
            self._extract_row(row, cell_id, channels, cell_mask, nuclear_mask)
            rows.append(row)

        df = pd.DataFrame(rows).set_index("cell_id")
        return self._finalize_radial_profile(df)

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
            self._segmenter = CellSegmenter(gpu=False)
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
