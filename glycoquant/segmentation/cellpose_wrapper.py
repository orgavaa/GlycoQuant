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


def _default_min_cells_for_image(shape: tuple[int, ...]) -> int:
    """Heuristic anomaly threshold for the adaptive-diameter retry path.

    A 512×512 image has at most ~6 fields-of-cells at 200-px cell
    diameter; finding fewer than 5 is anomalous. A 4096×4096 confocal
    field should produce hundreds of cells; finding fewer than ~50 is
    anomalous. Linearly interpolated as ``image_area / (200 px)²``,
    floored at 5 so tiny synthetic test images don't trip the retry.
    """
    if len(shape) < 2:
        return 5
    area = int(shape[0]) * int(shape[1])
    estimated = area // (200 * 200)
    return max(5, estimated)


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
        adaptive_diameter: bool = False,
        adaptive_diameter_sweep: tuple[float, ...] = (60.0, 100.0, 150.0, 200.0),
        adaptive_min_cells: int | None = None,
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
        adaptive_diameter : bool
            If ``True`` and the initial segmentation finds anomalously
            few cells, retry with the diameters in
            ``adaptive_diameter_sweep`` and pick the one producing the
            most cells whose median area looks biological. The
            anomaly threshold is :func:`_default_min_cells_for_image`
            unless ``adaptive_min_cells`` overrides it. This is the
            failure-mode fallback for big spread fibroblasts on soft
            hydrogels where Cellpose-SAM's auto-diameter
            (``diameter=None``) under-segments because the cells are
            larger than its training-corpus prior.
        adaptive_diameter_sweep : tuple[float, ...]
            Diameters tried during retry. The defaults span the
            primary-fibroblast / cell-line / spread-fibroblast range
            at 0.325 µm/px (60 px ≈ 20 µm cell diameter through
            200 px ≈ 65 µm spread fibroblast).
        adaptive_min_cells : int, optional
            Override the per-image-area "this is too few cells"
            threshold. Default is 5 for tiny images (<512²) and
            ``image_area / (200 px)²`` otherwise.

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

        if adaptive_diameter:
            n_cells = int(np.unique(cell_mask).size - 1)
            min_cells = (
                adaptive_min_cells
                if adaptive_min_cells is not None
                else _default_min_cells_for_image(image.shape)
            )
            if n_cells < min_cells:
                cell_mask = self._sweep_for_best_diameter(
                    image,
                    sweep=adaptive_diameter_sweep,
                    incumbent=cell_mask,
                    min_cells=min_cells,
                )

        raw_nuclear = self.segment_nuclei(dapi, diameter=nuclear_diameter)
        matched = self._match_labels(cell_mask, raw_nuclear)
        return cell_mask, matched

    def _sweep_for_best_diameter(
        self,
        image: np.ndarray,
        sweep: tuple[float, ...],
        incumbent: np.ndarray,
        min_cells: int,
    ) -> np.ndarray:
        """Retry segmentation across a diameter sweep; return the best mask.

        Quality metric: prefer the mask with the most cells in the
        biological size band (10–60 % of image side, in pixels). This
        rejects both fragmentation (lots of tiny components) and
        over-segmentation (one or two huge blobs). Falls back to the
        incumbent ``diameter=None`` mask if no sweep value beats it on
        cell count.
        """
        best_mask = incumbent
        best_count = int(np.unique(incumbent).size - 1)
        side = float(min(image.shape))
        size_band = (0.05 * side, 0.50 * side)  # cell diameter range, px

        for diameter in sweep:
            try:
                candidate = self.segment_cells(image, diameter=float(diameter))
            except Exception:  # noqa: BLE001 - cellpose can raise on degenerate inputs
                continue
            cell_ids = np.unique(candidate)
            cell_ids = cell_ids[cell_ids != 0]
            if cell_ids.size == 0:
                continue
            # Count cells in the biological size band
            biological = 0
            for cid in cell_ids:
                area = int((candidate == cid).sum())
                # Equivalent diameter from area
                eq_diam = float(2.0 * np.sqrt(area / np.pi))
                if size_band[0] <= eq_diam <= size_band[1]:
                    biological += 1
            if biological > best_count:
                best_mask = candidate
                best_count = biological

        # Only adopt the sweep result if it beat the incumbent floor
        if best_count >= min_cells:
            return best_mask
        return incumbent

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
