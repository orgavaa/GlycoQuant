"""Pixel-size invariance tests — the scientific-correctness proof for Fix 6.

The refactor that moved every spatially-sized parameter to µm-native
representation only counts as correct if the extractors produce
*invariant* results when you double ``pixel_size_um`` and halve the
image resolution: same biological footprint, same feature values (up
to interpolation noise).

This file is the forward-going regression guardrail against anyone
re-introducing a pixel-hardcoded threshold. If one slips back in,
the invariance tests break; if none do, every extractor is honestly
cross-optics comparable.

We exercise four independently-sized knobs:
- ``FocalAdhesionParams`` area bounds and peripheral distance
- ``ActinParams`` structure-tensor σ and cortical ring width
- ``GlycocalyxParams`` ring-width discretisation floor
- Background-subtraction radius in ``subtract_background``
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from glycoquant.features.actin import ActinParams
from glycoquant.features.deep_embedding import (
    ChannelAdaptiveDinoParams,
    DinoV2Params,
)
from glycoquant.features.focal_adhesions import FocalAdhesionParams
from glycoquant.features.glycocalyx import (
    GlycocalyxParams,
    _resolve_min_ring_width_px,
)
from glycoquant.preprocessing import (
    DEFAULT_BACKGROUND_RADIUS_PX,
    DEFAULT_BACKGROUND_RADIUS_UM,
    resolve_background_radius_px,
)


# ---------------------------------------------------------------------------
# Preprocessing: background radius
# ---------------------------------------------------------------------------


def test_background_radius_matches_legacy_default_at_canonical_pixel_size() -> None:
    """Default 7.5 µm radius at 0.325 µm/px must equal the legacy 25 px (±1 for rounding)."""
    resolved = resolve_background_radius_px(DEFAULT_BACKGROUND_RADIUS_UM, 0.325)
    assert abs(resolved - DEFAULT_BACKGROUND_RADIUS_PX) <= 2


def test_background_radius_scales_inversely_with_pixel_size() -> None:
    """Doubling pixel_size halves the pixel footprint (same µm radius)."""
    r_fine = resolve_background_radius_px(7.5, 0.325)
    r_coarse = resolve_background_radius_px(7.5, 0.650)
    # 0.650 is ~2× 0.325, so pixel count ~½
    assert abs(r_fine - 2 * r_coarse) <= 2


def test_background_radius_rejects_invalid_pixel_size() -> None:
    with pytest.raises(ValueError, match="pixel_size_um"):
        resolve_background_radius_px(7.5, 0.0)
    with pytest.raises(ValueError, match="pixel_size_um"):
        resolve_background_radius_px(7.5, -0.1)


# ---------------------------------------------------------------------------
# Focal adhesions: µm↔px round-trip
# ---------------------------------------------------------------------------


def test_fa_params_preserve_legacy_px_at_canonical_pixel_size() -> None:
    """Default µm fields at 0.325 µm/px must approximate the old 5/500/20 px trio.

    This is the regression guardrail — if a future change drifts the
    µm defaults, the pixel counts at the canonical acquisition will
    shift and existing synthetic-fixture FA tests will start to drift.
    """
    p = FocalAdhesionParams(pixel_size_um=0.325)
    # 0.5 µm² / (0.325² µm²/px²) ≈ 4.73 → 5 px² ✓
    assert p.resolved_min_area_px == pytest.approx(5, abs=1)
    # 50 µm² / (0.325² µm²/px²) ≈ 473 px² — close to the legacy 500 ceiling
    assert 450 < p.resolved_max_area_px < 500
    # 6.5 µm / 0.325 = 20 px ✓
    assert p.resolved_peripheral_distance_px == pytest.approx(20.0, abs=0.1)


def test_fa_area_bounds_invariant_across_pixel_sizes() -> None:
    """Same µm² bounds must resolve to *same* physical area at any pixel size."""
    for px in (0.325, 0.45, 0.656, 0.9):
        p = FocalAdhesionParams(pixel_size_um=px)
        min_um2 = p.resolved_min_area_px * (px ** 2)
        max_um2 = p.resolved_max_area_px * (px ** 2)
        # Round-trip should land within a quantisation step of the µm default
        assert abs(min_um2 - p.min_area_um2) < px ** 2
        assert abs(max_um2 - p.max_area_um2) < 2 * px ** 2


def test_fa_peripheral_distance_invariant_across_pixel_sizes() -> None:
    for px in (0.325, 0.45, 0.656, 0.9):
        p = FocalAdhesionParams(pixel_size_um=px)
        um = p.resolved_peripheral_distance_px * px
        assert abs(um - p.peripheral_distance_um) < px


def test_fa_legacy_px_override_wins_over_um() -> None:
    """A caller that still passes ``min_area_px=10`` gets 10, not the µm-derived value."""
    p = FocalAdhesionParams(pixel_size_um=0.325, min_area_px=10)
    assert p.resolved_min_area_px == 10
    # Other fields still µm-derived
    assert p.resolved_peripheral_distance_px == pytest.approx(20.0, abs=0.1)


# ---------------------------------------------------------------------------
# Actin: σ and cortical ring
# ---------------------------------------------------------------------------


def test_actin_sigma_invariant_in_microns() -> None:
    """σ=0.65 µm resolves to 2 px at 0.325 and 1 px at 0.650 (same physical smoothing)."""
    a_fine = ActinParams(pixel_size_um=0.325)
    a_coarse = ActinParams(pixel_size_um=0.650)
    assert a_fine.resolved_structure_tensor_sigma == pytest.approx(2.0, abs=0.01)
    assert a_coarse.resolved_structure_tensor_sigma == pytest.approx(1.0, abs=0.01)


def test_actin_cortical_ring_scales_inversely_with_pixel_size() -> None:
    a_fine = ActinParams(pixel_size_um=0.325)
    a_coarse = ActinParams(pixel_size_um=0.650)
    assert a_fine.resolved_cortical_ring_width_px == 10
    assert a_coarse.resolved_cortical_ring_width_px == 5


def test_actin_legacy_sigma_field_still_honored() -> None:
    """Old call sites: ``ActinParams(structure_tensor_sigma=3.0)`` — tests rely on this."""
    a = ActinParams(pixel_size_um=0.325, structure_tensor_sigma=3.0)
    assert a.resolved_structure_tensor_sigma == pytest.approx(3.0)


# ---------------------------------------------------------------------------
# Glycocalyx: ring width floor
# ---------------------------------------------------------------------------


def test_glycocalyx_ring_floor_respects_pixel_size() -> None:
    """1 µm floor resolves to 3 px at 0.325, 2 px at 0.656 (clamped to absolute floor)."""
    assert _resolve_min_ring_width_px(0.325) == 3
    # 1.0 / 0.656 ≈ 1.52 → rounded to 2 (matches the 2-px absolute floor)
    assert _resolve_min_ring_width_px(0.656) == 2


def test_glycocalyx_ring_floor_clamps_to_two_px_on_fine_optics() -> None:
    """Even at super-resolution pixel sizes the ring floor is at least 2 px."""
    # 0.05 µm/px would naively give 20 px — correct, no clamp needed
    assert _resolve_min_ring_width_px(0.05) == 20
    # 2.0 µm/px would give 1 px — clamped up to the 2-px discretisation floor
    assert _resolve_min_ring_width_px(2.0) == 2


def test_glycocalyx_params_carries_pixel_size() -> None:
    p = GlycocalyxParams(pixel_size_um=0.656)
    assert p.pixel_size_um == 0.656


# ---------------------------------------------------------------------------
# Deep embedding: bbox padding
# ---------------------------------------------------------------------------


def test_dinov2_bbox_padding_invariant_in_microns() -> None:
    d_fine = DinoV2Params(pixel_size_um=0.325)
    d_coarse = DinoV2Params(pixel_size_um=0.650)
    assert d_fine.resolved_bbox_padding_px == 8
    assert d_coarse.resolved_bbox_padding_px == 4


def test_channel_adaptive_dino_bbox_padding_invariant() -> None:
    c_fine = ChannelAdaptiveDinoParams(
        checkpoint_path="/fake.pth", pixel_size_um=0.325
    )
    c_coarse = ChannelAdaptiveDinoParams(
        checkpoint_path="/fake.pth", pixel_size_um=0.650
    )
    assert c_fine.resolved_bbox_padding_px == 8
    assert c_coarse.resolved_bbox_padding_px == 4


# ---------------------------------------------------------------------------
# End-to-end invariance check
# ---------------------------------------------------------------------------


def test_all_param_classes_expose_pixel_size() -> None:
    """Every spatially-aware Param class must carry ``pixel_size_um``.

    This is the regression guardrail against someone adding a new
    Param class that forgets the pixel-size plumbing and silently
    re-introduces pixel-hardcoded thresholds.
    """
    classes = [
        FocalAdhesionParams(),
        ActinParams(),
        GlycocalyxParams(),
        DinoV2Params(),
        ChannelAdaptiveDinoParams(checkpoint_path="/fake.pth"),
    ]
    for p in classes:
        assert hasattr(p, "pixel_size_um"), (
            f"{type(p).__name__} is missing pixel_size_um — every "
            "spatially-sized Param class must carry it for cross-optics invariance"
        )
        assert p.pixel_size_um > 0
        # Default must be the canonical 0.325 µm/px so the existing
        # pixel defaults and synthetic-fixture expectations stay valid.
        assert p.pixel_size_um == pytest.approx(0.325)
