# Plan: Computational framework for ETH Zurich PhD application (Labouesse / Tibbitt group, glycocalyx mechanotransduction)

## Context

Valentin is applying (deadline 2026-04-30, today is 2026-04-10) to a PhD position in Dr. Céline Labouesse's Mechanobiology of Cells and Tissues team, embedded in the Tibbitt Macromolecular Engineering Lab at ETH Zurich D-MAVT. The project is experimentally oriented: glycocalyx characterization, genetic/metabolic perturbation, mechanical stimulation, with the broader group working on 3D hydrogel scaffolds and skin/fibrosis models.

**Key constraint from Labouesse's email (2026-04-09):** "There is no numerical modelling part foreseen in this project, but there will be imaging, and therefore image analysis pipelines to develop. Transcriptomics could also be considered, if initial perturbations yield a measurable phenotype." She explicitly encouraged independent computational ideas.

**Valentin's background:** ~5–6 months cumulative wet-lab experience (coursework + 2 months at Shaker + 2 months at university hospital) — meets the "preferred" criterion. Strong ML + computational biology background. Position him as a **balanced wet/dry candidate**, with computation as differentiator, not replacement.

**What we're doing:** refining Valentin's initial three-layer framework (GlycoQuant / perturbation mapping / GlycoJEPA) into a science-first, pragmatic, ad-aligned structure; then building GlycoQuant as a pre-application demo over the next 20 days.

---

## Framework refinements (vs. original three-layer proposal)

1. **Reframe the pitch** — from "computational framework for glycocalyx mechanotransduction" to "computational skills that accelerate and de-risk an experimental program." GlycoQuant is front and center because Labouesse asked for it. Everything else is framed as independent ideas conditional on experimental results.

2. **Imaging resolution precision** — confocal + lectin staining measures pericellular intensity distribution across microns, NOT glycocalyx architecture at 50–500 nm. Möckl et al. (*Dev Cell* 2019) required super-resolution (STORM/MINFLUX). Do not claim sub-cellular glycocalyx architecture unless SR is available. ScopeM at ETH has STED/STORM — mention as aspirational.

3. **Mechanotransduction signature, not single readout** — YAP N/C alone is insufficient (Dupont 2011 has been qualified). Combine: YAP N/C + nuclear flatness (Lammerding) + lamin A/C + FA maturation (paxillin morphometrics) + actin stress fiber coherence.

4. **Drop scRNA-seq dependency from core plan** — build morphological perturbation atlas from GlycoQuant features alone (JUMP-CP logic at lab scale). Transcriptomics becomes an extension if phenotypes warrant it, matching Labouesse's phrasing.

5. **Drop "GlycoJEPA" name** — it's branding without matching architecture. JEPA (LeCun, I-JEPA/V-JEPA) is self-supervised masked-latent prediction; not what Valentin actually proposed. Replace with the genuinely novel idea: a **polymer-brush physics-informed neural network** predicting glycocalyx mechanical-filter properties from composition, grounded in Alexander–de Gennes scaling and Paszek's kinetic-trap mechanism (*Nature* 2014).

6. **Add two missing ad-specified aims:**
   - **Fibrosis/skin:** HS remodeling and syndecan-1 shedding in fibroblast-to-myofibroblast transition (Manon-Jensen et al., *FEBS J* 2010). Werner group at ETH (explicitly named by Labouesse) is the collaboration pathway.
   - **Metabolism:** hexosamine biosynthetic pathway (HBP) flux → UDP-GlcNAc → glycosylation. Taparra et al. (*JCI* 2018), Lau et al. (*Cell* 2007). Computational angle: COBRApy/Recon3D flux modeling linked to predicted glycocalyx composition. This is the most distinctive computational niche in the whole framework and directly addresses the metabolism–mechanosensitivity hypothesis named in the ad.

7. **Elevate Bayesian experimental design as near-term value-add** — IterPert (Gruver et al., RECOMB 2024) for active learning on perturbation screens; Ax/BoTorch BO for hydrogel composition (Seifermann et al., *Small Methods* 2023). Directly serves aims (ii) and (iii). Immediately useful to a PI planning a new project.

---

## Five-contribution structure (replaces original three layers)

| # | Contribution | Ad aim served | Timeline | Application role |
|---|---|---|---|---|
| 1 | **GlycoQuant core** — Streamlit platform: Cellpose-SAM segmentation + interpretable scikit-image features (glycocalyx radial profiles + mechanotransduction signature: YAP N/C, FA morphometrics, actin coherence, nuclear flatness) + Tab 2 dual-prior perturbation prioritization (Geneformer + STRING pathway) + Tab 3 GP active learning | (i) 2D characterization + (ii) perturbation priors | Built pre-application as demo (v0.1.0 → v1.0.0) | Concrete deliverable, GitHub link in statement of interest |
| 1b | **Deep feature extraction** (Phase 5.5, stretch) — DINOv2-base linear probe fine-tuned on Human Protein Atlas glycocalyx-protein imagery, producing 768-dim embeddings per cell alongside the interpretable scikit-image features. OpenPhenom-S/16 as a side-by-side benchmark in the app, not the primary extractor (Recursion's channel-rigid patch embedding assumes Cell Painting channels the Labouesse protocol does not have; DINOv2 is channel-flexible and Apache 2.0 licensed). | (i) 2D characterization, SOTA upgrade | Built pre-application if time, else flagged as near-term | Concrete secondary module if shipped, otherwise referenced in statement |
| 2 | **Morphological perturbation atlas** — GlycoQuant features (interpretable + deep) across si-/metabolic/enzymatic perturbations; cluster by phenotype; scRNA-seq as conditional extension | (i) | Year 1–2 | Proposed in statement of interest |
| 3 | **Metabolism → glycocalyx flux model** — HBP-focused COBRA flux model predicting glycocalyx composition under metabolic perturbations, validated against GlycoQuant measurements | (i) metabolic switches (ad-specified) | Year 2–3 | Proposed as independent direction — most distinctive biology/computation bridge |
| 4 | **Bayesian experimental design + hydrogel BO** — IterPert-style active learning for condition selection; Ax/BoTorch multi-objective BO for scaffold composition | (ii), (iii) | Year 1 onward | Proposed as pragmatic value-add |

**Independent directions (flagged, not committed):**

- **Polymer-brush PINN** — physics-informed NN predicting glycocalyx mechanical filter properties from composition, with Alexander–de Gennes scaling as a soft constraint in the loss. Matches Tibbitt group's polymer physics expertise and Paszek's kinetic-trap mechanism. Year 2–3.
- **Conditional pixel-level perturbation prediction (IMPA / CPA family)** — Bunne & Lotfollahi (*NeurIPS* 2023) introduced IMPA for image-level perturbation prediction on Cell Painting. Fine-tuning on glycocalyx-specific paired datasets (either Labouesse's future data, or the RxRx1 WGA channel as a glycocalyx proxy) would produce predicted images of perturbed cells that Labouesse can visually compare against real plates — fundamentally different UX from a feature table. Year 3–4.
- **Metabolism-aware perturbation ranking** — combining the HBP flux model with the Tab 2 dual priors so metabolic perturbations (2-DG, DON, tunicamycin) are ranked by predicted glycocalyx composition shift rather than transcriptomic co-regulation.

These are in the statement of interest under "independent ideas I would explore if initial characterization supports it." None are interview-only; the PINN and IMPA get one sentence each.

---

## GlycoQuant pre-application scope (20 days: 2026-04-10 → 2026-04-30)

Only Contribution 1 is built pre-application. The rest lives in the written statement as a roadmap.

**Package layout:**
```
glycoquant/
├── pyproject.toml
├── README.md                        # architecture diagram + 4-contribution roadmap
├── glycoquant/
│   ├── __init__.py
│   ├── segmentation/                # Cellpose-SAM wrapper (cell + nucleus)
│   ├── features/
│   │   ├── glycocalyx.py            # radial profile, heterogeneity, coverage, pericellular/apical
│   │   ├── yap.py                   # N/C ratio from DAPI + YAP channels
│   │   ├── focal_adhesions.py       # paxillin morphometrics via regionprops
│   │   ├── actin.py                 # structure-tensor coherence, stress fiber orientation
│   │   └── morphology.py            # area, circularity, aspect ratio, spread area
│   ├── profiles/                    # per-cell feature table assembly → CSV
│   └── viz/                         # radial profile plots, correlation maps
├── tests/                           # synthetic image tests with known ground truth
├── scripts/                         # one-time setup (prior generation, model fine-tuning); not runtime
└── data/
    ├── demo/                        # bundled sample images for the app's "Load demo" button
    ├── priors/                      # pre-computed JSON priors for Tab 2
    └── models/                      # Phase 5.5 fine-tuned heads
```

**Technical choices:**
- **Segmentation:** Cellpose-SAM (`cpsam` model, `cellpose>=4.0`). The only pretrained model shipped in cellpose 4.x — `cyto3` and earlier were removed. Weights are ~1.2 GB on first download, cached at `~/.cellpose/models/`, then offline.
- **Interpretable features:** scikit-image only — `measure.regionprops`, `feature.structure_tensor`. These produce the numbers Labouesse will put in her Methods section ("YAP N/C dropped from 1.8 to 1.2, p<0.01"). Non-negotiable.
- **Deep features (Phase 5.5, stretch):** DINOv2-base via 🤗 `transformers` / `facebook/dinov2-base`. Apache 2.0. Channel-flexible (takes any 3 channels from Labouesse's protocol). Fine-tuned via linear probe on HPA glycocalyx-protein imagery. OpenPhenom-S/16 (`recursionpharma/OpenPhenom`) added only as a side-by-side *benchmark*, not the primary encoder, because its 6-channel Cell Painting patch embedding is incompatible with Labouesse's 5 IF channels and the non-commercial license creates friction.
- **Platform:** Streamlit frontend, library-backend separation. `glycoquant/` is the importable package; `glycoquant/app/` is the only user-facing surface; `scripts/` holds one-time setup (prior generation, fine-tuning) as proper Python modules — **no notebooks**.
- **Visualization:** Plotly only (interactive Streamlit). No matplotlib in the runtime path.
- **Runtime Python:** requires x86_64 (`win_amd64` wheels). Native Windows ARM64 Python cannot install `opencv-python-headless` (cellpose dep); miniforge3 x86_64 under Windows-on-ARM emulation is the working configuration.
- `pip install -e ".[dev]"` must work on Windows (x86_64), macOS, Linux.

**Demo data:** bundled synthetic multi-channel fixtures in `data/demo/`, generated from `skimage.draw`, committed as PNG/TIFF (<1 MB total). Tab 1 has a "Load demo image" button wired to these so a reviewer's first click produces a result with no uploads. BBBC / Zenodo glycocalyx datasets are not required — the synthetic fixtures were calibrated against Cellpose-SAM in the Phase 1 probe (exact 5-cell detection with Gaussian noise σ=0.05).

---

## Execution schedule

### Week 1 (Apr 10–16): Scaffold + segmentation + glycocalyx features
- Phase 0 (scaffold): `pyproject.toml` with runtime / dev / scripts extras, full package layout, Streamlit 3-tab skeleton, conftest.py with 5 synthetic fixtures sharing `SyntheticCellSpec` ground truth
- Phase 1 (segmentation): `CellSegmenter` wrapper around Cellpose-SAM (`cpsam`) with `segment_cells` / `segment_nuclei` / `segment_both` (matched cell-nucleus labels), fast path for all-zero inputs, 7 tests calibrated against probe results (5/5 cells exact, 4–5/5 nuclei, matched-label invariants, shape-mismatch ValueError)
- Phase 2 (glycocalyx features): pericellular ring extraction via mask dilation, radial intensity profile (center → edge, binned), heterogeneity index (CV of pericellular intensity), coverage fraction, pericellular-to-apical ratio
- Parallel: run `scripts/generate_pathway_priors.py` locally (STRING v12 REST API → `data/priors/pathway_ranks.json`)

### Week 2 (Apr 17–23): Mechanotransduction signature + profiles + Tab 1
- Phase 3 (mechano features): YAP N/C, FA morphometrics (paxillin), actin stress fiber coherence (structure tensor), cell morphology (regionprops)
- Phase 4 (profiles + viz): `ProfileAssembler` → per-cell DataFrame → CSV, Plotly radial profile / correlation map / prior table modules
- Phase 5 (Streamlit Tab 1): file uploader + channel mapping + Run Analysis + segmentation overlay + feature table + correlation heatmap + CSV download, "Load demo image" button. Tag v0.1.0 after merge.
- Parallel: run `scripts/generate_geneformer_priors.py` on Colab GPU → `data/priors/geneformer_ranks.json` (or document fallback to pathway-only if Geneformer tokenization fails)

### Week 3 (Apr 24–30): Tabs 2–3 + Phase 5.5 stretch + polish
- Phase 6 (Tab 2 prioritization): `PriorLoader` + `pathway_score.py` + `tab_prioritization.py` with dual-prior ranking table, |ΔRank| divergence column, per-gene drill-down (STRING shortest path + PubMed refs), metabolic inhibitor panel. Tag v0.2.0.
- Phase 7 (Tab 3 experiment designer): `ExperimentDesigner` with Matern GP, exploration/exploitation toggle, pathway-based cold start. Tag v0.3.0.
- **Phase 5.5 (stretch, only if time remains after v0.3.0):** DINOv2 linear probe fine-tuned on HPA glycocalyx proteins via `scripts/finetune_dinov2_hpa.py`; `glycoquant/features/dinov2_embedder.py` adds 768-dim deep features alongside the interpretable ones; Tab 1 toggle "Add deep embeddings"; OpenPhenom added as a benchmark-only module (`phenom_benchmark.py`) not in the runtime path. Tag v0.1.5 (numbered out of order to stay non-blocking).
- Phase 8 (polish): README with architecture diagram + 3 app screenshots + reproducibility section, CI workflow, bundled demo images, literature deep-dive to verify every reference. Tag v1.0.0.
- Literature verification: Paszek 2014, Möckl 2019, Dupont 2011 critiques, Manon-Jensen 2010, Taparra 2018, Lau 2007, Chandrasekaran 2024 JUMP-CP, Gruver 2024 IterPert, Seifermann 2023, Alexander–de Gennes brush theory, Theodoris 2023 Geneformer, Bunne/Lotfollahi 2023 IMPA, Oquab 2024 DINOv2, Kraus 2024 Phenom-2. Flag anything that doesn't check out.
- **Hard gate for v1.0.0:** running Streamlit app renders all 3 tabs end-to-end on bundled demo images, <30 s from launch to first result, zero network at runtime, zero GPU requirement.

---

## Explicit non-goals for these 20 days

- **No demo notebook.** The Streamlit app *is* the demo. Anything a reviewer would want to see must be reachable by clicking through the running app.
- **No `notebooks/` directory as a first-class deliverable.** `scripts/` holds one-time setup code as proper Python modules runnable via `python scripts/<name>.py`.
- No scRNA-seq analysis code in the runtime (conditional on PI decision, year 1–2)
- No polymer-brush PINN implementation (independent direction, year 2–3)
- No COBRA-HBP flux model (independent direction, year 2–3)
- No IMPA / conditional pixel-level perturbation training (independent direction, year 3–4; needs paired glycocalyx data that doesn't exist yet)
- No OpenPhenom in the runtime Tab 1 path. Benchmark-only module in Phase 5.5, if at all. Channel-mismatch with Labouesse's IF protocol + non-commercial license.
- No Bayesian hydrogel optimization code in v1.0.0 (Phase 4 contribution is Tab 3 GP active learning over *perturbations*; hydrogel BO is the year-1+ extension)
- No `transformers` import in `glycoquant/app/` or `glycoquant/predictor/prior_loader.py` at runtime. `torch` is allowed only transitively via `cellpose`.
- No network calls in the running app. All STRING queries happen in `scripts/generate_pathway_priors.py` offline.
- No statement-of-interest drafting — Valentin writes it himself; I provide verified literature, the running platform, and the four-contribution framing.

---

## Literature anchors (for statement of interest and README)

### Glycocalyx mechanobiology
- **Paszek et al., *Nature* 2014** — glycocalyx kinetic trap, integrin clustering, mechanical rationale. The single most important reference.
- **Möckl et al., *Dev Cell* 2019** — super-resolution (STORM) glycocalyx imaging. Cite carefully: the sub-cellular-scale findings required SR, which we don't have in the demo pipeline.
- **Manon-Jensen et al., *FEBS J* 2010** — syndecan shedding in fibrosis. Connects to the ad's skin/fibrosis aim and the Werner group collaboration pathway.

### Mechanotransduction readouts
- **Dupont et al., *Nature* 2011** — YAP/TAZ as mechanotransduction readout. Baseline reference, combine with other readouts (the 2011 paper has been partially qualified in follow-ups).
- **Lammerding group, various** — nuclear flattening and lamin A/C as mechanotransduction readouts. Justifies multi-marker signature over YAP N/C alone.

### Metabolism → glycocalyx (for contribution 3)
- **Taparra et al., *JCI* 2018** — hexosamine biosynthetic pathway flux in cancer glycosylation.
- **Lau et al., *Cell* 2007** — O-GlcNAc cycling and metabolic sensing.

### Image-based profiling (framing for GlycoQuant)
- **Bray et al., *Nat Protoc* 2016** — Cell Painting, the gold standard framing reference for standardized image-based profiling.
- **Chandrasekaran et al., *Nat Methods* 2024** — JUMP-CP perturbation morphological profiling at million-compound scale. Justifies the perturbation-atlas framing (contribution 2) even at lab scale.

### Perturbation prioritization (for Tab 2)
- **Theodoris et al., *Nature* 2023** — Geneformer, transformer pretrained on ~30 M scRNA-seq profiles. The transcriptomic prior in Tab 2. Cite for what it actually does (rank-value tokenized in silico perturbation) not for what it doesn't (mechanistic glycocalyx prediction).
- **STRING v12** (Szklarczyk et al., *Nucleic Acids Res* 2023) — PPI network, the pathway prior in Tab 2. Every ranking in the drill-down panel traces to a specific STRING edge.

### Active learning + Bayesian optimization (for contribution 4)
- **Gruver et al., RECOMB 2024** — IterPert, active learning for perturbation screens.
- **Seifermann et al., *Small Methods* 2023** — Bayesian optimization for hydrogel composition. Concrete precedent for hydrogel-BO direction.

### Vision foundation models for microscopy (for Phase 5.5 + contribution 1b)
- **Oquab et al., 2024** — DINOv2, self-supervised ViT trained on LVD-142M. Primary deep-feature backbone: channel-flexible, Apache 2.0. The feature extractor for Phase 5.5.
- **Doron et al., *Nat Methods* 2023** — DINO-family features are competitive with specialized microscopy models on Cell Painting perturbation recall. Pushes back on the naive "natural-image pretraining is useless for microscopy" claim.
- **Kraus et al., Recursion 2024** — Phenom-2, 1.9 B-param microscopy foundation model. DINOv2 is second-best on their own benchmark — domain-native training helps but is not decisive under channel shift.
- **Recursion OpenPhenom-S/16** (HuggingFace: `recursionpharma/OpenPhenom`, 2024) — benchmark-only in Phase 5.5. Channel-rigid (6-channel Cell Painting), non-commercial license.
- **Chandrasekaran et al., *Nat Methods* 2024** — JUMP-CP as a pretraining corpus for microscopy foundation models.

### Conditional perturbation prediction (independent direction, year 3–4)
- **Bunne & Lotfollahi et al., *NeurIPS* 2023** — IMPA (Image Perturbation Autoencoder). The closest prior art for pixel-level conditional perturbation prediction on Cell Painting, using optimal transport between control and perturbed distributions. Reference for the "visual hypothesis generator" direction in the statement.
- **Lotfollahi et al., *Mol Sys Bio* 2023** — CPA, the compositional perturbation autoencoder on scRNA-seq. Companion reference to IMPA.

### Polymer physics (for the PINN independent direction)
- **Alexander–de Gennes polymer brush theory** — physics grounding for the glycocalyx-as-brush model. Classical references (de Gennes 1980, Alexander 1977). Foundation for a PINN that embeds brush scaling in the loss.

---

## Verification / success criteria

**Application artifact:**
- Statement of interest (≤2 pages, written by Valentin) references ad-specified aims (fibrosis/skin, metabolism) explicitly
- GlycoQuant GitHub repo is public, README has architecture diagram + 3 app screenshots + reproducibility section + roadmap
- Each of the 4 contributions is tied to a specific ad aim
- No overclaiming: no "publishable in Bioinformatics" framing, no "JEPA" buzzwords without architecture
- Independent ideas flagged as such, not as commitments

**GlycoQuant platform:**
- `pip install -e ".[dev]"` works on Windows, macOS, Linux (x86_64 Python required)
- `streamlit run glycoquant/app/main.py` launches the app in <5 s
- Tab 1: "Load demo image" → Run Analysis → segmentation overlay + feature table + CSV download works end-to-end on bundled images
- Tab 2: dual-prior ranking table with divergence column + drill-down panel renders from `data/priors/*.json`
- Tab 3: GP active learning recommendation renders with pathway-based cold start
- Per-cell CSV output with ≥20 interpretable features (+ 768-dim DINOv2 embeddings in Phase 5.5)
- Unit tests pass on synthetic fixtures with known ground truth, no external data downloads
- CI green on every PR

---

## Positioning paragraph (reference for statement of interest)

*"I would approach this project as a balanced wet/dry candidate. My primary work will be the experimental characterization, perturbation, and mechanical stimulation described in the aims. In parallel, I will develop the image analysis pipeline Dr. Labouesse identified as a concrete need — GlycoQuant, a standardized, open-source Streamlit platform for glycocalyx and mechanotransduction phenotyping, which I have prototyped as a working application (GitHub link). The platform combines Cellpose-SAM segmentation with interpretable scikit-image features — the kind of publishable numbers a wet-lab group actually uses — alongside an optional deep-feature extractor based on a DINOv2 backbone fine-tuned on Human Protein Atlas glycocalyx-protein imagery, giving a 768-dim learned representation per cell on top of the hand-crafted measurements. Tab 2 ranks glycocalyx perturbations using two complementary pre-computed priors — Geneformer transcriptomic co-regulation and STRING/Reactome pathway proximity — and flags the divergence between them as the most informative experiments to run; Tab 3 uses Gaussian-process active learning to recommend the next perturbation given existing results.*

*As the project matures and initial perturbations reveal measurable phenotypes, I would explore four independent computational directions that directly serve the ad-specified aims. First, a morphological perturbation atlas quantifying how genetic, enzymatic, and metabolic interventions reshape the glycocalyx–mechanotransduction state, built on the GlycoQuant feature table. Second, a hexosamine pathway flux model linking metabolic switches to predicted glycocalyx composition via COBRA flux analysis, directly addressing the metabolism–mechanosensitivity hypothesis named in the position description. Third, Bayesian experimental design — using active learning to prioritize conditions across the combinatorial space of scaffold, perturbation, and drug (Gruver et al., RECOMB 2024; Seifermann et al., Small Methods 2023). Fourth, at the intersection of the Tibbitt group's polymer physics expertise and my machine learning background, a polymer-brush physics-informed neural network predicting mechanical filter properties from glycocalyx composition, grounded in Alexander–de Gennes scaling and Paszek's kinetic-trap mechanism (Nature 2014).*

*On a longer horizon, I am interested in conditional pixel-level perturbation prediction in the IMPA/CPA family (Bunne & Lotfollahi, NeurIPS 2023) — models that take an image of a control cell and produce a predicted image of that specific cell after a perturbation, giving the PI a visual hypothesis to evaluate directly against wet-lab plates rather than an abstract feature table. This remains speculative because it requires paired glycocalyx-stained datasets that do not currently exist, but it is where I think the strongest marriage of imaging and ML for glycocalyx biology ultimately lies."*
