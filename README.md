# GlycoQuant

**Image-analysis platform for glycocalyx and mechanotransduction coupling, with per-cell readouts on standard fluorescence microscopy.**

GlycoQuant is an open-source pipeline that turns a 5 to 6 channel confocal or widefield image into a per-cell table of glycocalyx conformation, YAP/TAZ nuclear translocation, focal-adhesion maturation, actin coherence, and nuclear morphology. No custom optics, no manual annotation, no GPU on the client.

The platform is cell-type agnostic: feature extractors make no assumption about lineage, tissue, or disease state, and operate on any adherent cell imaged in 2D. Extension to 3D volumetric imaging (confocal z-stacks, light-sheet) is architecturally straightforward but not yet implemented. Z-stacks are auto-collapsed to a maximum-intensity projection.

Segmentation uses Cellpose-SAM with adaptive-diameter retry on low-count fields. Twenty-six interpretable biophysical features are extracted per cell and can be augmented with 5120-dimensional Cell-DINO ViT-L/16 embeddings. Three post-hoc ML analyses run on completed jobs: UMAP phenotype discovery, spatial graph neural network prediction, and cross-modal glyco to mechano predictability quantification.

A separate perturbation-ranking module combines curated pathway proximity (STRING v12) with transcriptomic co-regulation (Geneformer) to prioritise glycocalyx gene perturbations against a 15-gene mechanotransduction signature. Rank-divergence between the two priors surfaces the experiments where a wet-lab assay will actively discriminate between the topological and transcriptomic hypotheses.

<br />

<img width="2816" height="1536" alt="GlycoQuant overview" src="https://github.com/user-attachments/assets/704a7fc1-2ddd-49e3-9291-fae1f9a88175" />


---

## Why this exists

The glycocalyx, the dense coat of glycopolymers (heparan-sulfate proteoglycans, mucins, hyaluronan, glycolipids) tethered to the outer plasma membrane, is not a passive filter. Paszek *et al.* (Nature 2014) demonstrated that a bulky glycocalyx mechanically primes integrin-mediated growth through a kinetic-trap mechanism, directly linking glycocalyx architecture to force transmission. Dupont *et al.* (Nature 2011) established YAP/TAZ nuclear to cytoplasmic ratio as the canonical mechanotransduction readout. Mockl *et al.* (Dev Cell 2019) showed with super-resolution imaging that glycocalyx spatial organisation is heterogeneous at 50 to 500 nm, a scale not directly resolvable by confocal, but whose pericellular intensity distribution is measurable with standard immunofluorescence.

Despite this convergence, there is no open image-analysis pipeline that jointly quantifies glycocalyx conformation and mechanotransduction state at per-cell resolution. Population-level comparisons (Paszek 2014, Barai 2024, Hamrangsekachaee 2025) show that perturbing the glycocalyx changes mechanical readouts, but they average over the very heterogeneity that makes the biology interesting. Cell Painting (Bray *et al.*, Nat Protoc 2016) and JUMP-CP (Chandrasekaran *et al.*, Nat Methods 2024) standardised morphological profiling at scale but do not target glycocalyx-specific staining. GlycoQuant closes this gap at the scale a single experimental group works at: one image, one browser tab, full quantification.

---

## What it measures

### Interpretable features (26 scalars per cell)

| Module | N | Key features | Biological rationale |
|---|---|---|---|
| **Glycocalyx** | 12 | Pericellular ratio, heterogeneity (CV), coverage, Shannon entropy, Haralick texture (contrast, homogeneity, correlation, energy), Moran's I spatial autocorrelation, radial decay rate | Quantifies the WGA-lectin ring around each cell, the confocal-accessible proxy for glycocalyx conformation. Texture features capture sub-resolution heterogeneity that Mockl 2019 resolved with PAINT. |
| **YAP/TAZ** | 5 | N/C ratio (raw + Jones-2024 size-corrected), nuclear intensity, cytoplasmic intensity, nuclear fraction | Canonical mechanotransduction readout (Dupont 2011). Size correction removes the confound that larger nuclei capture more signal; applied only when the slope r² gate is met, reported on the job summary. |
| **Focal adhesions** | 6 | Count, density (per µm²), mature fraction (Buskermolen 2018 size bins), mean area, elongation, peripheral fraction | Paxillin-labelled integrin anchors. Mature, elongated, peripheral FAs indicate a force-transmitting adherent cell. |
| **Actin** | 4 | Stress-fiber coherence (structure tensor eigenvalue ratio), cortical to interior ratio, total intensity, central intensity | Coherence near 1 means aligned contractile fibres; near 0 means isotropic cortical actin. |
| **Morphology** | 7 | Cell area, nuclear area, N/C area ratio, nuclear aspect ratio, nuclear solidity, nuclear perimeter, centroid (x, y) | Shape descriptors. Baseline context for all other features: spread area correlates with both glycocalyx and YAP. |

Every feature is computed in micrometre-native units from the image's pixel size; outputs are invariant across optics.

### Composite score

A mechanotransduction composite score collapses the multi-dimensional mechanical state into a single number per cell: PCA mode 1 over a curated 15-feature panel when at least 30 cells are available, otherwise a weighted sum with identical polarity. Loadings and variance explained are reported so the user can judge whether the compression is meaningful for their image.

### Deep embeddings (optional)

**Cell-DINO ViT-L/16** (channel-adaptive vision transformer, Doron 2024) produces a 5120-dimensional embedding per cell (1024 dims per channel, up to 5 channels). These learned representations complement the interpretable features for unsupervised discovery: phenotypic heterogeneity that no single hand-crafted feature captures.

Fallback: facebook/dinov2-base (86M params, 768-dim, Apache 2.0) when the Cell-DINO checkpoint is unavailable.

---

## ML analysis layer

Three post-hoc analyses run on completed jobs, directly from the browser.

### 1. Cell phenotype discovery (UMAP + Leiden)

Projects Cell-DINO embeddings (PCA to 50 dims, then UMAP with cosine metric) into a 2D landscape and partitions cells into phenotype clusters via Leiden community detection on the UMAP fuzzy-simplicial-set k-NN graph. Each cluster gets a summary profile over the interpretable features, revealing subpopulations invisible to any single measurement.

This is the single-image version of what Recursion Pharmaceuticals built at compound-library scale. The embeddings exist. This analysis makes them actionable.

### 2. Spatial context GNN (Delaunay + GCN)

Builds a cell-neighbourhood graph from Delaunay triangulation of cell centroids (edges pruned at a configurable distance threshold), then trains a 2-layer graph convolutional network (Kipf & Welling 2017) to predict mechano score from neighbourhood context. Implemented with raw PyTorch sparse ops, no torch-geometric dependency. Cross-validation uses k-means spatial-block CV (Roberts 2017 Ecography) with a random-split fallback; R² is reported as mean ± std across folds alongside the CV strategy badge.

The R² answers a specific question: *"How much of a cell's mechanical state is explained by its neighbours?"* High R² implies spatially coherent mechanical domains (collective mechanotransduction). Low R² implies cell-autonomous mechanical state. Feature importance from the GCN weight norms reveals which interpretable features carry spatial signal.

### 3. Cross-modal prediction (MLP, 5-fold CV)

Trains a lightweight MLP (64 to 32 to output, ReLU, dropout 0.1) to predict mechanotransduction features from glycocalyx features, or the reverse. 5-fold cross-validation within the image reports per-target R². Gradient-based feature importance identifies which input features drive the prediction.

The overall R² answers the central question of the platform: *"How much of a cell's mechanical state can you infer from its surface glycocalyx alone?"* High is a finding. Low is also a finding.

### Statistical reporting

Pair-wise glycocalyx to mechanotransduction correlations are reported with Spearman r, parametric p, and Benjamini-Hochberg q (FDR control at 0.05). An optional empirical permutation null (1000 permutations by default) is exposed from the correlation card for cases where the asymptotic p is unreliable. The number of FDR-significant pairs is surfaced as a first-class hero metric.

---

## Perturbation ranking

The Ranking tab combines two orthogonal precomputed priors to prioritise glycocalyx gene perturbations.

**Pathway proximity prior.** STRING v12 (Szklarczyk *et al.*, NAR 2023) at confidence ≥ 0.70, Dijkstra shortest-path from each glycocalyx gene to each of 15 mechanotransduction targets, aggregated by weighted median of inverse distances, augmented with curated literature edges that carry a PubMed DOI and a `CURATED` provenance badge in the drill-down. Every ranking traces to specific STRING or curated edges with specific confidence scores.

**Transcriptomic co-regulation prior.** Geneformer (Theodoris *et al.*, Nature 2023), a 30M-parameter transformer pretrained on ~30M single-cell transcriptomes, used for in-silico deletion of each glycocalyx gene and measurement of downstream perturbation to the mechano signature. Generated on-demand on a Modal L4 GPU. Prior freshness and schema are validated at load time; a stale or schema-mismatched prior is flagged in the UI rather than silently used.

**Image-aware reweighting.** When an analysis is complete, the pathway ranking is re-aggregated using signed z-scored deviations of the observed per-cell features against a reference cohort, so the ranking reflects the specific biological state of the image being analysed. Direction (up / down) is surfaced next to magnitude on every weight pill.

The **rank-divergence column** (|rank_geneformer minus rank_pathway|) is the most scientifically informative output. High-divergence genes are where the two priors disagree, meaning a wet-lab experiment will actively discriminate between transcriptomic and topological hypotheses. Those are the experiments worth doing.

---

## Architecture

**Backend.** FastAPI (Python 3.10+) with four routers: `/analysis` (upload, job queue, polling, export, correlation recompute), `/priors` (ranking, contextual reweighting, drill-down, Geneformer generation), `/demo` (bundled microscopy datasets), `/analysis/ml` (phenotype discovery, spatial GNN, cross-modal prediction). GPU inference dispatches to Modal when `GLYCOQUANT_GPU_PROVIDER=modal`.

**Frontend.** React 18, TypeScript, Vite, Tailwind CSS, IBM Plex Sans. Full-bleed microscopy viewer with native channel PNG compositing (`mix-blend-mode: screen`), Canvas overlay for cell outlines and interactions (hover tooltip, click-to-inspect), sliding results panel with Overview and ML Analysis tabs. TanStack Query for data fetching, Zustand for cross-view state. Backend liveness is polled every 30 s and surfaced as a topbar health dot.

**Core library.** `glycoquant/` is a pure Python package with no web dependencies. Every feature extractor, every Plotly figure factory, every ML module is unit-testable in isolation.

```
glycoquant/
  features/       Per-cell extractors, deep embeddings, ML analyses
  profiles/       ProfileAssembler, flat DataFrame per image, ComBat batch correction
  predictor/      Dual-prior loader with schema + freshness validation
  segmentation/   Cellpose-SAM wrapper with adaptive-diameter retry
  viz/            Plotly figure factories
  io/             Image I/O, channel splitting, z-stack projection
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
| GPU | Not required. CPU is slower (~5 min / image) but fully supported. Modal L4 brings this to ~25 s. |

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

GlycoQuant ships with real microscopy from public datasets:

- **BBBC022** (Broad Cell Painting pilot). U-2 OS cells, 5 channels, 520 × 696 px at 0.656 µm/px, CC0. 20 fields of view across DMSO controls and compound treatments.
- **RxRx1** (Recursion). U2OS and HUVEC, multi-site, 512 × 512 px, CC BY 4.0.

Glycocalyx and paxillin channels in BBBC022 are synthetic overlays mapped from the AGP (WGA-lectin + phalloidin) channel, since the original Cell Painting protocol does not include a dedicated glycocalyx stain. The substitution is declared in each dataset's `slot_sources` metadata and surfaced as a `Substitute` badge in the channel-assignment panel.

An optional 6th channel slot is reserved for anti-heparan-sulfate antibody (10E4 / F58-10E4) to resolve the syndecan and glypican axis; the wet-lab protocol is in `docs/HEPARAN_SULFATE_PROTOCOL.md`.

---

## Tests

```bash
pytest tests/ backend/tests/ -m "not slow"   # ~30 s, no GPU, no network
pytest tests/ -m slow                         # Cellpose + DINOv2 inference
cd frontend && npm run typecheck && npm run build
```

Synthetic fixtures in `tests/conftest.py` provide deterministic ground truth for every extractor: no external data, no network, no GPU in CI.

---

## References

### Glycocalyx mechanobiology
- Paszek MJ *et al.* The cancer glycocalyx mechanically primes integrin-mediated growth and survival. *Nature* 511, 319–325 (2014).
- Mockl L *et al.* Quantitative super-resolution microscopy of the mammalian glycocalyx. *Dev Cell* 50, 57–72 (2019).
- Barai A *et al.* Glycocalyx in cancer mechanobiology. *J Cell Sci* (2024).
- Hamrangsekachaee M *et al.* Glycocalyx remodelling in mechanotransduction. *Trends Cell Biol* (2025).

### Mechanotransduction
- Dupont S *et al.* Role of YAP/TAZ in mechanotransduction. *Nature* 474, 179–183 (2011).
- Buskermolen ABC *et al.* Entropic forces drive cellular contact guidance. *Biophys J* 116, 1994–2008 (2019).
- Jones JR *et al.* Size-aware YAP N/C normalisation. (2024).

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

### Statistics and batch correction
- Johnson WE *et al.* Adjusting batch effects in microarray expression data using empirical Bayes methods (ComBat). *Biostatistics* 8, 118–127 (2007).
- Benjamini Y & Hochberg Y. Controlling the false discovery rate. *J R Stat Soc B* 57, 289–300 (1995).
- Roberts DR *et al.* Cross-validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure. *Ecography* 40, 913–929 (2017).

---

## License

MIT License. See `LICENSE`.

Bundled model weights retain their upstream licenses: Cellpose-SAM (BSD 3-Clause), DINOv2 (Apache 2.0), Cell-DINO (FAIR Non-Commercial Research License).

---

## Author

**Valentin Uzan.** [github.com/orgavaa](https://github.com/orgavaa)
