# GlycoQuant

**Single-cell glycocalyx–mechanotransduction coupling from standard fluorescence microscopy.**

GlycoQuant is an open-source analysis platform that measures how the cell-surface glycocalyx relates to intracellular mechanotransduction — at single-cell resolution, from a five-channel confocal image, with no custom optics and no manual annotation.

The platform segments individual cells (Cellpose-SAM), extracts 26 interpretable biophysical features spanning glycocalyx spatial organisation, YAP/TAZ nuclear translocation, focal-adhesion maturation, actin cytoskeletal coherence, and nuclear morphology, optionally augments them with 5120-dimensional Cell-DINO ViT-L/16 embeddings, and provides three post-hoc ML analyses: UMAP phenotype discovery, spatial graph neural network prediction, and cross-modal glyco-mechano predictability quantification.

A separate perturbation-ranking module combines curated pathway proximity (STRING v12) with transcriptomic co-regulation (Geneformer) to prioritise glycocalyx gene perturbations against a 15-gene mechanotransduction signature — surfacing the experiments where the two priors disagree as the highest-information targets for the bench.

<br />

<img width="2816" height="1536" alt="Gemini_Generated_Image_3x63ve3x63ve3x63" src="https://github.com/user-attachments/assets/704a7fc1-2ddd-49e3-9291-fae1f9a88175" />


---

## Why this exists

The glycocalyx — the dense coat of glycopolymers (heparan-sulfate proteoglycans, mucins, hyaluronan, glycolipids) tethered to the outer plasma membrane — is not just a passive filter. Paszek *et al.* (Nature 2014) demonstrated that a bulky glycocalyx mechanically primes integrin-mediated growth through a kinetic-trap mechanism, directly linking glycocalyx architecture to force transmission. Dupont *et al.* (Nature 2011) established YAP/TAZ nuclear–cytoplasmic ratio as the canonical mechanotransduction readout. Mockl *et al.* (Dev Cell 2019) showed with super-resolution that glycocalyx spatial organisation is heterogeneous at 50–500 nm — a scale not directly resolvable by confocal, but whose pericellular intensity distribution *is* measurable with standard immunofluorescence.

Despite this convergence, no published study has reported single-cell correlative analysis between glycocalyx conformation and mechanotransduction state. Population-level comparisons (Paszek 2014, Barai 2024, Hamrangsekachaee 2025) show that perturbing the glycocalyx changes mechanical readouts, but they average over the very heterogeneity that makes the biology interesting. GlycoQuant closes this gap: every cell gets its own glycocalyx profile *and* its own mechanotransduction profile, enabling the correlation structure between the two to be mapped within a single image.

There is also no open-source pipeline for this measurement. Cell Painting (Bray *et al.*, Nat Protoc 2016) and JUMP-CP (Chandrasekaran *et al.*, Nat Methods 2024) standardised morphological profiling at scale, but neither targets glycocalyx-specific staining. GlycoQuant operates at the scale a single experimental group works at: one image, one browser tab, full quantification.

---

## What it measures

### Interpretable features (26 scalars per cell)

| Module | N | Key features | Biological rationale |
|---|---|---|---|
| **Glycocalyx** | 12 | Pericellular ratio, heterogeneity (CV), coverage, Shannon entropy, Haralick texture (contrast, homogeneity, correlation, energy), Moran's I spatial autocorrelation, radial decay rate | Quantifies the WGA-lectin ring around each cell — the confocal-accessible proxy for glycocalyx conformation. Texture features capture the sub-resolution heterogeneity that Mockl 2019 resolved with PAINT. |
| **YAP/TAZ** | 5 | N/C ratio (raw + Jones-2024 size-corrected), nuclear intensity, cytoplasmic intensity, nuclear fraction | Canonical mechanotransduction readout (Dupont 2011). Size correction removes the confound that larger nuclei capture more signal. |
| **Focal adhesions** | 6 | Count, density (per um2), mature fraction (Buskermolen 2018 size bins), mean area, elongation, peripheral fraction | Paxillin-labelled integrin anchors. Mature elongated peripheral FAs indicate a force-transmitting adherent cell. |
| **Actin** | 4 | Stress-fiber coherence (structure tensor eigenvalue ratio), cortical/interior ratio, total intensity, central intensity | Coherence near 1 means aligned contractile fibers; near 0 means isotropic cortical actin. |
| **Morphology** | 7 | Cell area, nuclear area, N/C area ratio, nuclear aspect ratio, nuclear solidity, nuclear perimeter, centroid (x, y) | Pure shape descriptors. Baseline context for all other features — spread area correlates with both glycocalyx and YAP. |

### Composite score

A mechanotransduction composite score (PCA mode 1 over a curated 15-feature panel, falling back to weighted sum when < 30 cells) collapses the multi-dimensional mechanical state into a single number per cell. Loadings and variance explained are reported so the user can judge whether the compression is meaningful for their image.

### Deep embeddings (optional)

**Cell-DINO ViT-L/16** (Meta FAIR, channel-adaptive architecture) produces a 5120-dimensional embedding per cell (1024 dims per channel for up to 5 channels). These learned representations complement the interpretable features for unsupervised discovery — phenotypic heterogeneity that no single hand-crafted feature captures.

Fallback: facebook/dinov2-base (86M params, 768-dim, Apache 2.0) when the Cell-DINO checkpoint is unavailable.

---

## ML analysis layer

Three post-hoc analyses run on completed jobs, directly from the browser:

### 1. Cell phenotype discovery (UMAP + Leiden)

Projects Cell-DINO embeddings (PCA to 50 dims, then UMAP with cosine metric) into a 2D landscape and partitions cells into phenotype clusters via Leiden community detection on the UMAP fuzzy-simplicial-set k-NN graph. Each cluster gets a summary profile over the interpretable features, revealing subpopulations invisible to any single measurement.

This is the single-image version of what Recursion Pharmaceuticals built at compound-library scale. The embeddings exist; this analysis makes them actionable.

### 2. Spatial context GNN (Delaunay + GCN)

Builds a cell-neighbourhood graph from Delaunay triangulation of cell centroids (edges pruned at a configurable distance threshold), then trains a 2-layer graph convolutional network (Kipf & Welling 2017) to predict mechano score from neighbourhood context. Implemented with raw PyTorch sparse ops — no torch-geometric dependency.

The R-squared answers a specific question: *"How much of a cell's mechanical state is explained by its neighbours?"* High R-squared implies spatially coherent mechanical domains (collective mechanotransduction). Low R-squared implies cell-autonomous mechanical state. Feature importance from the GCN weight norms reveals which interpretable features carry spatial signal.

### 3. Cross-modal prediction (MLP, 5-fold CV)

Trains a lightweight MLP (64-32-output, ReLU, dropout 0.1) to predict mechanotransduction features from glycocalyx features, or the reverse. 5-fold cross-validation within the image reports per-target R-squared. Gradient-based feature importance identifies which input features drive the prediction.

The overall R-squared answers the central question of the platform: *"How much of a cell's mechanical state can you infer from its surface glycocalyx alone?"* If this number is high, that is a finding. If it is low, that is also a finding.

---

## Perturbation ranking

The Ranking tab combines two orthogonal precomputed priors to prioritise glycocalyx gene perturbations:

**Pathway proximity prior** — STRING v12 (Szklarczyk *et al.*, NAR 2023) at confidence >= 0.70, Dijkstra shortest-path from each glycocalyx gene to each of 15 mechanotransduction targets, aggregated by weighted median of inverse distances. Every ranking traces to specific STRING edges with specific confidence scores, visible in the drill-down.

**Transcriptomic co-regulation prior** — Geneformer (Theodoris *et al.*, Nature 2023), a 30M-parameter transformer pretrained on ~10^4 million single-cell transcriptomes, used for in-silico deletion of each glycocalyx gene and measurement of downstream perturbation to the mechano signature. Generated on-demand on a Modal L4 GPU.

**Image-aware reweighting** — When an analysis is complete, the pathway ranking is dynamically re-aggregated using z-scored deviations of the observed per-cell features against a reference cohort, so the ranking reflects the specific biological state of the image being analysed.

The **rank-divergence column** (|rank_geneformer - rank_pathway|) is the most scientifically informative output: high-divergence genes are where the two priors disagree, meaning a wet-lab experiment will actively discriminate between transcriptomic and topological hypotheses. Those are the experiments worth doing.

**Backend** — FastAPI (Python 3.10+) with four routers: `/analysis` (upload, job queue, polling), `/priors` (ranking, contextual reweighting, drill-down, Geneformer generation), `/demo` (bundled HPA microscopy datasets), `/analysis/ml` (phenotype discovery, spatial GNN, cross-modal prediction). GPU inference dispatches to Modal when `GLYCOQUANT_GPU_PROVIDER=modal`.

**Frontend** — React 18 + TypeScript + Vite + Tailwind CSS. Full-bleed microscopy viewer with native channel PNG compositing (mix-blend-mode:screen), Canvas overlay for cell outlines and interactions (hover tooltip, click-to-inspect), sliding results panel with Overview and ML Analysis tabs. TanStack Query for data fetching, Zustand for cross-view state.

**Core library** — `glycoquant/` is a pure Python package with no web dependencies. Every feature extractor, every Plotly figure factory, every ML module is unit-testable in isolation.

```
glycoquant/
  features/       — Per-cell extractors + deep embeddings + ML analyses
  profiles/       — ProfileAssembler → flat DataFrame per image
  predictor/      — Dual-prior loader + dynamic reweighting
  segmentation/   — Cellpose-SAM wrapper
  viz/            — Plotly figure factories
  io/             — Image I/O + channel splitting
```

---

## Installation

### Backend

```bash
git clone https://github.com/orgavaa/GlycoQuant.git
cd GlycoQuant
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn backend.app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend connects to `http://localhost:8000` by default (override with `VITE_API_BASE_URL`).

### Requirements

| Component | Requirement |
|---|---|
| Python | 3.10+ |
| Node.js | 20+ |
| Cellpose-SAM weights | ~1.2 GB, downloaded on first run |
| Cell-DINO checkpoint | ~1.2 GB, auto-downloaded from HuggingFace on first run |
| GPU | Not required. CPU is slower (~5 min/image) but fully supported. Modal L4 brings this to ~25s. |

---

## Deployment (Railway + Modal)

| Service | Provider | Role |
|---|---|---|
| Frontend (Vite build + nginx) | Railway | Static assets |
| Backend (FastAPI + job store) | Railway | API + CPU dispatcher |
| GPU inference | Modal (serverless L4) | Cellpose-SAM + Cell-DINO |

```bash
# One-time Modal setup
pip install modal && modal token new
modal deploy backend/modal_app.py
```

Railway variables on the backend service:
```
GLYCOQUANT_GPU_PROVIDER = modal
MODAL_TOKEN_ID = ak-...
MODAL_TOKEN_SECRET = as-...
CORS_ORIGINS = https://<frontend>.up.railway.app
```

Fallback: set `GLYCOQUANT_GPU_PROVIDER=local` for pure-CPU execution.

---

## Bundled demo data

GlycoQuant ships with real microscopy from two public datasets:

- **BBBC022** (Broad Cell Painting pilot) — U-2 OS cells, 5 channels, 520x696 px at 0.656 um/px. CC0 / public domain. 20 fields of view across DMSO controls and compound treatments.
- **RxRx1** (Recursion) — U2OS and HUVEC, multi-site, 512x512 px. CC BY 4.0.

Glycocalyx and paxillin channels in BBBC022 are synthetic overlays mapped from the AGP (WGA-lectin + phalloidin) channel, since the original Cell Painting protocol does not include a dedicated glycocalyx stain. This is documented in each dataset's `slot_sources` metadata and displayed in the UI.

---

## Tests

```bash
pytest tests/ backend/tests/ -m "not slow"   # ~30s, no GPU, no network
pytest tests/ -m slow                          # Cellpose + DINOv2 inference
cd frontend && npm run typecheck && npm run build
```

Synthetic fixtures in `tests/conftest.py` provide deterministic ground truth for every extractor — no external data, no network, no GPU in CI.

---

## References

### Glycocalyx mechanobiology
- Paszek MJ *et al.* The cancer glycocalyx mechanically primes integrin-mediated growth and survival. *Nature* 511, 319–325 (2014).
- Mockl L *et al.* Quantitative super-resolution microscopy of the mammalian glycocalyx. *Dev Cell* 50, 57–72 (2019).
- Barai A *et al.* Glycocalyx in cancer mechanobiology. *J Cell Sci* (2024).
- Hamrangsekachaee M *et al.* Glycocalyx remodeling in mechanotransduction. *Trends Cell Biol* (2025).

### Mechanotransduction
- Dupont S *et al.* Role of YAP/TAZ in mechanotransduction. *Nature* 474, 179–183 (2011).
- Buskermolen ABC *et al.* Entropic forces drive cellular contact guidance. *Biophys J* 116, 1994–2008 (2019).

### Image analysis and cell profiling
- Bray MA *et al.* Cell Painting, a high-content image-based assay. *Nat Protoc* 11, 1757–1774 (2016).
- Chandrasekaran SN *et al.* JUMP Cell Painting dataset. *Nat Methods* 21, 1114–1121 (2024).
- Stringer C & Pachitariu M. Cellpose3: one-click image restoration. *Nat Methods* (2025).
- Doron M *et al.* Cell-DINO: self-supervised vision transformers for single-cell morphology. *bioRxiv* (2024).

### Foundation models
- Oquab M *et al.* DINOv2: Learning robust visual features without supervision. *TMLR* (2024).
- Theodoris CV *et al.* Transfer learning enables predictions in network biology. *Nature* 618, 616–624 (2023).

### Network biology
- Szklarczyk D *et al.* STRING v12. *Nucleic Acids Res* 51, D638–D646 (2023).

### Graph neural networks
- Kipf TN & Welling M. Semi-supervised classification with graph convolutional networks. *ICLR* (2017).

### Spatial omics
- Palla G *et al.* Squidpy: a scalable framework for spatial omics analysis. *Nat Methods* (2022).

---

## License

MIT License. See `LICENSE`.

Bundled model weights retain their upstream licenses: Cellpose-SAM (BSD 3-Clause), DINOv2 (Apache 2.0), Cell-DINO (FAIR Non-Commercial Research License).

---

## Author

**Valentin Uzan** — [github.com/orgavaa](https://github.com/orgavaa)
