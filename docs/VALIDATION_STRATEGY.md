# Ground-truth validation strategy

The platform measures pericellular WGA distribution at single-cell resolution and ranks glycocalyx perturbations against a 15-gene mechanotransduction signature. Neither claim has been validated against ground truth in the current build. This document records what was investigated, what is blocked, and what is the next concrete step.

## Status summary (April 2026)

| Target paper | Image deposit? | Action |
|---|---|---|
| Paszek *et al.*, *Nature* 2014 (cancer glycocalyx → integrin priming) | **None.** No data availability statement; "scripts on request" only. | Email author (~2-6 week latency). Defer. |
| Möckl *et al.*, *Dev Cell* 2019 (super-resolution glycocalyx) | **None.** Paper states "raw images and analysis scripts upon reasonable request." | Email Möckl group at MPL Erlangen — actively open-sources code, fastest likely response. Use the moecklgroup/SimulationOfIndividualGlycanCoordinates repo for synthetic ground truth in the meantime. |
| Barai *et al.*, *PNAS Nexus* 2024 (bulky glycocalyx → invasiveness) | **None.** | Email author. Defer. |
| Hamrangsekachaee *et al.* "*Trends Cell Biol* 2025" | **Citation does not resolve** — likely not yet published or misremembered. Hamrangsekachaee has 2022–2024 papers with Ebong on endothelial glycocalyx, none with image deposits. | Drop from validation candidates. |

**Verdict:** A pixel-level reanalysis of any of these three papers is **blocked on cold-emails**. Expect 2–6 week latency. Not feasible inside a single sprint.

## Recommended pivot — JUMP Cell Painting validation

**JUMP-CP (Chandrasekaran *et al.*, *Nat Methods* 2024)** is a 115 TB Cell Painting dataset on AWS S3 (`s3://cellpainting-gallery/cpg0000-jump-pilot`, no-sign-request, fully public). Every well includes a WGA-stained glycan channel ("AGP" — actin/Golgi/plasma membrane) and the dataset spans CRISPR + ORF + compound perturbations.

**Glycocalyx-relevant perturbations in JUMP-CP:**
- `GALNT7` (mucin O-glycosylation initiation)
- `MUC1`, `MUC16` (apical mucins, primary glycocalyx scaffolds)
- `ST6GAL1` (α2,6-sialylation — direct WGA target)
- `B4GALT1` (glycoprotein galactosylation)
- `MGAT5` (N-glycan branching on integrins)
- `GFPT1` (hexosamine biosynthesis rate-limiting)

These overlap directly with GlycoQuant's curated 22-gene panel.

### Validation experiment design

1. **Download** ~50–200 GB WGA-channel subset from JUMP-CP filtered to the perturbation list above plus matched DMSO controls. Use the `cellpainting-gallery` S3 prefix and `aws s3 cp --no-sign-request --recursive`.
2. **Run** GlycoQuant's `extract_glycocalyx_features` on each cell. Aggregate per-condition.
3. **Test 1 — separation:** does the per-condition mean of `glycocalyx_pericellular_ratio` distinguish the WGA-direct hits (ST6GAL1, GALNT7) from DMSO at p < 0.05 (Mann-Whitney)?
4. **Test 2 — direction:** are the effect signs biologically consistent? ST6GAL1 KO should reduce sialic-acid loading → lower WGA mean intensity. GALNT7 KO should reduce mucin O-glycans → lower pericellular ratio.
5. **Test 3 — ranking recovery:** does the dynamic Tab 2 reranking (using the JUMP-CP ST6GAL1 image's features as input) promote ST6GAL1 above the median of the 22-gene panel? This is a positive-control retrospective validation of the per-image weight inference.

### Möckl simulation as accuracy unit-test

The `moecklgroup/SimulationOfIndividualGlycanCoordinates` GitHub repo generates synthetic PAINT data with **known ground-truth height + density** of individual glycopolymer chains. Run GlycoQuant's `radial_decay_rate` and `pericellular_ratio` against synthetic images at varying brush heights (50/200/500 nm) and document the recovery error.

This is a *unit test of feature accuracy on synthetic ground truth*, not an *external biology validation*. It complements but does not replace the JUMP-CP work.

## Concrete next-session deliverable

A `scripts/validate_against_jump_cp.py` that:
- Takes a `--perturbations` arg (default: `ST6GAL1,GALNT7,MUC1,MUC16,B4GALT1,MGAT5,GFPT1`).
- Streams the relevant WGA channels from S3 (no full local download — process per-image).
- Runs the feature extractor, aggregates per-condition, runs Mann-Whitney vs DMSO controls.
- Writes `results/jump_cp_validation.json` with per-condition effect sizes, p-values, and the dynamic-ranking outputs.
- Generates a Plotly figure committed as `data/validation/jump_cp_separation.png` for the Methods section.

Estimated runtime: ~1 day implementation + 1 day data download/run on a workstation with reliable S3 connectivity. AWS egress free with `--no-sign-request` from a cellpainting-gallery prefix.

## Cold-email template (Möckl group, highest-priority outreach)

Subject: GlycoQuant — request for Möckl 2019 raw images for pipeline validation

Hello Prof. Möckl,

I am building an open-source single-cell glycocalyx-mechanotransduction analysis pipeline (GlycoQuant, github.com/orgavaa/GlycoQuant) for a PhD project in the Tibbitt / Labouesse group at ETH Zürich. I would like to validate the pipeline's confocal-resolution pericellular feature extractors against your 2019 *Dev Cell* PAINT super-resolution data, specifically the recovery of brush height and density on the published cell types.

Would you be willing to share the raw or pre-processed image stacks under any reuse terms you specify? The validation results would be open-sourced with explicit attribution and we would be happy to coordinate timing with any ongoing work. Your existing `moecklgroup/SimulationOfIndividualGlycanCoordinates` repo is excellent for synthetic-ground-truth tests but does not substitute for empirical recovery on real cells.

Best,
Valentin Uzan

## References

- Chandrasekaran SN *et al.* JUMP Cell Painting dataset. *Nat Methods* 21, 1114–1121 (2024). [10.1038/s41592-024-02241-6](https://doi.org/10.1038/s41592-024-02241-6)
- Bray MA *et al.* A dataset of images and morphological profiles of 30 000 small-molecule treatments. *Gigascience* 6, giw014 (2017). [10.1093/gigascience/giw014](https://doi.org/10.1093/gigascience/giw014)
- Möckl L *et al.* Dev Cell 50, 57–72 (2019). [10.1016/j.devcel.2019.02.020](https://doi.org/10.1016/j.devcel.2019.02.020)
- Cell Painting Gallery download instructions: https://broadinstitute.github.io/cellpainting-gallery/download_instructions.html
- JUMP-CP datasets repo: https://github.com/jump-cellpainting/datasets
