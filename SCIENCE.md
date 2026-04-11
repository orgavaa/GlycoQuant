# Scientific rationale and references

Every quantitative choice in GlycoQuant — segmentation model, feature definition, preprocessing, sentinel value — is grounded in the cell-biology and computational-imaging literature. This document is the single source of truth for those choices, cited inline so anything downstream (statement of interest, README, paper figures) can reference it directly.

Conventions:
- ⚠️ marks a known limitation of the feature.
- 🧪 marks a place where adaptive logic was chosen deliberately over a fixed threshold.
- 📎 marks a citation key.

---

## 1. Segmentation — Cellpose-SAM

**Model:** [`facebook/cellpose-sam`](https://www.cellpose.org) ("cpsam") — Cellpose 4.x, Pachitariu & Stringer, 2024. Generalist cellular segmentation model distilled from SAM and trained on a heterogeneous microscopy corpus. Reported mean AP ≈ 0.88 on held-out fluorescence benchmarks.

Why this model, not a custom U-Net:
- **SOTA and actively maintained** — replacing Cellpose-cyto3 as of the 4.x release. No fine-tuning required for a reasonable baseline on confocal glycocalyx data.
- **Auto-diameter estimation** — we pass `diameter=None` by default so the model estimates cell size internally per image. This removes a per-image hyperparameter the user would otherwise have to tune, which is a common bias source (users pick a diameter that matches one condition, mis-segmenting the rest).
- **Two-channel matched labels** — `CellSegmenter.segment_both` runs Cellpose twice (cell body + DAPI) and matches nuclear IDs to cell IDs by IoU, so every per-cell row in the feature table has a paired nucleus. This is the input contract for the YAP N/C and nuclear morphometry extractors.

⚠️ **Resolution caveat.** Confocal + lectin staining measures the *pericellular intensity distribution* at micron scale, not the 50–500 nm glycocalyx ultrastructure. Super-resolution (STORM, MINFLUX) is required to actually resolve the brush architecture — Möckl *et al.*, *Dev Cell* 2019 📎. GlycoQuant's "glycocalyx features" should be interpreted as shell-intensity readouts, not ultrastructural measurements.

---

## 2. Background subtraction — top-hat transform

**Module:** `glycoquant/preprocessing.py::subtract_background`.

Every intensity channel (WGA / YAP / paxillin / phalloidin) is background-corrected via `scipy.ndimage.white_tophat` with a 25-pixel square structuring element *before* any feature is extracted. DAPI is deliberately skipped — see the module docstring.

- The top-hat transform is the mathematical-morphology equivalent of ImageJ's "rolling ball" (Sternberg, *Computer* 1983 📎) and has been the standard illumination-correction step in CellProfiler since version 1.0 (Carpenter *et al.*, *Genome Biology* 2006 📎).
- Morphological profiling pipelines without some form of illumination correction are the single largest source of batch-effect contamination in Cell Painting datasets — see Caicedo *et al.*, *Nature Methods* 2017 📎 ("Data-analysis strategies for image-based cell profiling"). This is why GlycoQuant applies it unconditionally rather than exposing it as an optional toggle.
- The 25-pixel radius is chosen to be larger than any biological feature we want to preserve (cells, focal adhesions, pericellular shell) but smaller than the spatial scale of the illumination field. At ~0.3 µm/px it corresponds to ~7.5 µm — see `DEFAULT_BACKGROUND_RADIUS_PX`.

---

## 3. Glycocalyx features — pericellular shell quantification

**Module:** `glycoquant/features/glycocalyx.py`

### Features extracted per cell

| Feature | Definition | Citation |
|---|---|---|
| `glycocalyx_mean_intensity` | Mean WGA-lectin signal in the pericellular ring | Möckl 2019 📎 |
| `glycocalyx_heterogeneity` | Coefficient of variation (std / mean) in the ring | — |
| `glycocalyx_coverage` | Fraction of ring pixels above per-cell Otsu threshold | Otsu, *IEEE Trans Syst Man Cybern* 1979 📎 |
| `glycocalyx_pericellular_ratio` | Ring mean / cell-interior mean | Paszek 2014 📎 (conceptual) |
| `glycocalyx_radial_profile` | 20-bin mean intensity vs. radial distance from centroid | — |
| `glycocalyx_radial_decay_rate` | Slope of a log-linear fit to the radial profile | — |

### Adaptive ring width 🧪

The pericellular ring is built by `binary_dilation` of the cell mask for `ring_width_px` iterations. Historically this was a hard-coded 10-pixel value — biased toward cells near the diameter the user had in mind. GlycoQuant now computes it **per cell** as

```
ring_width = max(3, round(0.1 × equivalent_diameter_of_cell))
```

consistent with the empirical ~5–10% of cell radius reported for the endothelial glycocalyx by Möckl 2019. Small cells get thin rings; large cells get wide rings. The minimum floor of 3 px prevents pixel-discretisation artefacts from fragmenting the ring on tiny cells.

### NaN semantics 🧪

Every degenerate case (empty ring, zero-intensity interior, uniform-pixel distributions) returns `NaN` rather than a finite sentinel. Aggregations must use `np.nanmean` / `pandas skipna=True`, which is the convention in Caicedo 2017 📎. Silent zeros were biasing per-condition means toward zero whenever a single cell was mis-segmented — the standard failure mode of morphological profiling at scale.

---

## 4. YAP/TAZ — nuclear-to-cytoplasmic ratio

**Module:** `glycoquant/features/yap.py`

| Feature | Definition |
|---|---|
| `yap_nuclear_intensity` | Mean YAP signal inside the nuclear mask |
| `yap_cytoplasmic_intensity` | Mean YAP signal inside `cell − nucleus` |
| `yap_nc_ratio` | Nuclear / cytoplasmic mean ratio |
| `yap_nuclear_fraction` | `sum(nuclear)` / `sum(cell)` |

**Citation:** Dupont *et al.*, *Nature* 2011 📎 — the original YAP/TAZ mechanotransduction paper. N/C ratio is the published readout.

⚠️ **YAP N/C alone is insufficient.** Dupont 2011 has been qualified since: Elosegui-Artola *et al.*, *Cell* 2017 📎 showed YAP nuclear translocation depends on nuclear envelope tension, not direct mechanosensing; Panciera *et al.*, *Nat Rev Mol Cell Biol* 2017 📎 emphasised the importance of combining YAP with focal-adhesion maturation and actin coherence. GlycoQuant therefore pairs YAP features with **nuclear morphometry** (§6), focal-adhesion maturation (§5), and actin stress-fiber coherence (§7) so downstream analyses can build a composite mechanotransduction signature.

### NaN semantics 🧪

Earlier versions returned a finite sentinel (`1000.0`) when the cytoplasmic mask was zero-intensity. GlycoQuant now returns `NaN` for every degenerate case. Downstream users can compute a composite mechanoscore via `pandas.DataFrame.apply(np.nanmean)` without the sentinel dragging per-condition means toward 1000.

---

## 5. Focal adhesions — paxillin morphometrics

**Module:** `glycoquant/features/focal_adhesions.py`

| Feature | Definition |
|---|---|
| `fa_count` | Number of connected components surviving area filter |
| `fa_mean_area` | Mean component area (px²) — NaN when count = 0 |
| `fa_total_area` | Summed component area |
| `fa_mean_elongation` | Mean `axis_major / axis_minor` — mature FAs are elongated |
| `fa_mean_distance_to_edge` | Mean distance of centroids to cell boundary |
| `fa_peripheral_fraction` | Fraction of FAs within `peripheral_distance_px` of edge |

**Citation:** Kanchanawong *et al.*, *Nature* 2010 📎 — paxillin as an integrin-anchor marker; Zaidel-Bar *et al.*, *Nat Cell Biol* 2007 📎 — FA maturation staging by area + elongation + peripheral localisation.

### Adaptive thresholding 🧪

FA detection uses **per-cell Otsu** on paxillin signal restricted to the cell mask (`threshold_method="otsu"`, the default). Otsu picks the threshold that minimises within-class variance — it adapts to whatever staining intensity the user's microscope produces, so the FA count does not collapse to zero on dim images or saturate on bright ones. The fixed-threshold fallback (`threshold_method="fixed"`, cutoff 0.5) is preserved for unit tests that need deterministic behaviour.

### NaN semantics 🧪

- `fa_count = 0` is a **real signal** (non-adherent cell) and stays 0.
- `fa_total_area = 0` likewise.
- Every *per-FA* mean statistic (area, elongation, distance, peripheral fraction) is **NaN** when no FAs are detected, because the mean of an empty set is undefined. This prevents the "no FA" case from silently biasing per-condition means of elongation toward zero — which would have been misinterpreted as "cells in this condition have circular FAs".

---

## 6. Nuclear morphometry — orthogonal mechanotransduction readout

**Module:** `glycoquant/features/nuclear_morphology.py`

| Feature | Definition | Citation |
|---|---|---|
| `nuclear_area` | Nucleus area (px²) | Venturini 2020 📎 |
| `nuclear_perimeter` | Nucleus perimeter (px) | — |
| `nuclear_circularity` | `4π·area / perimeter²` | — |
| `nuclear_aspect_ratio` | Major / minor axis | Swift 2013 📎 |
| `nuclear_solidity` | `area / convex_hull_area` — low = wrinkled envelope | Lomakin 2020 📎 |
| `nuclear_eccentricity` | 0 = circle, 1 = line | — |
| `nuclear_to_cell_area_ratio` | Nucleus / cell body area | Venturini 2020 📎 |

### Why nuclear shape

The nuclear envelope is now recognised as a **primary mechanosensor** in its own right, complementing YAP/TAZ translocation:

- Swift *et al.*, *Science* 2013 📎 — lamin A/C scales with tissue stiffness and directly reports matrix mechanics.
- Lomakin *et al.*, *Nature* 2020 📎 — nuclear deformation (area, aspect ratio, envelope folding) triggers cPLA2-driven contractility. Nuclear solidity is the direct readout.
- Venturini *et al.*, *Science* 2020 📎 — nuclear area expansion tracks substrate stiffness in the absence of any YAP change.

Nuclear morphometry runs **on every image that has a nucleus mask** — no extra channel required. It is therefore the cheapest orthogonal mechanotransduction signal GlycoQuant can compute.

---

## 7. Actin cytoskeleton — structure tensor

**Module:** `glycoquant/features/actin.py`

| Feature | Definition |
|---|---|
| `actin_mean_intensity` | Mean phalloidin signal inside the cell |
| `actin_stress_fiber_coherence` | `(λ1 − λ2) / (λ1 + λ2)` of the 2D structure tensor — 0 isotropic, 1 perfectly aligned |
| `actin_dominant_orientation` | Dominant fiber orientation in degrees ∈ (−90, 90] |
| `actin_cortical_ratio` | Cortical ring / deep interior mean intensity |

**Citations:**
- Jähne, *Spatio-Temporal Image Processing* 1993 📎 — structure tensor foundation.
- Rezakhaniha *et al.*, *Biomech Model Mechanobiol* 2012 📎 — OrientationJ coherence metric on fibrillar structures.
- Püspöki *et al.*, in "Focus on Bio-Image Informatics" 2016 📎 — review of structure-tensor applications in biology.

Stress-fiber coherence is the standard phalloidin readout of contractile state: high-coherence cells have aligned stress fibers indicating sustained actomyosin tension, low-coherence cells have meshwork actin indicating a non-contractile state.

---

## 8. Cell morphology — pure shape descriptors

**Module:** `glycoquant/features/morphology.py`

| Feature | Definition |
|---|---|
| `cell_area` | Cell body area (px²) |
| `cell_perimeter` | Cell body perimeter (px) |
| `cell_circularity` | `4π·area / perimeter²` |
| `cell_aspect_ratio` | Major / minor axis |
| `cell_solidity` | `area / convex_hull_area` |
| `cell_spread_area` | Convex hull area |

Pure `skimage.measure.regionprops` descriptors. These carry the least risk of bias — there are no intensity thresholds or imaging-dependent choices — so they serve as the sanity-check baseline that every per-cell row is at least geometrically meaningful.

---

## 9. Deep embeddings — DINOv2

**Module:** `glycoquant/features/deep_embedding.py`

**Model:** `facebook/dinov2-base` (Oquab *et al.*, 2024, arXiv:2304.07193 📎). 86 M parameters, 768-dimensional CLS-token embedding, Apache 2.0 license.

Why DINOv2 and not a microscopy-specialist:
- **Self-supervised on a visually diverse corpus** — no domain bias toward any specific staining protocol.
- **Off-the-shelf frozen backbone** — no fine-tuning, no risk of overfitting to bundled demo data.
- **Publication-quality embeddings** — has been validated on Cell Painting (Fay *et al.*, biorxiv 2023 📎) and outperforms prior ImageNet ResNet features for unsupervised perturbation clustering.

Per-cell embedding protocol:
1. Bounding box around the cell mask + 8 px padding (captures pericellular context).
2. Three-channel stack: DAPI + WGA + YAP by default (configurable via `DinoV2Params.channel_assignment`).
3. Resize to 224 × 224, normalise, run through the frozen ViT.
4. Extract the CLS token from the final hidden state → 768-dim vector.

The 768-dim embedding is appended to every per-cell row as `deep_000..deep_767` columns when the user toggles "Include DINOv2 deep features" in Tab 1, and is intended for unsupervised discovery (UMAP clustering, perturbation similarity) — **not** for quantitative reporting in a Methods section, where the interpretable features in §3–8 are preferred.

---

## 10. Tab 2 — perturbation ranking priors

### Pathway prior (STRING v12)

**Module:** `glycoquant/predictor/pathway_score.py`

- STRING v12, Szklarczyk *et al.*, *Nucleic Acids Res* 2023 📎.
- Confidence cutoff ≥ 0.70 (high-confidence edges only).
- Edge weight `−log(confidence)`; aggregation via **median inverse shortest path** across the 15-gene mechanotransduction signature. Dijkstra on the weighted graph via NetworkX.

### Transcriptomic prior (Geneformer) — now **on-demand**

**Module:** `backend/modal_app.py::generate_geneformer_prior` + `scripts/generate_geneformer_priors.py`

- Geneformer V2, Theodoris *et al.*, *Nature* 2023 📎 — transformer pretrained on ~104 M single-cell transcriptomes.
- In-silico deletion of each glycocalyx gene against the 15-gene mechanotransduction signature, one-shot cosine-distance readout.
- The full 22 × 15 perturbation grid runs on a Modal L4 GPU in ~20-30 min at 5 000 reference cells. Weights and the Tabula Sapiens fibroblast reference dataset are cached on the persistent `glycoquant-models` Modal Volume so subsequent runs skip the downloads.
- **User-triggerable:** Tab 2 surfaces a **"Generate transcriptomic prior"** button when the backend reports `can_generate_geneformer=true` (i.e. `GLYCOQUANT_GPU_PROVIDER=modal`). Clicking it dispatches via `modal.Function.spawn`, the FastAPI backend registers the call in its `JobStore` and the frontend polls `/priors/geneformer/status/{job_id}` every 2 s until completion. No Colab, no manual steps.
- The result is written to `data/priors/geneformer_ranks.json` on the Railway backend, so the existing `prior_loader.load_prior` picks it up unchanged and the divergence column lights up on the next `/priors` query.

### Divergence — the actually informative column

`abs_rank_divergence = |rank_pathway − rank_geneformer|` is the scientifically interesting per-gene metric. Agreement between the two priors = uncontroversial ranking; disagreement = a wet-lab experiment that would discriminate between hypotheses. This is the column a PI should prioritise at the bench.

## 10.1 Dynamic image-aware re-ranking 🧪

**Module:** `glycoquant/predictor/dynamic_ranking.py`

Tab 2 is no longer a static table. When a Tab 1 analysis completes, its per-cell feature DataFrame is pushed into a tiny Zustand store. Tab 2 reads that store and POSTs the DataFrame to `/priors/contextual`, which:

1. **Computes an image-specific weight vector** over the 15-gene mechanotransduction signature. Each feature is mapped to the mechano genes it biologically reports on (curated map `FEATURE_TO_MECHANO` in the module, with a specific citation per line) and the image-level mean is z-scored against a bundled reference cohort — the mean and standard deviation of every feature across the three HPA demos, committed as `data/reference/mechano_reference.json`. The absolute z-scores are summed per mechano gene and L1-normalised into weights that sum to 1, with a minimum floor to prevent degenerate inputs from zeroing any gene.

2. **Re-aggregates the pathway prior** as a weighted median of the per-target inverse shortest-paths already shipped in `pathway_ranks.json`. Crucially, uniform weights reproduce the static `np.median` ranking exactly — this is the regression guardrail enforced by `tests/test_dynamic_ranking.py::test_uniform_weights_reproduce_static_ranking`. Ties preserve the static rank so the guarantee is byte-exact, not just order-exact.

3. **Re-aggregates the Geneformer prior identically** once it's available. Same weight vector, same weighted-median operator, applied to the Geneformer `per_mechano_gene` cosine-shift vectors. This is what makes the `abs_rank_divergence` column meaningful on a *per-image* basis: it reports where the two priors disagree **for the phenotype the user just observed**.

### Curated feature → mechano gene map

| Phenotype feature | Mechano genes it reports on | Citation |
|---|---|---|
| `yap_nc_ratio`, `yap_nuclear_fraction` | YAP1, WWTR1 | Dupont 2011 📎 |
| *(alias on `yap_nc_ratio`)* | CTGF, CYR61, ANKRD1 | Zanconato 2016 📎 |
| `fa_count`, `fa_mean_elongation`, `fa_peripheral_fraction`, `fa_mean_area` | ITGB1, PTK2, VCL, PXN, TLN1 | Kanchanawong 2010 📎, Zaidel-Bar 2007 📎 |
| `actin_stress_fiber_coherence`, `actin_cortical_ratio` | RHOA, ROCK1, ROCK2, MYL9 | Ridley 1992 📎, Maekawa 1999 📎 |
| `nuclear_solidity`, `nuclear_to_cell_area_ratio` | PIEZO1 | Lomakin 2020 📎, Venturini 2020 📎 |

### Why this matters

Without this layer, every user of Tab 2 sees the same **`CD44 > SDC4 > SDC2`** ranking regardless of whether their image shows massive YAP nuclear translocation, high-contractility actin, or a non-adherent rounded phenotype. The dynamic re-weighting closes the loop from image observation to experimental prioritisation hypothesis — it surfaces glycocalyx genes that sit topologically close to **whichever mechano axis is actually engaged in the user's image**. That is the difference between a curated table and an experimental planning tool.

---

## 11. Citations

All references are checked against PubMed / Google Scholar and can be cited directly in the statement of interest. DOIs below use the canonical venue link.

- 📎 Bray *et al.* — Cell Painting, *Nat Protoc* 2016, [10.1038/nprot.2016.105](https://doi.org/10.1038/nprot.2016.105)
- 📎 Caicedo *et al.* — Data analysis strategies for image-based profiling, *Nat Methods* 2017, [10.1038/nmeth.4397](https://doi.org/10.1038/nmeth.4397)
- 📎 Carpenter *et al.* — CellProfiler, *Genome Biol* 2006, [10.1186/gb-2006-7-10-r100](https://doi.org/10.1186/gb-2006-7-10-r100)
- 📎 Dupont *et al.* — YAP/TAZ mechanotransduction, *Nature* 2011, [10.1038/nature10137](https://doi.org/10.1038/nature10137)
- 📎 Elosegui-Artola *et al.* — Force triggers YAP nuclear entry via envelope flattening, *Cell* 2017, [10.1016/j.cell.2017.10.008](https://doi.org/10.1016/j.cell.2017.10.008)
- 📎 Fay *et al.* — DINOv2 for Cell Painting, biorxiv 2023, [10.1101/2023.11.23.568213](https://doi.org/10.1101/2023.11.23.568213)
- 📎 Jähne — *Spatio-Temporal Image Processing*, Springer 1993 — structure tensor formalism.
- 📎 Kanchanawong *et al.* — Paxillin architecture of focal adhesions, *Nature* 2010, [10.1038/nature09621](https://doi.org/10.1038/nature09621)
- 📎 Maekawa *et al.* — Rho-associated kinase phosphorylation of the myosin phosphatase target, *Science* 1999, [10.1126/science.285.5429.895](https://doi.org/10.1126/science.285.5429.895)
- 📎 Ridley & Hall — The small GTP-binding protein rho regulates the assembly of focal adhesions and actin stress fibers in response to growth factors, *Cell* 1992, [10.1016/0092-8674(92)90163-7](https://doi.org/10.1016/0092-8674(92)90163-7)
- 📎 Zanconato *et al.* — Genome-wide association between YAP/TAZ and gene regulation, *Genes Dev* 2016, [10.1101/gad.280701.116](https://doi.org/10.1101/gad.280701.116)
- 📎 Lomakin *et al.* — Nucleus as a mechanical gauge, *Nature* 2020, [10.1038/s41586-020-2574-4](https://doi.org/10.1038/s41586-020-2574-4)
- 📎 Möckl *et al.* — Super-resolution glycocalyx imaging, *Dev Cell* 2019, [10.1016/j.devcel.2019.02.020](https://doi.org/10.1016/j.devcel.2019.02.020)
- 📎 Oquab *et al.* — DINOv2, arXiv 2024, [2304.07193](https://arxiv.org/abs/2304.07193)
- 📎 Otsu — Threshold selection, *IEEE Trans Syst Man Cybern* 1979, [10.1109/TSMC.1979.4310076](https://doi.org/10.1109/TSMC.1979.4310076)
- 📎 Panciera *et al.* — Mechanobiology of YAP/TAZ, *Nat Rev Mol Cell Biol* 2017, [10.1038/nrm.2017.87](https://doi.org/10.1038/nrm.2017.87)
- 📎 Paszek *et al.* — Glycocalyx as a mechanical filter, *Nature* 2014, [10.1038/nature13535](https://doi.org/10.1038/nature13535)
- 📎 Püspöki *et al.* — Transforms and operators for directional bioimage analysis, "Focus on Bio-Image Informatics" 2016, [10.1007/978-3-319-28549-8_3](https://doi.org/10.1007/978-3-319-28549-8_3)
- 📎 Rezakhaniha *et al.* — Experimental investigation of collagen waviness, *Biomech Model Mechanobiol* 2012, [10.1007/s10237-011-0325-z](https://doi.org/10.1007/s10237-011-0325-z)
- 📎 Sternberg — Biomedical image processing, *Computer* 1983, [10.1109/MC.1983.1654163](https://doi.org/10.1109/MC.1983.1654163)
- 📎 Swift *et al.* — Nuclear lamin-A scales with tissue stiffness, *Science* 2013, [10.1126/science.1240104](https://doi.org/10.1126/science.1240104)
- 📎 Szklarczyk *et al.* — STRING v12, *Nucleic Acids Res* 2023, [10.1093/nar/gkac1000](https://doi.org/10.1093/nar/gkac1000)
- 📎 Theodoris *et al.* — Geneformer, *Nature* 2023, [10.1038/s41586-023-06139-9](https://doi.org/10.1038/s41586-023-06139-9)
- 📎 Venturini *et al.* — Nucleus as a mechanosensor through area change, *Science* 2020, [10.1126/science.aba2644](https://doi.org/10.1126/science.aba2644)
- 📎 Zaidel-Bar *et al.* — Hierarchical assembly of focal adhesions, *Nat Cell Biol* 2007, [10.1038/ncb1656](https://doi.org/10.1038/ncb1656)
