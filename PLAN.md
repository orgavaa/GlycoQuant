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

## Four-contribution structure (replaces original three layers)

| # | Contribution | Ad aim served | Timeline | Application role |
|---|---|---|---|---|
| 1 | **GlycoQuant** — image analysis pipeline: Cellpose (cyto3) segmentation + glycocalyx radial profiles + mechanotransduction signature features | (i) 2D characterization | Built pre-application as demo | Concrete deliverable, GitHub link in statement of interest |
| 2 | **Morphological perturbation atlas** — GlycoQuant features across si-/metabolic/enzymatic perturbations; cluster by phenotype; scRNA-seq as conditional extension | (i) | Year 1–2 | Proposed in statement of interest |
| 3 | **Metabolism → glycocalyx flux model** — HBP-focused COBRA flux model predicting glycocalyx composition under metabolic perturbations, validated against GlycoQuant measurements | (i) metabolic switches (ad-specified) | Year 2–3 | Proposed as independent direction — most distinctive |
| 4 | **Bayesian experimental design + hydrogel BO** — IterPert-style active learning for condition selection; Ax/BoTorch multi-objective BO for scaffold composition | (ii), (iii) | Year 1 onward | Proposed as pragmatic value-add |

**Independent direction (flagged, not committed):** polymer-brush PINN predicting mechanical filter properties from glycocalyx composition, Alexander–de Gennes scaling in the loss. Mentioned in the statement of interest under "independent ideas I would explore if initial characterization supports it."

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
│   ├── segmentation/                # Cellpose (cyto3) wrapper (cell + nucleus)
│   ├── features/
│   │   ├── glycocalyx.py            # radial profile, heterogeneity, coverage, pericellular/apical
│   │   ├── yap.py                   # N/C ratio from DAPI + YAP channels
│   │   ├── focal_adhesions.py       # paxillin morphometrics via regionprops
│   │   ├── actin.py                 # structure-tensor coherence, stress fiber orientation
│   │   └── morphology.py            # area, circularity, aspect ratio, spread area
│   ├── profiles/                    # per-cell feature table assembly → CSV
│   └── viz/                         # radial profile plots, correlation maps
├── tests/                           # synthetic image tests with known ground truth
└── notebooks/
    └── demo.ipynb                   # end-to-end on public data, <5 min
```

**Technical choices:**
- Cellpose (cyto3) (wrap, don't reimplement) for segmentation
- scikit-image for feature extraction — `measure.regionprops`, `feature.structure_tensor`
- numpy/pandas for feature tables, matplotlib/seaborn for visualization
- No deep learning beyond Cellpose — keep scope controlled
- `pip install -e .` must work on Windows, macOS, Linux

**Demo data candidates (to pick during Week 1 lit review):**
- BBBC datasets (Broad Bioimage Benchmark Collection) for morphology
- Zenodo-hosted glycocalyx imaging datasets (search during lit review)
- Synthetic fallback: generate ground-truth images with `skimage.draw` if no public dataset fits

---

## Execution schedule

### Week 1 (Apr 10–16): Package scaffold + glycocalyx features
- `pyproject.toml`, package layout, dev environment
- Cellpose (cyto3) integration for cell + nucleus segmentation
- Glycocalyx feature extractor: radial intensity profile, heterogeneity index (CV of pericellular ring), coverage fraction, pericellular vs. apical ratio
- Unit tests on synthetic images with known ground truth
- Parallel: identify public demo dataset

### Week 2 (Apr 17–23): Mechanotransduction signature
- YAP N/C from DAPI nuclear mask + YAP channel
- Focal adhesion morphometrics (paxillin): count, mean area, elongation, distance-to-edge
- Actin stress fiber coherence via `skimage.feature.structure_tensor` (OrientationJ-equivalent)
- Morphology features (area, circularity, aspect ratio, spread area)
- Per-cell feature table assembly → CSV export
- Demo notebook end-to-end on public data

### Week 3 (Apr 24–30): Polish, lit review, release
- README.md: architecture diagram, 4-contribution roadmap, references, install/usage
- Literature deep-dive (parallel to code): verify Paszek 2014, Möckl 2019, Dupont 2011 critiques, Manon-Jensen 2010, Taparra 2018, Lau 2007, Chandrasekaran 2024 JUMP-CP, Gruver 2024 IterPert, Seifermann 2023, Alexander–de Gennes brush theory. Flag anything that doesn't check out.
- Visualization outputs: radial profile plot, correlation matrix
- Public GitHub repo, MIT license, tagged v0.1.0
- Final demo notebook runs end-to-end in <5 min on a laptop

---

## Explicit non-goals for these 20 days

- No scRNA-seq analysis code (conditional on PI decision, year 1–2)
- No PINN implementation (independent direction, year 2–3)
- No COBRA flux model (independent direction, year 2–3)
- No BO / active learning code (proposed, year 1 onward, in-PhD)
- No statement-of-interest drafting — Valentin handles the written application himself; I provide verified literature and code

---

## Literature anchors (for statement of interest and README)

- **Paszek et al., *Nature* 2014** — glycocalyx kinetic trap, integrin clustering, mechanical rationale
- **Möckl et al., *Dev Cell* 2019** — super-resolution glycocalyx imaging (cite carefully, acknowledge SR limitation)
- **Dupont et al., *Nature* 2011** — YAP/TAZ mechanotransduction (baseline, combine with other readouts)
- **Manon-Jensen et al., *FEBS J* 2010** — syndecan shedding in fibrosis
- **Taparra et al., *JCI* 2018; Lau et al., *Cell* 2007** — HBP and O-GlcNAc cycling
- **Bray et al., *Nat Protoc* 2016** — Cell Painting (framing reference for standardized profiling)
- **Chandrasekaran et al., *Nat Methods* 2024** — JUMP-CP perturbation morphological profiling
- **Gruver et al., RECOMB 2024** — IterPert active learning for perturbation screens
- **Seifermann et al., *Small Methods* 2023** — BO for hydrogel composition
- **Argelaguet et al., *Genome Biol* 2020** — MOFA+ (only if multi-omics happens)
- **Alexander–de Gennes polymer brush theory** — physics grounding for the PINN idea

---

## Verification / success criteria

**Application artifact:**
- Statement of interest (≤2 pages, written by Valentin) references ad-specified aims (fibrosis/skin, metabolism) explicitly
- GlycoQuant GitHub repo is public, has working demo notebook, README with architecture + roadmap
- Each of the 4 contributions is tied to a specific ad aim
- No overclaiming: no "publishable in Bioinformatics" framing, no "JEPA" buzzwords without architecture
- Independent ideas flagged as such, not as commitments

**GlycoQuant code:**
- `pip install -e .` works on Windows, macOS, Linux
- Demo notebook runs end-to-end on public data in <5 min
- Per-cell CSV output with ≥20 features
- Radial profile plot + correlation matrix render cleanly
- Unit tests pass on synthetic images with known ground truth

---

## Positioning paragraph (reference for statement of interest)

*"I would approach this project as a balanced wet/dry candidate. My primary work will be the experimental characterization, perturbation, and mechanical stimulation described in the aims. In parallel, I will develop the image analysis pipeline that Dr. Labouesse identified as a concrete need — GlycoQuant, a standardized, open-source extraction of glycocalyx and mechanotransduction features from fluorescence microscopy, which I have already begun prototyping (GitHub link). As the project matures and initial perturbations reveal measurable phenotypes, I would explore three independent computational directions that directly serve the ad-specified aims: a morphological perturbation atlas quantifying how genetic, enzymatic, and metabolic interventions reshape the glycocalyx–mechanotransduction state; a hexosamine pathway flux model linking metabolic switches to predicted glycocalyx composition, addressing the metabolism–mechanosensitivity hypothesis explicitly named in the position description; and Bayesian experimental design to help prioritize conditions across the combinatorial space of scaffold, perturbation, and drug. A fourth, more speculative direction — a polymer-brush physics-informed neural network predicting mechanical filter properties from composition — would sit at the intersection of the Tibbitt group's polymer physics expertise and my machine learning background, grounded in Alexander–de Gennes scaling and Paszek's kinetic trap mechanism."*
