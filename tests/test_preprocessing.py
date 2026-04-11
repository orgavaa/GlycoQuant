"""Tests for glycoquant.preprocessing (white top-hat background subtraction)."""
from __future__ import annotations

import numpy as np

from glycoquant.preprocessing import (
    DEFAULT_BACKGROUND_RADIUS_PX,
    INTENSITY_CHANNELS,
    subtract_background,
)


def _synthetic_channel_with_gradient_bg() -> np.ndarray:
    """64×64 image: linear illumination ramp + a small bright punctum."""
    ramp = np.linspace(0.0, 0.6, 64, dtype=np.float32)
    bg = np.broadcast_to(ramp, (64, 64))
    img = bg.copy()
    img[30:34, 30:34] = 1.0  # bright 4x4 punctum well above the gradient
    return img


def test_subtract_background_removes_gradient_keeps_punctum() -> None:
    img = _synthetic_channel_with_gradient_bg()
    original_corner = img[-1, -1]
    out = subtract_background({"yap": img}, radius_px=10)
    corrected = out["yap"]
    # Background gradient is heavily suppressed — the bright corner
    # of the ramp is at least an order of magnitude closer to zero
    # after correction.
    assert corrected[-1, -1] < original_corner / 3.0
    # Punctum survives as a clear local maximum well above the bg
    assert corrected[32, 32] > 0.5
    assert corrected[32, 32] > corrected[0, 0] + 0.3


def test_subtract_background_skips_dapi_by_default() -> None:
    img = _synthetic_channel_with_gradient_bg()
    dapi = img.copy()
    out = subtract_background({"dapi": dapi, "yap": img}, radius_px=10)
    # DAPI is left untouched
    np.testing.assert_array_equal(out["dapi"], dapi)
    # YAP is corrected
    assert not np.array_equal(out["yap"], img)


def test_subtract_background_respects_custom_target_list() -> None:
    img = _synthetic_channel_with_gradient_bg()
    out = subtract_background(
        {"glycocalyx": img, "actin": img},
        radius_px=10,
        channels_to_correct=("glycocalyx",),
    )
    # Only glycocalyx was corrected
    assert not np.array_equal(out["glycocalyx"], img)
    np.testing.assert_array_equal(out["actin"], img)


def test_subtract_background_noop_when_radius_zero() -> None:
    img = _synthetic_channel_with_gradient_bg()
    out = subtract_background({"yap": img}, radius_px=0)
    np.testing.assert_array_equal(out["yap"], img)


def test_subtract_background_does_not_mutate_input() -> None:
    img = _synthetic_channel_with_gradient_bg()
    original = img.copy()
    _ = subtract_background({"yap": img}, radius_px=10)
    np.testing.assert_array_equal(img, original)


def test_default_radius_and_channels_exposed() -> None:
    """Module-level constants are public so tests and callers can reference them."""
    assert DEFAULT_BACKGROUND_RADIUS_PX > 0
    assert "dapi" not in INTENSITY_CHANNELS
    assert set(INTENSITY_CHANNELS) == {"glycocalyx", "yap", "paxillin", "actin"}
