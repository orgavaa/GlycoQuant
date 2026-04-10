# GlycoQuant — Glycocalyx Mechanotransduction Analysis Platform

## What this is
A web-based platform (Streamlit) for the Labouesse group (ETH Zürich, Tibbitt Lab) to:
1. Upload fluorescence microscopy images → automated segmentation + glycocalyx & mechanotransduction feature extraction → interactive analytics dashboard
2. Rank glycocalyx gene perturbations by their predicted coupling to mechanotransduction using **two complementary pre-computed priors** — Geneformer V2 transcriptomic co-regulation and STRING/Reactome pathway proximity — with a divergence column highlighting where the priors disagree (the most informative experiments to run)
3. Gaussian-process active learning over tested perturbations to recommend the next experiment by maximum uncertainty reduction

**Scientific framing:** Tab 2 is a *hypothesis-ranking* tool, not a mechanistic predictor. No existing model knows that syndecan-1 shedding changes integrin clustering which changes YAP nuclear translocation — that causal chain does not exist in any training dataset. Geneformer provides a transcriptomic co-regulation prior from ~104M cells; STRING/Reactome provides an orthogonal, fully-auditable pathway-distance prior where every ranking is traceable to a specific PPI edge and paper. The divergence between the two priors is itself a scientifically informative signal. Rankings are **pre-computed offline** (Colab GPU for Geneformer, STRING REST API for pathway scores) and shipped as JSON; the Streamlit app performs **zero runtime inference** in Tab 2 — this guarantees the demo opens instantly and is fully reproducible.

Built as a PhD application deliverable by Valentin Uzan (github.com/VUzan-bio).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    STREAMLIT WEB APP                         │
│                                                              │
│  Tab 1: GlycoQuant Image Analysis                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Upload: DAPI / WGA-lectin / YAP / Paxillin / Actin │    │
│  │         ↓                                            │    │
│  │ Cellpose (cyto3) → cell + nucleus masks              │    │
│  │         ↓                                            │    │
│  │ Feature extraction per cell:                         │    │
│  │   • Glycocalyx: radial profile, heterogeneity,      │    │
│  │     coverage, pericellular intensity                 │    │
│  │   • YAP: nuclear/cytoplasmic ratio                   │    │
│  │   • Focal adhesions: count, area, elongation         │    │
│  │   • Actin: stress fiber coherence, orientation       │    │
│  │   • Morphology: area, circularity, aspect ratio      │    │
│  │         ↓                                            │    │
│  │ Dashboard: per-cell table + radial plots +           │    │
│  │ correlation heatmap + downloadable CSV               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Tab 2: Perturbation Prioritization                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Load pre-computed priors (data/priors/*.json):       │    │
│  │   • geneformer_ranks.json  (transcriptomic prior)    │    │
│  │   • pathway_ranks.json     (STRING/Reactome prior)   │    │
│  │         ↓                                            │    │
│  │ Dual-column ranking over 22 glycocalyx genes vs     │    │
│  │ 15-gene mechano signature:                           │    │
│  │   YAP1, WWTR1, CTGF, CYR61, ANKRD1,                 │    │
│  │   RHOA, ROCK1, ROCK2, MYL9,                          │    │
│  │   ITGB1, PTK2, VCL, PXN, TLN1, PIEZO1                │    │
│  │         ↓                                            │    │
│  │ Display:                                             │    │
│  │   • Col A: Geneformer rank + score                   │    │
│  │   • Col B: STRING pathway rank + score               │    │
│  │   • Col C: |rank_A − rank_B| divergence (highlight)  │    │
│  │ Per-gene drill-down: STRING edges + PubMed refs      │    │
│  │ Disclaimer banner: hypothesis ranking, not mechanism │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Tab 3: Experiment Designer (GP-based active learning)       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Input: existing perturbation results (from Tab 1)    │    │
│  │         ↓                                            │    │
│  │ Gaussian process over perturbation × phenotype space │    │
│  │         ↓                                            │    │
│  │ "Next best experiment": which KO to test next        │    │
│  │ based on maximum uncertainty reduction                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Runtime (required for `streamlit run`)
- Python 3.10+
- Streamlit (web UI)
- Cellpose (cell segmentation — `cellpose>=3.0`, `cyto3` model)
- scikit-image (feature extraction: `regionprops`, `structure_tensor`)
- numpy, pandas, scipy
- plotly (interactive plots in Streamlit)
- networkx (loaded from `pathway_ranks.json` for path visualization in drill-down)
- scikit-learn (Gaussian process for Tab 3 active learning)
- pyyaml (config loading)

### Notebook-only (offline prior generation, NOT required at runtime)
- transformers, torch — only for `notebooks/generate_geneformer_priors.ipynb` on Colab GPU
- geneformer (HuggingFace `ctheodoris/Geneformer`)
- anndata, scanpy, cellxgene-census — for loading the reference fibroblast dataset
- requests — for STRING REST API queries in `generate_pathway_priors.ipynb`

### Dev
- pytest, ruff, pre-commit

Torch/transformers live in an optional extras group (`pip install -e ".[notebooks]"`) so the base install for a PI cloning the repo is minimal.

## Project Structure
```
glycoquant/
├── .github/
│   └── workflows/
│       └── ci.yml                    # pytest + linting on PR
├── ARCHITECTURE.md
├── SPEC.md
├── README.md
├── pyproject.toml
├── configs/
│   └── default.yaml                  # All parameters
├── glycoquant/
│   ├── __init__.py
│   ├── segmentation/
│   │   ├── __init__.py
│   │   └── cellpose_wrapper.py       # Cellpose cell + nucleus segmentation
│   ├── features/
│   │   ├── __init__.py
│   │   ├── glycocalyx.py             # Radial profile, heterogeneity, coverage
│   │   ├── yap.py                    # Nuclear/cytoplasmic ratio
│   │   ├── focal_adhesions.py        # Paxillin morphometrics
│   │   ├── actin.py                  # Stress fiber coherence (structure tensor)
│   │   └── morphology.py             # Area, circularity, aspect ratio
│   ├── profiles/
│   │   ├── __init__.py
│   │   └── assembler.py              # Per-cell feature table → CSV
│   ├── predictor/
│   │   ├── __init__.py
│   │   ├── prior_loader.py           # Loads pre-computed Geneformer + pathway JSONs
│   │   ├── pathway_score.py          # STRING median inverse shortest-path scoring
│   │   ├── mechano_signature.py      # 15-gene mechanotransduction readout + 22 glycocalyx targets
│   │   └── active_learning.py        # GP-based experiment recommendation
│   ├── viz/
│   │   ├── __init__.py
│   │   ├── radial_profile.py         # Glycocalyx radial intensity plot (Tab 1)
│   │   ├── correlation_map.py        # Feature correlation heatmap (Tab 1)
│   │   ├── prior_table.py            # Dual-prior ranking table + drill-down heatmap (Tab 2)
│   │   └── recommendation.py         # GP active-learning ranked bar chart (Tab 3)
│   └── app/
│       ├── __init__.py
│       ├── main.py                   # Streamlit app entry point
│       ├── tab_imaging.py            # Tab 1: image analysis
│       ├── tab_prioritization.py     # Tab 2: dual-prior perturbation ranking
│       └── tab_experiment.py         # Tab 3: active learning
├── tests/
│   ├── conftest.py                   # Shared fixtures (synthetic images)
│   ├── test_segmentation.py
│   ├── test_features_glycocalyx.py
│   ├── test_features_yap.py
│   ├── test_features_fa.py
│   ├── test_features_actin.py
│   ├── test_features_morphology.py
│   ├── test_profiles.py
│   ├── test_predictor.py
│   └── test_active_learning.py
├── notebooks/
│   ├── demo.ipynb                    # End-to-end walkthrough
│   ├── generate_geneformer_priors.ipynb  # Offline: Colab/GPU, runs Geneformer V2 in silico perturbation over 22 glycocalyx genes × 15 mechano genes, writes data/priors/geneformer_ranks.json
│   └── generate_pathway_priors.ipynb     # Offline: queries STRING v12 REST API, computes median inverse shortest-path score, writes data/priors/pathway_ranks.json
├── data/
│   ├── demo/                         # Small demo images for testing
│   └── priors/
│       ├── geneformer_ranks.json     # Pre-computed transcriptomic prior (committed)
│       ├── pathway_ranks.json        # Pre-computed STRING/Reactome prior (committed)
│       └── pathway_evidence.json     # Per (glycocalyx_gene, mechano_gene) pair: top STRING edges + PubMed refs for drill-down UI
└── results/
    └── .gitkeep
```

## Git Workflow
- IMPORTANT: Use feature branches for every component: `feat/segmentation`, `feat/glycocalyx-features`, `feat/yap-features`, etc.
- IMPORTANT: Commit messages use imperative mood with prefix: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- IMPORTANT: Squash-merge feature branches to main via PR
- IMPORTANT: Tag releases: `v0.1.0` (GlycoQuant MVP), `v0.2.0` (+ predictor), `v0.3.0` (+ active learning)
- Branch naming: `feat/<component>`, `fix/<issue>`, `refactor/<scope>`
- Never commit directly to main
- Run `pytest` before every merge to main

## Build & Run
```bash
# Install
pip install -e ".[dev]"

# Run tests
pytest tests/ -v

# Launch platform
streamlit run glycoquant/app/main.py

# Run demo notebook
jupyter notebook notebooks/demo.ipynb
```

## Code Style
- Type hints on ALL function signatures
- Docstrings on ALL public functions (NumPy style)
- No function longer than 50 lines — split into helpers
- All image processing functions take numpy arrays, return numpy arrays
- All feature functions return dict[str, float] per cell
- Config via YAML — no hardcoded parameters

## Critical Design Decisions
- IMPORTANT: Cellpose (`cyto3` model) handles all segmentation. Do NOT reimplement. Standard `cellpose>=3.0`, not Cellpose-SAM — `cyto3` ships in the base package with zero extra dependencies.
- IMPORTANT: Feature extraction uses scikit-image only. No deep learning beyond Cellpose.
- IMPORTANT: **Tab 2 uses PRE-COMPUTED priors, no runtime inference.** Both rankings (Geneformer + pathway) are generated offline by the two notebooks in `notebooks/generate_*_priors.ipynb` and committed as JSON files in `data/priors/`. The Streamlit app loads these JSONs at startup via `prior_loader.py` and renders them. This guarantees: (a) instant tab load, (b) zero Windows/tokenizer/CUDA pain at demo time, (c) full reproducibility (regenerate by re-running the notebooks), (d) no GPU requirement for the app.
- IMPORTANT: **Geneformer V2 runs on Colab GPU, once, offline.** Use `ctheodoris/Geneformer` from HuggingFace, rank-value tokenization on a reference fibroblast scRNA-seq dataset (e.g., Tabula Sapiens fibroblast subset), in silico delete each of the 22 glycocalyx genes, measure cosine shift in the embedding of each of the 15 mechano genes, rank. Cache results as `geneformer_ranks.json`. If Geneformer tokenization fails on Colab, fall back to Geneformer V1. If both fail, Tab 2 ships with pathway prior only + a banner explaining the absence — still scientifically defensible.
- IMPORTANT: **Pathway score method is fixed and defensible.** For each glycocalyx gene *g* and each mechano gene *m*, shortest weighted path in STRING v12 (human, confidence ≥ 0.7, edge weight = −log(confidence)). Aggregate across the 15 mechano genes using **median inverse path length** (robust to a single strong link pulling the score). Every ranking is traceable to a specific STRING edge + Reactome pathway + PubMed reference, surfaced in the Tab 2 drill-down UI. No black box.
- IMPORTANT: **The divergence column is the novel contribution.** When Geneformer rank and pathway rank disagree strongly for a gene, that gene is flagged as a high-information experiment: the transcriptomic co-regulation signal diverges from the known PPI topology, and the wet-lab result will discriminate between the two priors. This framing is what makes the tab scientifically interesting rather than a generic heatmap.
- IMPORTANT: The Streamlit app must work on a laptop without GPU, offline (no network calls at runtime). All priors are local JSON.
- IMPORTANT: All visualizations use Plotly for interactivity in Streamlit (matplotlib is fine for notebook/export).
- IMPORTANT: Generate synthetic test images in `conftest.py` with known ground truth (`skimage.draw`) so tests don't depend on external data downloads.

## Gene Panels

### Glycocalyx genes (perturbation targets)
SDC1, SDC2, SDC3, SDC4, GPC1, GPC3, GPC4, GPC6, EXT1, EXT2, NDST1, NDST2,
HPSE (heparanase), GFPT1, GFPT2, OGT, MGAT5, B4GALT1, HAS1, HAS2, HAS3, CD44

### Mechanotransduction signature (15 readout genes)
YAP1, WWTR1 (TAZ), CTGF, CYR61, ANKRD1,
RHOA, ROCK1, ROCK2, MYL9,
ITGB1, PTK2 (FAK), VCL, PXN, TLN1,
PIEZO1

### Metabolic perturbations (drug/inhibitor)
2-DG (glycolysis), DON (glutamine → HBP), tunicamycin (N-glycosylation),
benzyl-GalNAc (O-glycosylation), PUGNAc (OGA inhibitor)

## Biological Context
This platform is designed for a PhD project studying how glycocalyx conformations modulate cell mechanotransduction, supervised by Dr. Céline Labouesse at ETH Zürich (Tibbitt group). The project starts in 2D to establish characterization, then extends to 3D hydrogel environments. Key biological references:

- Paszek et al., Nature 2014 — glycocalyx kinetic trap, integrin clustering
- Dupont et al., Nature 2011 — YAP/TAZ as mechanotransduction readout
- Möckl et al., Dev Cell 2019 — super-resolution glycocalyx imaging
- Bray et al., Nat Protoc 2016 — Cell Painting standardized profiling (framing reference)
