# GlycoQuant — Implementation Spec

## Phase 0: Project Scaffold
**Branch:** `feat/scaffold`
**Gate:** `pip install -e ".[dev]"` succeeds, `pytest --collect-only` finds tests, `streamlit run glycoquant/app/main.py` shows empty app with 3 tabs

- [ ] Create `pyproject.toml` with split dependency groups:
  ```
  [project]
  dependencies = [
    "streamlit",
    "cellpose>=3.0",
    "scikit-image",
    "numpy",
    "pandas",
    "scipy",
    "plotly",
    "networkx",
    "scikit-learn",
    "pyyaml",
  ]

  [project.optional-dependencies]
  dev = ["pytest", "ruff", "pre-commit"]
  notebooks = [
    "torch",
    "transformers",
    "geneformer",
    "anndata",
    "scanpy",
    "cellxgene-census",
    "requests",
    "jupyter",
  ]
  ```
  **Rationale:** `torch`/`transformers`/`geneformer` are only needed for the offline Colab prior generation notebook. The Streamlit runtime must NOT import them. A PI cloning the repo for the demo runs `pip install -e ".[dev]"` and gets a minimal, fast install.
- [ ] Create full directory structure from ARCHITECTURE.md
- [ ] Create `configs/default.yaml` with all parameters (segmentation thresholds, feature extraction params, gene panels)
- [ ] Create `glycoquant/app/main.py` — Streamlit skeleton with 3 tabs ("Image Analysis", "Perturbation Prioritization", "Experiment Designer"), each showing placeholder text. Tab 2 must NOT import `torch` or `transformers` — the runtime path is pure JSON + UI.
- [ ] Create `tests/conftest.py` with synthetic image fixtures:
  - `synthetic_cell_image()`: generates a 512×512 image with 5-10 circular "cells" with known properties using `skimage.draw`
  - `synthetic_nuclear_image()`: matching DAPI channel
  - `synthetic_glycocalyx_image()`: ring-like pericellular staining pattern
  - `synthetic_yap_image()`: nuclear + cytoplasmic signal with known N/C ratio
  - `synthetic_paxillin_image()`: small punctate structures at cell periphery
- [ ] Create placeholder test files with `pass` for each module
- [ ] `git init`, commit, create GitHub repo
- [ ] Verify: `pip install -e ".[dev]"`, `pytest --collect-only`, `streamlit run glycoquant/app/main.py`
- [ ] Merge to main via PR: `git checkout main && git merge --squash feat/scaffold`

---

## Phase 1: Cell Segmentation
**Branch:** `feat/segmentation`
**Gate:** `test_segmentation.py` passes — correctly segments synthetic cells, returns labeled mask with right number of cells

- [ ] `glycoquant/segmentation/cellpose_wrapper.py`:
  ```python
  class CellSegmenter:
      def __init__(self, model_type: str = "cyto3", gpu: bool = False):
          """Wraps Cellpose for cell + nucleus segmentation."""
      
      def segment_cells(self, image: np.ndarray, diameter: float | None = None) -> np.ndarray:
          """Returns labeled mask (0=background, 1..N=cell IDs)."""
      
      def segment_nuclei(self, dapi: np.ndarray, diameter: float | None = None) -> np.ndarray:
          """Returns labeled nuclear mask."""
      
      def segment_both(self, image: np.ndarray, dapi: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
          """Returns (cell_mask, nuclear_mask) with matched labels."""
  ```
- [ ] `tests/test_segmentation.py`:
  - Test on synthetic image: should find correct number of cells (±1)
  - Test that masks have correct shape
  - Test that cell and nuclear masks have matching labels
  - Test edge case: empty image returns empty mask
- [ ] Commit: `feat: add Cellpose cell and nucleus segmentation wrapper`
- [ ] Merge to main

---

## Phase 2: Glycocalyx Feature Extraction
**Branch:** `feat/glycocalyx-features`
**Gate:** `test_features_glycocalyx.py` passes — extracts correct radial profile from synthetic ring pattern

- [ ] `glycoquant/features/glycocalyx.py`:
  ```python
  def extract_glycocalyx_features(
      glycocalyx_channel: np.ndarray,
      cell_mask: np.ndarray,
      cell_id: int,
      n_radial_bins: int = 20
  ) -> dict[str, float]:
      """
      Returns:
          glycocalyx_mean_intensity: mean intensity in pericellular ring
          glycocalyx_heterogeneity: CV (std/mean) of pericellular intensity
          glycocalyx_coverage: fraction of cell perimeter with signal above threshold
          glycocalyx_pericellular_ratio: edge intensity / interior intensity
          glycocalyx_radial_profile: intensity as function of distance from centroid (list)
          glycocalyx_radial_decay_rate: exponential fit slope of radial profile
      """
  ```
  - Pericellular ring: dilate cell mask by N pixels, subtract original → ring ROI
  - Radial profile: bin pixels by distance from cell centroid, compute mean intensity per bin
  - Heterogeneity: coefficient of variation (std/mean) along the cell perimeter
  - Coverage: fraction of perimeter bins above intensity threshold (Otsu or percentile-based)
- [ ] `tests/test_features_glycocalyx.py`:
  - Synthetic ring image (bright ring around cell): pericellular_ratio should be > 1.0
  - Uniform image: heterogeneity should be ~0, coverage should be ~1.0
  - Empty cell (no glycocalyx): mean_intensity should be ~0
- [ ] Commit: `feat: add glycocalyx radial profiling and heterogeneity features`
- [ ] Merge to main

---

## Phase 3: Mechanotransduction Feature Extraction
**Branch:** `feat/mechano-features`
**Gate:** All feature tests pass — YAP N/C ratio correct on synthetic, FA count correct, actin coherence correct

- [ ] `glycoquant/features/yap.py`:
  ```python
  def extract_yap_features(
      yap_channel: np.ndarray,
      cell_mask: np.ndarray,
      nuclear_mask: np.ndarray,
      cell_id: int
  ) -> dict[str, float]:
      """
      Returns:
          yap_nuclear_intensity: mean YAP in nucleus
          yap_cytoplasmic_intensity: mean YAP in cytoplasm (cell minus nucleus)
          yap_nc_ratio: nuclear / cytoplasmic intensity ratio
          yap_nuclear_fraction: fraction of total YAP in nucleus
      """
  ```
  - Cytoplasmic mask = cell_mask[cell_id] AND NOT nuclear_mask[cell_id]
  - N/C ratio = mean nuclear intensity / mean cytoplasmic intensity

- [ ] `glycoquant/features/focal_adhesions.py`:
  ```python
  def extract_fa_features(
      paxillin_channel: np.ndarray,
      cell_mask: np.ndarray,
      cell_id: int,
      min_area: int = 5,
      max_area: int = 500
  ) -> dict[str, float]:
      """
      Returns:
          fa_count: number of focal adhesions
          fa_mean_area: mean FA area in pixels
          fa_total_area: total FA area
          fa_mean_elongation: mean major/minor axis ratio
          fa_mean_distance_to_edge: mean distance of FA centroids to cell boundary
          fa_peripheral_fraction: fraction of FAs within N pixels of cell edge
      """
  ```
  - Threshold paxillin within cell mask (Otsu or adaptive)
  - Label connected components, filter by area range
  - Use `skimage.measure.regionprops` for morphometrics

- [ ] `glycoquant/features/actin.py`:
  ```python
  def extract_actin_features(
      actin_channel: np.ndarray,
      cell_mask: np.ndarray,
      cell_id: int
  ) -> dict[str, float]:
      """
      Returns:
          actin_mean_intensity: mean actin signal
          actin_stress_fiber_coherence: orientation coherence (0=isotropic, 1=aligned)
          actin_dominant_orientation: dominant fiber angle (degrees)
          actin_cortical_ratio: cortical ring intensity / interior intensity
      """
  ```
  - Use `skimage.feature.structure_tensor` + `structure_tensor_eigenvalues` for coherence
  - Coherence = (λ1 - λ2) / (λ1 + λ2) where λ1, λ2 are eigenvalues
  - Cortical ratio: same ring logic as glycocalyx but on actin channel

- [ ] `glycoquant/features/morphology.py`:
  ```python
  def extract_morphology_features(
      cell_mask: np.ndarray,
      cell_id: int
  ) -> dict[str, float]:
      """
      Returns:
          cell_area: area in pixels
          cell_perimeter: perimeter in pixels
          cell_circularity: 4π × area / perimeter²
          cell_aspect_ratio: major_axis / minor_axis
          cell_solidity: area / convex_area
          cell_spread_area: area of convex hull
      """
  ```
  - Use `skimage.measure.regionprops` directly

- [ ] Tests for each module on synthetic images with known ground truth
- [ ] Commit each feature module separately: `feat: add YAP N/C ratio`, `feat: add FA morphometrics`, `feat: add actin coherence`, `feat: add cell morphology`
- [ ] Merge to main

---

## Phase 4: Profile Assembly + Visualization
**Branch:** `feat/profiles-viz`
**Gate:** `test_profiles.py` passes — assembles correct per-cell CSV from multi-channel synthetic image

- [ ] `glycoquant/profiles/assembler.py`:
  ```python
  class ProfileAssembler:
      def __init__(self, config: dict):
          self.segmenter = CellSegmenter(...)
      
      def process_image(
          self,
          channels: dict[str, np.ndarray],  # {"dapi": ..., "glycocalyx": ..., "yap": ..., ...}
      ) -> pd.DataFrame:
          """Process multi-channel image, return per-cell feature table."""
          # 1. Segment cells + nuclei
          # 2. For each cell: extract all features
          # 3. Assemble into DataFrame
          # 4. Return
      
      def process_batch(self, image_dir: str) -> pd.DataFrame:
          """Process all images in directory."""
  ```

- [ ] `glycoquant/viz/radial_profile.py`:
  - Plotly line plot: intensity vs distance from centroid, one line per cell or mean ± std
  
- [ ] `glycoquant/viz/correlation_map.py`:
  - Plotly heatmap: Pearson correlation between all features across cells
  - Highlight glycocalyx ↔ mechanotransduction correlations

- [ ] `glycoquant/viz/prior_table.py`:
  - For Tab 2: Plotly table/heatmap rendering the dual-prior dataframe (Geneformer rank, pathway rank, divergence) with conditional color on the |ΔRank| column
  - Per-gene drill-down heatmap: 2 rows (Geneformer, pathway) × 15 columns (mechano genes) for the selected glycocalyx gene

- [ ] `glycoquant/viz/recommendation.py`:
  - For Tab 3: ranked bar chart of candidate perturbations sorted by GP uncertainty (exploration) or predicted effect (exploitation), with error bars

- [ ] Tests: process synthetic multi-channel image → verify CSV has correct columns and rows
- [ ] Commit: `feat: add profile assembler and visualization modules`
- [ ] Merge to main

---

## Phase 5: Streamlit App — Tab 1 (Image Analysis)
**Branch:** `feat/app-imaging`
**Gate:** App runs, can upload an image, see segmentation overlay, feature table, radial plot, and download CSV

- [ ] `glycoquant/app/tab_imaging.py`:
  - File uploader (TIFF/PNG, multi-channel or separate channels)
  - Channel assignment UI: dropdown to map uploaded channels to DAPI/glycocalyx/YAP/paxillin/actin
  - "Run Analysis" button
  - Display:
    - Segmentation overlay (cell + nuclear masks on original image)
    - Per-cell feature table (sortable, filterable with st.dataframe)
    - Glycocalyx radial profile plot (Plotly, interactive)
    - Feature correlation heatmap
    - Download CSV button
  - Sidebar: segmentation parameters (cell diameter, model type)

- [ ] Use `st.cache_resource` for Cellpose model loading
- [ ] Use `st.cache_data` for feature extraction results
- [ ] Handle edge cases: no cells found, single channel only, corrupted image
- [ ] Commit: `feat: implement image analysis tab with full pipeline`
- [ ] Merge to main, tag `v0.1.0`

---

## Phase 6: Perturbation Prioritization — Tab 2 (pre-computed dual priors)
**Branch:** `feat/app-prioritization`
**Gate:** App loads both prior JSONs, renders dual-column ranking table with divergence column, drill-down panel shows STRING edges + PubMed references for a selected (glycocalyx, mechano) gene pair. Zero runtime model inference. Zero network calls. Tab opens in <1 second.

### Scientific framing (non-negotiable — applies to all UI copy and docstrings)
Tab 2 is a **hypothesis-ranking** tool, not a mechanistic predictor. No model knows that syndecan-1 shedding changes integrin clustering which changes YAP nuclear translocation — that causal chain does not exist in any training dataset. The tab provides two complementary priors and flags their disagreement as scientifically informative.

### 6.0 Offline prior generation (run BEFORE starting Phase 6 code, in parallel with Phase 5)

#### `notebooks/generate_geneformer_priors.ipynb` — run on Google Colab (GPU runtime)
- [ ] Load `ctheodoris/Geneformer` V2 from HuggingFace (`transformers` + `geneformer` package)
- [ ] Load a reference fibroblast scRNA-seq dataset (Tabula Sapiens fibroblast subset via `cellxgene-census`, ~5–10k cells is enough)
- [ ] Rank-value tokenize with the pretrained Geneformer tokenizer
- [ ] For each of the 22 glycocalyx genes:
  - In silico delete the gene from the rank-encoded input (set to zero expression, re-rank, re-tokenize)
  - Run forward pass, extract embeddings for the 15 mechano signature genes before and after deletion
  - Compute **cosine shift** per mechano gene: `1 − cos(emb_wt, emb_ko)`
- [ ] Rank the 22 glycocalyx genes by **median cosine shift across the 15 mechano genes** (median is robust)
- [ ] Write to `data/priors/geneformer_ranks.json` with schema:
  ```json
  {
    "metadata": {
      "model": "ctheodoris/Geneformer",
      "version": "V2",
      "dataset": "tabula_sapiens_fibroblast",
      "n_cells": 5000,
      "generated_utc": "2026-04-xx",
      "colab_runtime": "T4 GPU"
    },
    "genes": {
      "SDC1": {
        "rank": 3,
        "median_cosine_shift": 0.142,
        "per_mechano_gene": {"YAP1": 0.18, "WWTR1": 0.15, ...}
      },
      ...
    }
  }
  ```
- [ ] **Fallback ladder if Geneformer V2 tokenization fails on Colab:**
  1. Try Geneformer V1 (smaller, older tokenizer — often more stable)
  2. If V1 also fails: ship Tab 2 with **pathway prior only**, banner at top explains Geneformer column is unavailable in this build and points to the notebook for regeneration. Scientifically still defensible.

#### `notebooks/generate_pathway_priors.ipynb` — runs locally, no GPU
- [ ] Query STRING v12 REST API (`https://string-db.org/api/json/network`) for the full network restricted to: 22 glycocalyx genes + 15 mechano genes + their 1-hop neighborhood, species = 9606 (human), confidence threshold = 0.7
- [ ] Build a weighted `networkx.Graph` with edge weight = `−log(confidence)` (so high confidence = short distance)
- [ ] For each (glycocalyx_gene *g*, mechano_gene *m*) pair:
  - Compute shortest weighted path length `d(g, m)` via `nx.dijkstra_path_length`
  - Record the actual path (list of intermediate nodes) for the drill-down UI
- [ ] For each glycocalyx gene *g*, compute **median inverse path length** across the 15 mechano genes:
  `score(g) = median_{m ∈ mechano} (1 / (1 + d(g, m)))`
  Rank the 22 glycocalyx genes by descending score.
- [ ] Write `data/priors/pathway_ranks.json`:
  ```json
  {
    "metadata": {
      "source": "STRING v12",
      "confidence_threshold": 0.7,
      "species": 9606,
      "aggregation": "median_inverse_shortest_path",
      "generated_utc": "2026-04-xx"
    },
    "genes": {
      "SDC1": {
        "rank": 2,
        "score": 0.38,
        "per_mechano_gene": {
          "YAP1": {"distance": 2.1, "inverse": 0.323, "path": ["SDC1", "ITGB1", "PTK2", "YAP1"]},
          ...
        }
      },
      ...
    }
  }
  ```
- [ ] Write `data/priors/pathway_evidence.json`: per (g, m) pair, the top 3 STRING edges in the shortest path with their individual confidence scores, Reactome pathway annotations (via the STRING `interaction_partners` endpoint or Reactome ContentService), and PubMed IDs for the strongest edge (via STRING's `actions` endpoint which returns supporting publications)

### 6.1 Runtime code (no model loading, pure JSON + UI)

- [ ] `glycoquant/predictor/mechano_signature.py` — pure constants module:
  ```python
  GLYCOCALYX_GENES: list[str] = [...]  # 22 genes, from config
  MECHANO_SIGNATURE: list[str] = [...]  # 15 genes, from config
  METABOLIC_INHIBITORS: dict[str, dict[str, str]] = {...}  # 5 drugs, from config

  def validate_gene_panels(config: dict) -> None:
      """Assert config matches expected panel sizes. Raise on mismatch."""
  ```

- [ ] `glycoquant/predictor/prior_loader.py`:
  ```python
  from dataclasses import dataclass
  import json
  from pathlib import Path

  @dataclass(frozen=True)
  class GeneRanking:
      gene: str
      rank: int
      score: float
      per_mechano: dict[str, float]

  @dataclass(frozen=True)
  class PriorTable:
      source: str                          # "geneformer" | "pathway"
      metadata: dict
      rankings: dict[str, GeneRanking]     # keyed by glycocalyx gene symbol
      available: bool                      # False if prior file missing (graceful Geneformer fallback)

  def load_prior(path: Path, source: str) -> PriorTable:
      """Load a pre-computed prior JSON. Returns PriorTable with available=False
      if file missing, so Tab 2 can render pathway-only with a banner."""

  def compute_divergence(
      geneformer: PriorTable,
      pathway: PriorTable,
  ) -> dict[str, int]:
      """Per glycocalyx gene, return |rank_geneformer − rank_pathway|.
      If one prior is unavailable, return empty dict and the UI shows pathway only.
      """
  ```

- [ ] `glycoquant/predictor/pathway_score.py`:
  ```python
  def median_inverse_shortest_path(
      graph: "networkx.Graph",
      source_gene: str,
      target_genes: list[str],
  ) -> tuple[float, dict[str, dict]]:
      """Core scoring function. Used by generate_pathway_priors.ipynb.
      Returns (median_inverse_score, per_target_details_dict).
      Kept in the package (not only in the notebook) so it is unit-testable.
      """
  ```

- [ ] `glycoquant/app/tab_prioritization.py` — Streamlit tab:
  - Header: title "Perturbation Prioritization"
  - **Disclaimer banner** (`st.info`): *"These rankings reflect transcriptomic co-regulation (Geneformer, 104M cells) and curated pathway proximity (STRING v12). They generate hypotheses for experimental validation — not mechanistic predictions. When the two priors disagree, the divergence is the most informative signal on this page."*
  - If `geneformer_ranks.json` missing → `st.warning` banner explaining pathway-only mode
  - Main table (`st.dataframe`, sortable): columns = `Gene | Geneformer Rank | Geneformer Score | Pathway Rank | Pathway Score | |ΔRank|`. Rows = 22 glycocalyx genes. Conditional formatting: highlight top divergence rows in amber.
  - Per-gene drill-down (below the table, triggered by a `st.selectbox` of the 22 genes):
    - Heatmap (Plotly): 1 row × 15 columns, showing per-mechano-gene score for the selected gene, side-by-side Geneformer row and pathway row
    - Evidence panel: for the selected gene's top-ranked mechano target by pathway, show the shortest path as a list (e.g., `SDC1 → ITGB1 → PTK2 → YAP1`), with STRING confidence per edge and PubMed links from `pathway_evidence.json`
  - Metabolic inhibitor section (below drill-down): a separate table showing the 5 inhibitors, their primary target gene(s), and the corresponding prior rankings of those targets — so the user can see "if I perturb the HBP pathway via DON, the target is GFPT1, which ranks Nth in pathway prior"
  - Use `st.cache_data` on `load_prior` calls keyed by file path + mtime

- [ ] `tests/test_prior_loader.py`:
  - Write synthetic `geneformer_ranks.json` and `pathway_ranks.json` to a `tmp_path`, load them, assert 22 genes each, assert rankings are consistent (1..22), assert schema validation
  - Test `compute_divergence`: construct two priors with known ranks, assert divergence dict matches expected absolute differences
  - Test graceful fallback: missing Geneformer file → `PriorTable(available=False)`, `compute_divergence` returns `{}`

- [ ] `tests/test_pathway_score.py`:
  - Build a tiny synthetic `networkx.Graph` (5 nodes, known weights), call `median_inverse_shortest_path`, assert the median matches hand-computed value
  - Test edge case: target gene unreachable → distance = infinity, inverse = 0, still handled
  - Test edge case: source == target → distance = 0, inverse = 1.0

- [ ] Commit sequence:
  1. `feat: add prior loader and pathway scoring module`
  2. `feat: implement dual-prior prioritization tab with divergence column`
  3. `docs: add offline Geneformer and pathway prior generation notebooks`
- [ ] Merge to main, tag `v0.2.0`

### What this phase explicitly does NOT include
- No `GeneformerPredictor` class with runtime model loading
- No HuggingFace download at app startup
- No `transformers` / `torch` import in the Streamlit runtime path (can remain a dev dependency for the notebooks, but `tab_prioritization.py` must not import them)
- No GPU requirement
- No network calls in the Streamlit app — all STRING queries happen offline in the notebook

---

## Phase 7: Active Learning — Tab 3
**Branch:** `feat/app-experiment`
**Gate:** App shows experiment recommendations from GP model on synthetic data

- [ ] `glycoquant/predictor/active_learning.py`:
  ```python
  class ExperimentDesigner:
      def __init__(self):
          self.gp = GaussianProcessRegressor(kernel=Matern(nu=2.5))
      
      def fit(self, X: np.ndarray, y: np.ndarray):
          """Fit GP on existing perturbation results.
          X: perturbation embeddings (from KG or one-hot)
          y: phenotype vectors (from GlycoQuant features)
          """
      
      def recommend_next(self, candidates: list[str], n: int = 3) -> list[dict]:
          """Return top-n perturbations to test next,
          ranked by maximum predicted uncertainty (exploration)
          or maximum predicted effect (exploitation).
          """
  ```

- [ ] `glycoquant/app/tab_experiment.py`:
  - Upload existing results (CSV from Tab 1 with perturbation labels)
  - Or: manually enter results for tested perturbations
  - Toggle: exploration (highest uncertainty) vs exploitation (highest predicted effect)
  - Display:
    - Perturbation space UMAP/PCA with tested (solid) and untested (hollow) points
    - Uncertainty heatmap
    - Ranked recommendation: "Test SDC3 next — highest uncertainty given SDC1 and SDC2 results"
    - Projected improvement: "Testing SDC3 is predicted to reduce overall uncertainty by X%"

- [ ] `tests/test_active_learning.py`:
  - Fit GP on 5 synthetic perturbations → recommend should return untested perturbation
  - Uncertainty should decrease as more data is added
  - Edge case: no data yet → cold-start recommendation uses the **pathway prior** rank as a deterministic ordering (interpretable, auditable), with Geneformer divergence used as a secondary tiebreaker when available. Rationale: a PI asking "why did you recommend SDC3 first?" gets a traceable answer (STRING shortest path) rather than a black-box embedding shift.

- [ ] Commit: `feat: implement GP-based active learning for experiment design`
- [ ] Merge to main, tag `v0.3.0`

---

## Phase 8: Polish + README + Demo
**Branch:** `feat/polish`
**Gate:** README is compelling, demo notebook runs end-to-end in <5 min, all tests green, app launches clean

- [ ] `README.md`:
  - Project title + one-line description
  - Architecture diagram (Mermaid or ASCII)
  - Screenshot of app (take actual screenshot from running app)
  - Installation: `pip install -e .` then `streamlit run glycoquant/app/main.py`
  - Quick start: 3-step guide
  - Biological context: 2 paragraphs linking to Labouesse/Tibbitt work
  - Feature list with examples
  - Roadmap: morphological perturbation atlas, COBRA flux model, polymer-brush PINN
  - References: Paszek 2014, Dupont 2011, Möckl 2019, Bray 2016
  - License: MIT
  - Author: Valentin Uzan

- [ ] `notebooks/demo.ipynb`:
  - Load demo images (synthetic via `skimage.draw` or a small public dataset)
  - Run segmentation → feature extraction → profile assembly → per-cell CSV
  - Show radial profile + correlation heatmap
  - Load pre-computed priors from `data/priors/*.json` (NOT re-run Geneformer)
  - Render the dual-prior ranking table + divergence column for the 22 glycocalyx genes
  - Show pathway drill-down for one high-divergence gene (SDC1 or EXT1)
  - Run GP active learning on synthetic perturbation results with pathway cold-start
  - Total runtime: <5 min on laptop, zero GPU, zero network
  - **Separate notebook (not part of `demo.ipynb`):** `generate_geneformer_priors.ipynb` documents how the Geneformer JSON was produced; link it from the README so the pipeline is fully reproducible without being part of the demo path.

- [ ] CI: `.github/workflows/ci.yml` — run pytest + ruff on every PR
- [ ] Clean git history, ensure every PR is squash-merged
- [ ] Final tag: `v1.0.0`
- [ ] Commit: `docs: add README, demo notebook, CI workflow`
- [ ] Merge to main

---

## Explicit non-goals
- No model training anywhere in the repo (Geneformer is used offline, inference-only, on Colab)
- No Geneformer loading at Streamlit runtime — all priors pre-computed as JSON
- No `torch`/`transformers` import in `glycoquant/app/` or `glycoquant/predictor/prior_loader.py`
- No network calls in the Streamlit app (STRING queries happen offline in the notebook)
- No scRNA-seq data processing in the app (conditional on future experiments in the PhD itself)
- No GPU requirement for the demo
- No JEPA/foundation model training
- No cross-modal alignment (future work, PhD year 2–3, not application scope)
- No live mechanistic predictions framed as ground truth — Tab 2 is explicit hypothesis-ranking
