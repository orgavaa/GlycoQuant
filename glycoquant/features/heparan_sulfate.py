"""Heparan-sulfate (HS) pericellular feature extractor.

Wheat-germ agglutinin (WGA) — the lectin behind every ``glycocalyx_*``
feature in :mod:`glycoquant.features.glycocalyx` — binds sialic acid
and N-acetylglucosamine. It does NOT bind heparan-sulfate
glycosaminoglycan chains. For the syndecan (SDC1–4) / glypican
(GPC1/3/4/6) / EXT1/2 / NDST1/2 / HPSE biosynthetic axis the WGA
readout is at best a co-regulated proxy and at worst measurement-
blind to the targeted polymer.

This module exposes a sibling extractor parameterised by the same
ring-geometry, texture, and spatial-autocorrelation features as the
WGA path but applied to an **anti-HS antibody channel** — typically
the **10E4 epitope** (HS-3-O-sulfated motif; Galustian *et al.*,
*Glycoconj J* 1995) or the **F58-10E4** clone. Output column names
are prefixed ``hs_`` (e.g. ``hs_pericellular_ratio``,
``hs_radial_decay_rate``) to keep them disjoint from the
``glycocalyx_*`` namespace, so a per-cell DataFrame can carry
*both* readouts side-by-side and the cross-modal predictor can score
their independent predictive value.

Wet-lab requirement
-------------------
This extractor only runs when the canonical 6th channel
``heparan_sulfate`` is supplied to the assembler. The platform does
not synthesise an HS signal from the WGA channel — they measure
different polymers. See ``docs/HEPARAN_SULFATE_PROTOCOL.md`` for the
recommended antibody, dilution, fixation, and imaging protocol.
"""
from __future__ import annotations

import numpy as np

from glycoquant.features.glycocalyx import (
    GlycocalyxParams,
    extract_glycocalyx_features,
)


def extract_hs_features(
    hs_channel: np.ndarray,
    cell_mask: np.ndarray,
    cell_id: int,
    params: GlycocalyxParams | None = None,
) -> dict[str, float | list[float]]:
    """Extract HS pericellular features for a single cell.

    Identical mathematical features to
    :func:`glycoquant.features.glycocalyx.extract_glycocalyx_features`
    — only the input channel and the output key prefix differ. This
    deliberate symmetry lets the cross-modal predictor and the
    glyco↔mechano correlation heatmap consume both readouts via the
    same code path; downstream is namespaced by the ``hs_`` prefix.

    Parameters
    ----------
    hs_channel : np.ndarray
        2D fluorescence image of the anti-HS antibody channel
        (10E4 / F58-10E4 / equivalent).
    cell_mask : np.ndarray
        Labeled integer mask, 0 = background, 1..N = cell IDs.
    cell_id : int
        Which cell to profile.
    params : GlycocalyxParams, optional
        Same parameter object the WGA extractor uses — ring width,
        Haralick quantisation, Moran's I floor are all shared because
        they describe the same pericellular shell geometry, just with
        a different polymer being imaged.

    Returns
    -------
    dict[str, float | list[float]]
        Feature dict with keys prefixed ``hs_`` (e.g. ``hs_mean_intensity``,
        ``hs_pericellular_ratio``, ``hs_radial_decay_rate``,
        ``hs_haralick_contrast``, ``hs_moran_i``).
    """
    glyco_features = extract_glycocalyx_features(
        hs_channel, cell_mask, cell_id, params
    )
    return {
        _rename_key(k): v for k, v in glyco_features.items()
    }


def _rename_key(key: str) -> str:
    """``glycocalyx_<name>`` → ``hs_<name>``; pass-through everything else.

    Pure string substitution so the extractor wrapper is dead-simple
    to audit. Keys that don't start with the WGA prefix are returned
    unchanged — defensive against any future field added to the WGA
    extractor that doesn't follow the convention.
    """
    if key.startswith("glycocalyx_"):
        return "hs_" + key[len("glycocalyx_"):]
    return key
