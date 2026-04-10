"""Actin cytoskeleton features from phalloidin staining.

Actin stress fibers are a hallmark of a contractile, adherent cell in
a mechanically-stiff environment. This module quantifies fiber
organization via the local structure tensor (Jähne, 1993; Rezakhaniha
et al., *Biomech Model Mechanobiol* 2012): the ratio of its
eigenvalues gives a *coherence* metric that ranges from 0 (isotropic
texture) to 1 (perfectly aligned fibers), and the dominant eigenvector
gives the average fiber orientation.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import binary_erosion
from skimage.feature import structure_tensor, structure_tensor_eigenvalues

_EPSILON = 1e-12


@dataclass(frozen=True)
class ActinParams:
    """Parameters for structure-tensor computation and cortical ring geometry.

    Defaults mirror ``configs/default.yaml → features.actin``.
    """

    structure_tensor_sigma: float = 2.0
    cortical_ring_width_px: int = 10


def extract_actin_features(
    actin_channel: np.ndarray,
    cell_mask: np.ndarray,
    cell_id: int,
    params: ActinParams | None = None,
) -> dict[str, float]:
    """Extract actin features for a single cell.

    Parameters
    ----------
    actin_channel : np.ndarray
        2D fluorescence image of phalloidin-stained actin.
    cell_mask : np.ndarray
        Labeled integer mask, 0 = background, 1..N = cell IDs.
    cell_id : int
        Which cell to profile.
    params : ActinParams, optional

    Returns
    -------
    dict[str, float]
        Keys:
        - actin_mean_intensity           : mean actin signal inside the cell
        - actin_stress_fiber_coherence   : ``(λ1 − λ2) / (λ1 + λ2)``, mean over cell
        - actin_dominant_orientation     : fiber orientation in degrees (−90, 90]
        - actin_cortical_ratio           : cortical ring / deep interior intensity

    Raises
    ------
    ValueError
        On non-2D input or shape mismatch.
    """
    if actin_channel.ndim != 2:
        raise ValueError(f"actin_channel must be 2D, got shape {actin_channel.shape}")
    if cell_mask.ndim != 2:
        raise ValueError(f"cell_mask must be 2D, got shape {cell_mask.shape}")
    if actin_channel.shape != cell_mask.shape:
        raise ValueError(
            f"shape mismatch: actin {actin_channel.shape}, cell {cell_mask.shape}"
        )

    p = params or ActinParams()
    this_cell = cell_mask == cell_id
    if not this_cell.any():
        return _zero_features()

    cell_values = actin_channel[this_cell]
    mean_intensity = float(cell_values.mean())

    coherence, orientation_deg = _structure_tensor_features(
        actin_channel, this_cell, p.structure_tensor_sigma
    )

    cortical_ratio = _cortical_ratio(actin_channel, this_cell, p.cortical_ring_width_px)

    return {
        "actin_mean_intensity": mean_intensity,
        "actin_stress_fiber_coherence": coherence,
        "actin_dominant_orientation": orientation_deg,
        "actin_cortical_ratio": cortical_ratio,
    }


def _structure_tensor_features(
    image: np.ndarray,
    mask: np.ndarray,
    sigma: float,
) -> tuple[float, float]:
    """Compute (coherence, dominant orientation) from the structure tensor.

    Returns
    -------
    (coherence, orientation_deg) : tuple[float, float]
        Coherence in ``[0, 1]``, orientation in degrees.
    """
    # skimage 0.20+ returns (A_rr, A_rc, A_cc) as a list of three arrays
    axx, axy, ayy = structure_tensor(image.astype(np.float32), sigma=sigma, mode="reflect")
    larger, smaller = structure_tensor_eigenvalues((axx, axy, ayy))

    if not mask.any():
        return 0.0, 0.0

    larger_masked = larger[mask]
    smaller_masked = smaller[mask]
    denom = larger_masked + smaller_masked + _EPSILON
    coherence = float(((larger_masked - smaller_masked) / denom).mean())
    coherence = max(0.0, min(1.0, coherence))

    # Dominant gradient orientation comes from the structure tensor:
    # theta_gradient = 0.5 * arctan2(2 A_rc, A_rr − A_cc).
    # Fibers are perpendicular to the gradient: add pi/2 and wrap to (−90, 90].
    theta_grad = 0.5 * np.arctan2(
        2.0 * float(axy[mask].mean()),
        float((axx[mask] - ayy[mask]).mean()),
    )
    theta_fiber = theta_grad + np.pi / 2.0
    orientation_deg = float(np.degrees(theta_fiber))
    # Wrap to (−90, 90]
    while orientation_deg > 90.0:
        orientation_deg -= 180.0
    while orientation_deg <= -90.0:
        orientation_deg += 180.0

    return coherence, orientation_deg


def _cortical_ratio(
    actin_channel: np.ndarray,
    this_cell: np.ndarray,
    ring_width: int,
) -> float:
    """Cortical ring intensity divided by deep interior intensity.

    Cortical ring: the outermost ``ring_width`` pixels of the cell.
    Deep interior: the cell minus the cortical ring.
    """
    deep_interior = binary_erosion(this_cell, iterations=ring_width)
    cortical = this_cell & ~deep_interior

    cortical_values = actin_channel[cortical]
    interior_values = actin_channel[deep_interior]

    if cortical_values.size == 0:
        return 0.0
    cortical_mean = float(cortical_values.mean())

    if interior_values.size == 0 or interior_values.mean() == 0.0:
        return 0.0 if cortical_mean == 0.0 else 1000.0

    interior_mean = float(interior_values.mean())
    return float(min(cortical_mean / interior_mean, 1000.0))


def _zero_features() -> dict[str, float]:
    return {
        "actin_mean_intensity": 0.0,
        "actin_stress_fiber_coherence": 0.0,
        "actin_dominant_orientation": 0.0,
        "actin_cortical_ratio": 0.0,
    }
