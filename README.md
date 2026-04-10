# GlycoQuant

> **Standardized per-cell phenotyping of the glycocalyx and mechanotransduction state from multi-channel fluorescence microscopy.**

GlycoQuant is an open-source platform for quantitative analysis of how the cell-surface glycocalyx couples to mechanotransduction. It segments individual cells in a five-channel confocal image, extracts 26 interpretable per-cell features spanning glycocalyx morphology, YAP/TAZ translocation, focal-adhesion maturation, actin cytoskeletal organisation, and cell shape, and — optionally — augments them with 768-dimensional learned embeddings from a DINOv2 vision transformer. Perturbations of the glycocalyx can then be prioritised against a dual, pre-computed prior (Geneformer transcriptomic co-regulation + STRING/Reactome pathway proximity) whose disagreement is itself the most informative experimental signal.

The platform is designed for wet-lab biologists. Every interpretable number it produces is the kind a PI can put in a Methods section (`YAP N/C = 1.82 ± 0.14`, `focal-adhesion count = 12`), and every learned output is explicitly framed as a hypothesis generator — not a mechanistic predictor.

---

## Motivation

The glycocalyx is a dense layer of glycopolymers — heparan-sulfate proteoglycans, mucins, hyaluronan, glycolipids — tethered to the cell surface. Paszek et al. (*Nature* 2014) showed that a bulky glycocalyx promotes integrin clustering and transforms force transmission through a "kinetic trap" mechanism, linking glycocalyx architecture to mechanotransduction output. Dupont et al. (*Nature* 2011) established the YAP/TAZ nuclear-cytoplasmic ratio as the canonical readout of mechanical activation. Möckl et al. (*Dev Cell* 2019) subsequently showed with super-resolution microscopy that glycocalyx spatial organisation is heterogeneous at the 50–500 nm scale — a regime not resolvable by conventional confocal but whose *pericellular intensity distribution* is, and is measurable with standard immunofluorescence.

Despite this biology, there is no standardised, open-source image-analysis pipeline for glycocalyx–mechanotransduction coupling. Cell Painting (Bray et al., *Nat Protoc* 2016) and JUMP-CP (Chandrasekaran et al., *Nat Methods* 2024) gave the field standardised morphological profiling at compound scale, but neither targets glycocalyx-specific staining. GlycoQuant fills that gap at the scale a single experimental group actually works at: an interactive Streamlit application that a PI can open in a browser, load their own multi-channel TIFF, and obtain per-cell features, group-level plots, and a downloadable CSV within 30 seconds of the first click.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        STREAMLIT WEB APPLICATION                      │
│                                                                        │
│  Tab 1 — IMAGE ANALYSIS                                               │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Upload TIFF / PNG   │   Load bundled demo  (control / siSDC1 │  │
│  │    (5 channels)      │                       / heparinase)    │  │
│  │             ↓                                                  │  │
│  │  Channel mapping:    DAPI · WGA-lectin · YAP · paxillin ·     │  │
│  │                      phalloidin                                │  │
│  │             ↓                                                  │  │
│  │  Cellpose-SAM (cpsam)  →   cell masks + matched nuclear masks │  │
│  │             ↓                                                  │  │
│  │  Per-cell feature extraction (parallel tracks):               │  │
│  │                                                                │  │
│  │     scikit-image  ─→  6 glycocalyx + 4 YAP + 6 FA + 4 actin  │  │
│  │     (interpretable)    + 6 morphology  =  26 scalar features  │  │
│  │                                                                │  │
│  │     DINOv2-base   ─→  768-dim learned embedding per cell     │  │
│  │     (optional)        (3-channel stack: DAPI + WGA + YAP)    │  │
│  │             ↓                                                  │  │
│  │  Interactive output:                                          │  │
│  │   • Plotly image with toggleable overlays (cells, nuclei,    │  │
│  │     focal adhesions, glycocalyx ring, actin orientation)     │  │
│  │   • Bidirectional cross-highlighting between image ↔ table  │  │
│  │   • Radial profile plot · Pearson correlation heatmap        │  │
│  │   • UMAP of DINOv2 embeddings (when deep features enabled)  │  │
│  │   • CSV download                                             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  Tab 2 — PERTURBATION PRIORITIZATION                                  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Pre-computed JSON priors (no runtime model loading):         │  │
│  │     • data/priors/pathway_ranks.json    (STRING v12)          │  │
│  │     • data/priors/geneformer_ranks.json (optional, Colab)     │  │
│  │             ↓                                                  │  │
│  │  Dual-column ranking over 22 glycocalyx genes × 15-gene       │  │
│  │  mechanotransduction signature                                │  │
│  │             ↓                                                  │  │
│  │  |ΔRank| divergence column  →  highest-information targets   │  │
│  │             ↓                                                  │  │
│  │  Drill-down: STRING shortest-path edges + confidences         │  │
│  │  Metabolic inhibitor panel (2-DG, DON, tunicamycin, etc.)    │  │
│  │  Disclaimer: hypothesis ranking, not mechanistic prediction   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  Tab 3 — EXPERIMENT DESIGNER                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Gaussian-process active learning for next-experiment         │  │
│  │  recommendation over tested perturbations.                    │  │
│  │  Planned for a future release.                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Library / UI separation

```
glycoquant/
├── segmentation/      # Cellpose-SAM wrapper, matched cell + nucleus labels
├── features/          # Per-cell extractors (scikit-image + DINOv2 deep track)
├── profiles/          # ProfileAssembler → flat pandas DataFrame per image
├── predictor/         # Dual-prior loader + STRING shortest-path scoring
├── viz/               # Plotly figure factories — Streamlit-free, testable
├── io/                # TIFF/PNG loading, channel splitting, hashing
└── app/               # The only Streamlit surface (main.py + tab_*.py)
scripts/               # One-time offline artifacts (not runtime)
  ├── generate_demo_images.py
  ├── generate_pathway_priors.py
  └── generate_geneformer_priors.py
data/
  ├── demo/            # Bundled synthetic TIFFs (control / siSDC1 / heparinase)
  └── priors/          # Committed STRING v12 rankings + pathway evidence
tests/                 # 167 tests (pytest), <1 min on a warm cache
```

Every computational layer below `glycoquant/app/` is Streamlit-free and unit-testable in isolation. The viz factories return plain `plotly.graph_objects.Figure` instances and can be reused outside the app.

---

## Installation

```bash
git clone https://github.com/orgavaa/GlycoQuant.git
cd GlycoQuant
python -m venv .venv
source .venv/Scripts/activate        # Windows (Git Bash / miniforge)
#  or: source .venv/bin/activate     # macOS / Linux
pip install -e ".[dev]"
streamlit run glycoquant/app/main.py
```

### System requirements

| Requirement | Detail |
|---|---|
| Python | 3.10+ (tested on 3.13.12) |
| Architecture | **x86_64** — required because `opencv-python-headless` (a Cellpose dependency) has no Windows ARM64 wheels on PyPI. On Windows-on-ARM use miniforge3 x86_64 under emulation, or WSL2. |
| Cellpose-SAM weights | ~1.2 GB downloaded on first use, cached at `~/.cellpose/models/cpsam` |
| DINOv2 weights (optional) | ~340 MB downloaded on first use, cached at `~/.cache/huggingface/hub/models--facebook--dinov2-base` |
| GPU | Not required. CPU inference is slower but supported throughout. |
| Network at runtime | None. The app is fully offline after the weights are cached. |

---

## Quick start

1. **Launch** the app:
   ```bash
   streamlit run glycoquant/app/main.py
   ```
2. **Tab 1** → sidebar → select `control` under *Load demo image* → click **Load demo image**.
3. Optionally tick *Include DINOv2 deep features*.
4. Click **Run Analysis**.

Within ~30 seconds you will see a segmentation overlay on the actin channel, a per-cell feature table with 26 columns (or 794 if the DINOv2 toggle is on), an interactive radial-profile plot of glycocalyx intensity, a Pearson correlation heatmap across all features, and a CSV download button. Toggling any of the five overlays (cells, nuclei, focal adhesions, glycocalyx ring, actin orientation) renders the corresponding shapes directly on the image; clicking a cell cross-highlights the matching row in the feature table and vice versa.

---

## Per-cell features

Every cell in every image is described by 26 interpretable scalar features, grouped into five scientifically motivated categories. With the DINOv2 toggle enabled, a 768-dimensional learned embedding from `facebook/dinov2-base` is appended as additional columns.

| Group | Features | Rationale |
|---|---|---|
| **Glycocalyx** (6) | mean pericellular intensity · heterogeneity (CV of ring) · coverage (fraction above Otsu/percentile/fixed threshold) · pericellular/interior ratio · radial intensity profile · exponential decay rate | Quantifies the shell of WGA-lectin staining around each cell — the actually-measurable readout of glycocalyx conformation at confocal resolution. |
| **YAP / TAZ** (4) | mean nuclear intensity · mean cytoplasmic intensity · nuclear/cytoplasmic ratio (capped finite sentinel) · fraction of total YAP in nucleus | Canonical mechanotransduction readout (Dupont *et al.* 2011). The N/C ratio is the primary published metric. |
| **Focal adhesions** (6) | count · mean area · total area · mean elongation (`axis_major / axis_minor`) · mean centroid distance to cell edge · peripheral fraction (fraction within *N* px of edge) | Paxillin-stained integrin anchors. Mature, elongated, peripheral FAs indicate force-transmitting adherent cells. |
| **Actin cytoskeleton** (4) | mean intensity · stress-fiber coherence (structure-tensor eigenvalue ratio, 0 → isotropic, 1 → aligned) · dominant fiber orientation (degrees, (−90, 90]) · cortical/interior intensity ratio | Quantifies stress-fiber organisation via the local structure tensor — the standard OrientationJ-style analysis. |
| **Cell morphology** (6) | area · perimeter · circularity (`4π·area / perimeter²`) · aspect ratio · solidity (`area / convex_area`) · spread area (convex hull) | Pure shape descriptors via `skimage.measure.regionprops`. Baseline context for all other features. |

**Deep features (optional, `Include DINOv2 deep features` toggle):** 768-dimensional CLS-token embedding per cell from `facebook/dinov2-base`. Each cell's bounding box is padded, stacked as three channels (DAPI + WGA + YAP by default), resized to 224 × 224 and passed through the frozen ViT. Channel assignment is configurable. License: Apache 2.0. Intended for discovery analyses (UMAP clustering, perturbation similarity) — **not** for quantitative reporting in a Methods section.

---

## Scientific framing of Tab 2

Tab 2 is explicitly a **hypothesis-ranking tool**, not a mechanistic predictor. No existing transcriptomic model knows that syndecan-1 shedding changes integrin clustering which changes YAP nuclear translocation — that causal chain does not exist in any training dataset available today. Instead, the tab combines two orthogonal precomputed priors:

1. **Transcriptomic co-regulation prior** — Geneformer (Theodoris *et al.*, *Nature* 2023), a transformer pretrained on ~104 M single-cell transcriptomes, used for in-silico deletion of each glycocalyx gene against the 15-gene mechanotransduction signature. Runs once offline on a Colab GPU via `scripts/generate_geneformer_priors.py` and writes a JSON the app loads at startup.
2. **Pathway proximity prior** — STRING v12 (Szklarczyk *et al.*, *Nucleic Acids Res* 2023) restricted to confidence ≥ 0.70, with edge weight `−log(confidence)` and a **median inverse shortest-path** aggregation across the 15 mechano genes. Every ranking traces to a specific STRING edge with a specific confidence score, visible in the drill-down panel.

The **divergence column** `|rank_geneformer − rank_pathway|` is the most scientifically informative number in the tab. When the two priors agree, the ranking is uncontroversial. When they disagree — a gene ranked 1st by transcriptomic co-regulation but 18th by PPI topology, or vice versa — the wet-lab experiment will actively discriminate between the two hypotheses. Those high-divergence rows are the ones a PI should prioritise at the bench.

Real STRING v12 data for the current 22-gene glycocalyx panel and 15-gene mechano signature is committed to the repository. CD44 and the syndecans come out as the most pathway-proximal glycocalyx genes (scores 0.91–0.94); the hexosamine-pathway enzymes (GFPT1/2, OGT, MGAT5, B4GALT1) sit at score 0.0 — they are disconnected from the mechanotransduction signature in STRING at confidence 0.70, despite being mechanistically central to glycosylation control. This is exactly the kind of asymmetry the Geneformer prior is expected to flag differently.

---

## Reproducibility

Everything in `data/priors/` and `data/demo/` is either committed or regenerable by a single scripted command.

```bash
# Regenerate the bundled synthetic demo TIFFs (deterministic, ~1 s)
python scripts/generate_demo_images.py

# Regenerate the STRING v12 pathway prior (network → string-db.org, ~30 s)
python scripts/generate_pathway_priors.py

# Regenerate the Geneformer transcriptomic prior (Colab GPU runtime required)
# — scaffold only; fill in InSilicoPerturber details on Colab
python scripts/generate_geneformer_priors.py
```

```bash
# Run the full non-slow test suite (~1 min on a warm cache)
pytest tests/ -m "not slow"

# Run the segmentation suite separately (real Cellpose-SAM inference, ~15 min cold)
pytest tests/test_segmentation.py -v

# Lint
ruff check glycoquant/ tests/ scripts/
```

Synthetic fixtures in `tests/conftest.py` give deterministic ground truth for every extractor — no external data dependencies, no network calls, no GPU requirement in CI. The rare slow-tier tests (real Cellpose-SAM inference on synthetic images; real DINOv2 embedding of cell crops) are marked with `pytest.mark.slow` and skipped in fast iteration.

---

## Roadmap

### Shipped

- **v0.1.0** — Phase 5: Tab 1 dynamic image analysis with per-cell overlays, cross-highlighting, and optional DINOv2 deep features
- **v0.2.0** — Phase 6: Tab 2 perturbation prioritization with the STRING pathway prior, divergence column, drill-down, and metabolic inhibitor panel

### Planned

- **v1.0.0** — Phase 8: README polish, CI workflow, three bundled app screenshots, final literature verification sweep
- **Tab 3 — Experiment Designer** — Gaussian-process active learning for next-experiment recommendation over tested perturbations. Deferred from the initial release.
- **Phase 5.5** — Fine-tuning the DINOv2 linear probe on Human Protein Atlas glycocalyx-protein imagery for glycocalyx-specialised embeddings; side-by-side benchmark against Recursion's OpenPhenom-S/16

### Longer-horizon research directions

- **Morphological perturbation atlas** — GlycoQuant features across genetic (siRNA), enzymatic (heparanase), and metabolic (2-DG, DON, tunicamycin) perturbations, clustered into phenotypic groups à la JUMP-CP at lab scale
- **Hexosamine pathway flux model** — COBRApy / Recon3D flux balance analysis linking metabolic perturbations to predicted glycocalyx composition, validated against GlycoQuant measurements
- **Bayesian experimental design** — active learning (IterPert-style, Gruver *et al.*, RECOMB 2024) to prioritise conditions across the combinatorial space of scaffold, perturbation, and drug; Ax/BoTorch multi-objective optimisation of hydrogel composition (Seifermann *et al.*, *Small Methods* 2023)
- **Polymer-brush physics-informed neural network** — predicting glycocalyx mechanical-filter properties (brush height, compression modulus, integrin accessibility) from composition, with Alexander–de Gennes scaling as a soft constraint in the loss, grounded in Paszek's kinetic-trap mechanism
- **Conditional pixel-level perturbation prediction** — fine-tuning an IMPA/CPA-family model (Bunne & Lotfollahi *et al.*, *NeurIPS* 2023) on glycocalyx-specific paired imaging datasets so that a PI can visually compare a predicted perturbed-cell image against a real wet-lab plate, rather than reasoning from an abstract feature table

---

## References

### Glycocalyx mechanobiology
1. Paszek, M. J. *et al.* The cancer glycocalyx mechanically primes integrin-mediated growth and survival. ***Nature*** 511, 319–325 (2014).
2. Möckl, L. *et al.* Quantitative super-resolution microscopy of the mammalian glycocalyx. ***Dev Cell*** 50, 57–72 (2019).
3. Manon-Jensen, T., Itoh, Y. & Couchman, J. R. Proteoglycans in health and disease: the multiple roles of syndecan shedding. ***FEBS J*** 277, 3876–3889 (2010).

### Mechanotransduction readouts
4. Dupont, S. *et al.* Role of YAP/TAZ in mechanotransduction. ***Nature*** 474, 179–183 (2011).

### Image-based cellular profiling
5. Bray, M.-A. *et al.* Cell Painting, a high-content image-based assay for morphological profiling using multiplexed fluorescent dyes. ***Nat Protoc*** 11, 1757–1774 (2016).
6. Chandrasekaran, S. N. *et al.* Three million images and morphological profiles of cells treated with matched chemical and genetic perturbations (JUMP Cell Painting). ***Nat Methods*** 21, 1114–1121 (2024).

### Segmentation and vision models
7. Stringer, C. & Pachitariu, M. Cellpose3: one-click image restoration for improved cellular segmentation. ***Nat Methods*** (2025).
8. Oquab, M. *et al.* DINOv2: Learning robust visual features without supervision. ***arXiv*** 2304.07193 (2024).
9. Doron, M. *et al.* Unbiased single-cell morphology with self-supervised vision transformers. ***Nat Methods*** (2023).
10. Kraus, O. *et al.* Masked autoencoders are scalable learners of cellular biology (Phenom-2). ***bioRxiv*** (Recursion, 2024).

### Perturbation modelling
11. Theodoris, C. V. *et al.* Transfer learning enables predictions in network biology (Geneformer). ***Nature*** 618, 616–624 (2023).
12. Szklarczyk, D. *et al.* The STRING database in 2023: protein–protein association networks and functional enrichment analyses for any sequenced genome of interest. ***Nucleic Acids Res*** 51, D638–D646 (2023).
13. Bunne, C., Lotfollahi, M. *et al.* Learning single-cell perturbation responses using neural optimal transport (IMPA). ***NeurIPS*** 2023.
14. Lotfollahi, M. *et al.* Predicting cellular responses to complex perturbations in high-throughput screens (CPA). ***Mol Syst Biol*** 19, e11517 (2023).
15. Gruver, N. *et al.* Active learning for efficient discovery of optimal gene combinations (IterPert). ***RECOMB*** 2024.

### Metabolism → glycosylation
16. Taparra, K. *et al.* O-GlcNAcylation is required for mutant KRAS-induced lung tumorigenesis. ***J Clin Invest*** 128, 4924–4937 (2018).
17. Lau, K. S. *et al.* Complex N-glycan number and degree of branching cooperate to regulate cell proliferation and differentiation. ***Cell*** 129, 123–134 (2007).

---

## License

MIT License © 2026 Valentin Uzan

This project is released under the MIT License. See `LICENSE` for the full text. Bundled third-party model weights retain their upstream licenses (Cellpose-SAM: BSD 3-Clause; DINOv2: Apache 2.0).

---

## Author

**Valentin Uzan**
[github.com/orgavaa](https://github.com/orgavaa) · uzanval@gmail.com

Built as part of a PhD application to the Labouesse / Tibbitt group, Macromolecular Engineering Laboratory, Department of Mechanical and Process Engineering, ETH Zürich.
