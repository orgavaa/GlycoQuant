"""Cellpose-SAM wrapper for cell and nucleus segmentation.

Cellpose 4.x ships only the ``cpsam`` pretrained model — earlier model
names (cyto3, cyto2, nuclei) were removed. First instantiation of
``CellSegmenter`` downloads weights (~300 MB) to ``~/.cellpose/models/``;
subsequent constructions are cached and offline.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from cellpose import models
from skimage.measure import regionprops


@dataclass(frozen=True)
class SegmentationParams:
    """Parameters forwarded to ``CellposeModel.eval``.

    Defaults mirror ``configs/default.yaml → segmentation``.

    Attributes
    ----------
    diameter : float or None
        Expected cell diameter in pixels. ``None`` lets Cellpose estimate.
    flow_threshold : float
        Maximum allowed flow error per mask (lower = stricter).
    cellprob_threshold : float
        Cell probability threshold for mask pixels.
    min_size : int
        Minimum mask size in pixels; smaller components are discarded.
    normalize : bool
        Whether to percentile-normalize input intensity before inference.
    """

    diameter: float | None = None
    flow_threshold: float = 0.4
    cellprob_threshold: float = 0.0
    min_size: int = 15
    normalize: bool = True


class CellSegmenter:
    """Wraps Cellpose-SAM for cell and nucleus segmentation.

    Parameters
    ----------
    model_type : str
        Pretrained model name. In cellpose 4.x only ``"cpsam"`` is
        available; the argument is retained for API symmetry with
        earlier versions.
    gpu : bool
        Place the model on GPU. Default ``False`` for laptop/demo use.
    params : SegmentationParams, optional
        Default eval parameters; can be overridden per call.

    Notes
    -----
    The wrapper is intentionally thin. It adds three things on top of
    ``CellposeModel``: a fast path for all-zero inputs, a uniform
    ``int32`` dtype on the returned mask, and matched cell/nucleus
    label IDs via ``segment_both``.
    """

    def __init__(
        self,
        model_type: str = "cpsam",
        gpu: bool = False,
        params: SegmentationParams | None = None,
    ) -> None:
        self.model_type = model_type
        self.gpu = gpu
        self.params = params or SegmentationParams()
        self._model = models.CellposeModel(gpu=gpu, pretrained_model=model_type)

    def segment_cells(
        self,
        image: np.ndarray,
        diameter: float | None = None,
    ) -> np.ndarray:
        """Segment the cytoplasmic channel into a per-cell labeled mask.

        Parameters
        ----------
        image : np.ndarray
            2D array ``(H, W)``. Any floating-point or integer dtype;
            intensity range is arbitrary when ``params.normalize=True``.
        diameter : float or None
            Override for the default cell diameter in pixels.

        Returns
        -------
        np.ndarray
            ``int32`` labeled mask: ``0`` = background, ``1..N`` = cell IDs.
        """
        return self._run_eval(image, diameter if diameter is not None else self.params.diameter)

    def segment_nuclei(
        self,
        dapi: np.ndarray,
        diameter: float | None = None,
    ) -> np.ndarray:
        """Segment a DAPI channel into a per-nucleus labeled mask.

        Uses the same ``cpsam`` model as ``segment_cells``; Cellpose-SAM
        handles both cytoplasmic and nuclear inputs.
        """
        return self._run_eval(dapi, diameter if diameter is not None else self.params.diameter)

    def segment_both(
        self,
        image: np.ndarray,
        dapi: np.ndarray,
        cell_diameter: float | None = None,
        nuclear_diameter: float | None = None,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Segment cells and nuclei and return masks with matched label IDs.

        Each detected nucleus is assigned the cell ID whose mask
        contains the nucleus centroid. Nuclei whose centroid falls on
        background are dropped. Cells without a matched nucleus have
        no corresponding region in the returned nuclear mask.

        Parameters
        ----------
        image : np.ndarray
            Cytoplasmic channel (2D).
        dapi : np.ndarray
            DAPI / nuclear channel (2D, same shape as ``image``).
        cell_diameter, nuclear_diameter : float or None
            Optional per-call diameter overrides.

        Returns
        -------
        cell_mask, matched_nuclear_mask : tuple of np.ndarray
            Both ``int32`` and the same shape as ``image``. The pixels
            where ``matched_nuclear_mask == k`` are contained in the
            cell labeled ``k`` in ``cell_mask``.
        """
        if image.shape != dapi.shape:
            raise ValueError(
                f"image and dapi must have the same shape; got {image.shape} vs {dapi.shape}"
            )
        cell_mask = self.segment_cells(image, diameter=cell_diameter)
        raw_nuclear = self.segment_nuclei(dapi, diameter=nuclear_diameter)
        matched = self._match_labels(cell_mask, raw_nuclear)
        return cell_mask, matched

    def _run_eval(self, array: np.ndarray, diameter: float | None) -> np.ndarray:
        """Run ``CellposeModel.eval`` and coerce the mask to ``int32``.

        Fast path: an all-zero input returns an all-zero mask without
        invoking the network, making empty-image edge cases trivial
        to handle in downstream code.
        """
        if array.ndim != 2:
            raise ValueError(f"expected 2D array, got shape {array.shape}")
        if array.size == 0 or not np.any(array):
            return np.zeros(array.shape, dtype=np.int32)

        masks, _flows, _styles = self._model.eval(
            array,
            diameter=diameter,
            flow_threshold=self.params.flow_threshold,
            cellprob_threshold=self.params.cellprob_threshold,
            min_size=self.params.min_size,
            normalize=self.params.normalize,
        )
        return np.asarray(masks, dtype=np.int32)

    @staticmethod
    def _match_labels(
        cell_mask: np.ndarray,
        raw_nuclear: np.ndarray,
    ) -> np.ndarray:
        """Relabel nuclei so each takes the ID of the cell containing its centroid.

        Runs in ``O(N)`` over ``regionprops`` of the raw nuclear mask.
        """
        matched = np.zeros_like(cell_mask, dtype=np.int32)
        if raw_nuclear.max() == 0:
            return matched
        for nucleus in regionprops(raw_nuclear):
            cy, cx = (int(round(c)) for c in nucleus.centroid)
            cell_id = int(cell_mask[cy, cx])
            if cell_id == 0:
                continue
            matched[raw_nuclear == nucleus.label] = cell_id
        return matched
