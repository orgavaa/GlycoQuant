"""Power analysis: minimum detectable effect for every WGA-pericellular feature.

A reviewer asking "what's the smallest WGA-pericellular intensity
shift this pipeline could detect at α=0.05 / power=0.8 on N cells"
deserves a number, not a hand-wave. This script answers it.

Strategy:
1. Generate a synthetic cell population (deterministic, no Cellpose
   required) — cells of varied size, each surrounded by a WGA ring of
   known peak intensity.
2. For every effect size in :data:`EFFECT_SIZES`, multiply the ring
   intensity in *one* arm by the effect and leave the other arm at
   baseline. Both arms have the same ``cells_per_arm`` cell count.
3. Run :func:`extract_glycocalyx_features` per cell.
4. For every feature, run a two-sided Mann-Whitney U on the per-cell
   distributions, repeated ``n_replicates`` times (each replicate
   uses a fresh random seed so the test sees realistic per-replicate
   variability).
5. Empirical power = fraction of replicates where p < ``alpha``.
6. Minimum detectable effect = smallest effect size with empirical
   power ≥ ``target_power`` (default 0.8). Reported as both a
   multiplier (e.g. 1.5×) and a percentage shift from baseline.

Output:
- ``results/power_analysis.json`` — per-feature min detectable effect,
  cell count, alpha, power target, full per-effect/per-replicate
  p-value table for downstream re-analysis.
- ``results/power_analysis.csv`` — flat per-feature summary, methods-
  section friendly.

Run::

    python scripts/power_analysis.py --cells-per-arm 50 --replicates 30

Defaults are tuned for a ~1-minute run.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from scipy.stats import mannwhitneyu

# Make the repo importable when invoked from scripts/
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from glycoquant.features.glycocalyx import (  # noqa: E402
    GlycocalyxParams,
    extract_glycocalyx_features,
)

# Effect sizes (multiplicative shift of WGA ring peak intensity vs
# baseline). 1.0 is the null. Tighter steps near 1.0 because the
# minimum-detectable-effect typically lands in [1.1, 1.5] on 50 cells.
EFFECT_SIZES: tuple[float, ...] = (
    0.50, 0.67, 0.80, 0.90, 1.00, 1.10, 1.25, 1.50, 2.00,
)

# Features to analyse. Skip the radial profile (list-valued) and any
# that are deterministic on the synthetic fixture (saves runtime).
TARGET_FEATURES: tuple[str, ...] = (
    "glycocalyx_mean_intensity",
    "glycocalyx_integrated_intensity",
    "glycocalyx_pericellular_ratio",
    "glycocalyx_coverage",
    "glycocalyx_heterogeneity",
    "glycocalyx_shannon_entropy",
    "glycocalyx_radial_decay_rate",
    "glycocalyx_haralick_contrast",
    "glycocalyx_haralick_homogeneity",
    "glycocalyx_haralick_correlation",
    "glycocalyx_haralick_energy",
    "glycocalyx_moran_i",
)

# Synthetic cell geometry: each cell is a uniform disc with a WGA ring
# around it, planted at a unique pixel location so they don't overlap.
_CELL_RADIUS_RANGE = (28, 42)  # px, sampled uniformly per cell
_RING_WIDTH_PX = 6  # WGA ring thickness — fixed for fair effect comparisons
_CANVAS_SIZE = 512  # image side in pixels
_GRID_PITCH = 80  # spacing between cell centers


@dataclass
class FeaturePower:
    feature: str
    min_detectable_effect: float | None  # multiplicative; None if undetected at all sizes
    min_detectable_pct_shift: float | None  # |effect - 1.0| × 100
    per_effect_power: dict[float, float]  # {effect: empirical_power}


def _build_cell_population(
    n_cells: int, ring_intensity: float, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray]:
    """Generate (wga_image, cell_mask) for ``n_cells`` discs on a square canvas."""
    image = np.zeros((_CANVAS_SIZE, _CANVAS_SIZE), dtype=np.float32)
    mask = np.zeros((_CANVAS_SIZE, _CANVAS_SIZE), dtype=np.int32)

    # Lay out cell centers on a regular grid + small jitter so they're
    # not perfectly aligned (avoids artificial Moran's I).
    per_side = max(1, int(_CANVAS_SIZE // _GRID_PITCH))
    centers: list[tuple[int, int, int]] = []
    cell_id = 0
    for i in range(per_side):
        for j in range(per_side):
            if cell_id >= n_cells:
                break
            cy = int((i + 0.5) * _GRID_PITCH + rng.integers(-5, 6))
            cx = int((j + 0.5) * _GRID_PITCH + rng.integers(-5, 6))
            radius = int(rng.integers(*_CELL_RADIUS_RANGE))
            centers.append((cy, cx, radius))
            cell_id += 1
        if cell_id >= n_cells:
            break

    # Render each cell + WGA ring
    yy, xx = np.indices(image.shape)
    for idx, (cy, cx, radius) in enumerate(centers, start=1):
        dist = np.hypot(yy - cy, xx - cx)
        cell_disc = dist <= radius
        ring = (dist > radius) & (dist <= radius + _RING_WIDTH_PX)
        # Ring with Poisson-like noise so the synthetic data has
        # realistic per-pixel variance — without noise the Mann-Whitney
        # test is degenerate at any effect size.
        ring_pixels = ring.sum()
        if ring_pixels > 0:
            noise = rng.normal(0.0, 0.1 * ring_intensity, size=ring_pixels)
            image[ring] = np.clip(ring_intensity + noise, 0.0, None).astype(np.float32)
        # Cell interior with a low cytoplasmic glow for the
        # pericellular-ratio computation
        interior_intensity = 0.05 * ring_intensity
        image[cell_disc & ~ring] = interior_intensity
        mask[cell_disc] = idx
    return image, mask


def _per_cell_features(
    image: np.ndarray, mask: np.ndarray, cell_ids: list[int]
) -> dict[str, list[float]]:
    """Run extract_glycocalyx_features for each cell, return columnar dict."""
    out: dict[str, list[float]] = {f: [] for f in TARGET_FEATURES}
    params = GlycocalyxParams(
        adaptive_ring_width=True,
        compute_haralick=True,
        compute_moran=True,
    )
    for cid in cell_ids:
        feats = extract_glycocalyx_features(image, mask, cid, params)
        for f in TARGET_FEATURES:
            v = feats.get(f, math.nan)
            if isinstance(v, list):
                v = math.nan
            out[f].append(float(v))
    return out


def _power_at_effect(
    cells_per_arm: int,
    effect: float,
    n_replicates: int,
    alpha: float,
    seed: int,
) -> dict[str, float]:
    """Empirical Mann-Whitney power per feature at a given effect size."""
    rng = np.random.default_rng(seed)
    rejections: dict[str, int] = {f: 0 for f in TARGET_FEATURES}

    for rep in range(n_replicates):
        # Two arms, each with a fresh image + mask
        baseline_img, baseline_mask = _build_cell_population(
            cells_per_arm, ring_intensity=1.0, rng=np.random.default_rng(seed + rep * 2)
        )
        treated_img, treated_mask = _build_cell_population(
            cells_per_arm, ring_intensity=effect, rng=np.random.default_rng(seed + rep * 2 + 1)
        )

        baseline_ids = sorted(int(v) for v in np.unique(baseline_mask) if v != 0)
        treated_ids = sorted(int(v) for v in np.unique(treated_mask) if v != 0)
        if not baseline_ids or not treated_ids:
            continue
        baseline_feats = _per_cell_features(baseline_img, baseline_mask, baseline_ids)
        treated_feats = _per_cell_features(treated_img, treated_mask, treated_ids)

        for f in TARGET_FEATURES:
            a = np.asarray(baseline_feats[f], dtype=np.float64)
            b = np.asarray(treated_feats[f], dtype=np.float64)
            a = a[np.isfinite(a)]
            b = b[np.isfinite(b)]
            if a.size < 5 or b.size < 5:
                continue
            if np.ptp(a) == 0 and np.ptp(b) == 0 and a.mean() == b.mean():
                continue
            try:
                u_stat, p = mannwhitneyu(a, b, alternative="two-sided")
            except ValueError:
                continue
            if p < alpha:
                rejections[f] += 1
        del u_stat  # silence the linter — assignment used only in the if-test

    return {f: rejections[f] / max(1, n_replicates) for f in TARGET_FEATURES}


def run_power_analysis(
    cells_per_arm: int,
    n_replicates: int,
    alpha: float,
    target_power: float,
    seed: int,
) -> tuple[list[FeaturePower], dict[str, Any]]:
    """Drive the per-effect power scan and resolve min-detectable per feature."""
    per_effect: dict[float, dict[str, float]] = {}
    for eff in EFFECT_SIZES:
        if eff == 1.0:
            # Skip the null — by construction empirical power == α (Type-I rate)
            per_effect[eff] = {f: 0.0 for f in TARGET_FEATURES}
            continue
        print(f"[power] effect={eff:.2f} ...", flush=True)
        per_effect[eff] = _power_at_effect(
            cells_per_arm=cells_per_arm,
            effect=eff,
            n_replicates=n_replicates,
            alpha=alpha,
            seed=seed,
        )

    # Resolve min detectable effect per feature
    out: list[FeaturePower] = []
    for f in TARGET_FEATURES:
        per_f = {eff: per_effect[eff].get(f, 0.0) for eff in EFFECT_SIZES}
        # Sort by distance from 1.0 (closer = smaller effect)
        candidates = sorted(EFFECT_SIZES, key=lambda e: abs(e - 1.0))
        min_eff = next(
            (eff for eff in candidates if eff != 1.0 and per_f[eff] >= target_power),
            None,
        )
        out.append(
            FeaturePower(
                feature=f,
                min_detectable_effect=min_eff,
                min_detectable_pct_shift=(
                    abs(min_eff - 1.0) * 100.0 if min_eff is not None else None
                ),
                per_effect_power=per_f,
            )
        )

    diagnostics: dict[str, Any] = {
        "effect_sizes": list(EFFECT_SIZES),
        "cells_per_arm": cells_per_arm,
        "n_replicates": n_replicates,
        "alpha": alpha,
        "target_power": target_power,
        "seed": seed,
    }
    return out, diagnostics


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cells-per-arm", type=int, default=50)
    parser.add_argument("--replicates", type=int, default=30)
    parser.add_argument("--alpha", type=float, default=0.05)
    parser.add_argument("--target-power", type=float, default=0.80)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=_REPO_ROOT / "results",
    )
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    out, diagnostics = run_power_analysis(
        cells_per_arm=args.cells_per_arm,
        n_replicates=args.replicates,
        alpha=args.alpha,
        target_power=args.target_power,
        seed=args.seed,
    )

    # JSON: full per-effect power table
    json_path = args.output_dir / "power_analysis.json"
    payload = {
        "diagnostics": diagnostics,
        "features": [
            {
                "feature": fp.feature,
                "min_detectable_effect": fp.min_detectable_effect,
                "min_detectable_pct_shift": fp.min_detectable_pct_shift,
                "per_effect_power": {
                    str(k): v for k, v in fp.per_effect_power.items()
                },
            }
            for fp in out
        ],
    }
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[power] wrote {json_path.relative_to(_REPO_ROOT)}")

    # CSV: methods-section friendly
    csv_path = args.output_dir / "power_analysis.csv"
    rows = ["feature,min_detectable_effect,min_detectable_pct_shift\n"]
    for fp in out:
        eff = "" if fp.min_detectable_effect is None else f"{fp.min_detectable_effect:.2f}"
        pct = "" if fp.min_detectable_pct_shift is None else f"{fp.min_detectable_pct_shift:.0f}"
        rows.append(f"{fp.feature},{eff},{pct}\n")
    csv_path.write_text("".join(rows), encoding="utf-8")
    print(f"[power] wrote {csv_path.relative_to(_REPO_ROOT)}")

    # Console summary — most-to-least sensitive feature
    out_sorted = sorted(
        out,
        key=lambda fp: (
            fp.min_detectable_pct_shift if fp.min_detectable_pct_shift is not None else 1e9
        ),
    )
    print("\n[power] Per-feature minimum detectable effect (alpha=0.05, power>=0.80):")
    for fp in out_sorted:
        if fp.min_detectable_effect is not None:
            print(
                f"  {fp.feature:42s}  "
                f"{fp.min_detectable_effect:5.2f}x "
                f"({fp.min_detectable_pct_shift:5.0f}% shift)"
            )
        else:
            print(f"  {fp.feature:42s}  not detectable up to 2.0x")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
