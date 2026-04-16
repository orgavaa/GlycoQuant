# Heparan-sulfate channel — wet-lab protocol

The default WGA-lectin channel binds sialic acid + N-acetylglucosamine on the outer coat. **It does not bind heparan-sulfate (HS) glycosaminoglycan chains** — the polymer hanging off syndecans (SDC1–4), glypicans (GPC1/3/4/6), and the EXT1/2 / NDST1/2 / HPSE biosynthetic axis that the Labouesse/Tibbitt project specifically targets. For the SDC/GPC/EXT/HPSE perturbations the WGA readout is at best a co-regulated proxy and at worst measurement-blind.

The platform now exposes a sixth canonical channel slot, `heparan_sulfate`. When supplied, an anti-HS-antibody-stained channel runs through `extract_hs_features` (sibling of `extract_glycocalyx_features` — same ring geometry, texture, and Moran's I features, with `hs_*` output prefix). Both readouts can sit on the same per-cell DataFrame.

This document is the wet-lab protocol the channel expects. The code accepts the channel today; the data depends on you running this stain.

## Recommended antibody

| Clone | Epitope | Source | Typical IF dilution |
|---|---|---|---|
| **10E4** | HS-3-O-sulfated motif (broad HS detection) | AMSBIO 370255-1, Seikagaku 370255 | 1:100 (lots vary; titrate) |
| **F58-10E4** | Identical 10E4 epitope, different fixation tolerance | USBiological H1890-10, AMSBIO 370600 | 1:100 |
| **3G10** | HS stub (post-heparitinase digestion only) | AMSBIO 370260-1 | 1:100 — special-purpose, do NOT use for native HS |

10E4 is the standard choice. Galustian *et al.*, *Glycoconj J* 12, 202–209 (1995) characterised the epitope and remains the canonical reference. Use F58-10E4 if your fixation protocol disrupts the 10E4 epitope (PFA + ice-cold MeOH permeabilisation is the most common offender).

## Protocol (adherent monolayer, 2D)

1. **Plate** cells on coverslips or glass-bottom 96-well at the density used for the rest of the GlycoQuant pipeline (DAPI, WGA, YAP, paxillin, phalloidin).
2. **Fix** in 4% paraformaldehyde (PFA) in PBS, 15 min, room temperature. **Do NOT use methanol-only or ice-cold methanol** — disrupts the 10E4 epitope.
3. **Wash** 3 × 5 min in PBS.
4. **Block** in 5% BSA + 0.1% Tween-20 in PBS, 30 min, room temperature. Avoid normal serum; some HS-containing sera generate background.
5. **Stain** with the chosen anti-HS antibody at the working dilution in blocking buffer, 1 h at room temperature OR overnight at 4 °C.
6. **Wash** 3 × 5 min in PBS.
7. **Secondary**: Alexa-conjugated anti-mouse IgM (10E4 / F58-10E4 are both IgM — *not* IgG, common mistake). Pick a fluorophore that doesn't overlap with WGA (typically Alexa-647 or Alexa-405). 1 h at room temperature.
8. **Wash** 3 × 5 min in PBS.
9. **Counterstain + mount** as in the rest of the GlycoQuant protocol.

**Critical do/don't list:**

- **DO** image both WGA and HS channels at the same z-plane and pixel-size (`AssemblerConfig.pixel_size_um` is shared across channels).
- **DO** include a heparitinase-treated control well as a negative — heparitinase digests HS off the cell surface and the 10E4 signal should drop to background. This is the on-experiment proof your stain is HS-specific rather than off-target.
- **DON'T** use methanol fixation — it destroys the 10E4 epitope.
- **DON'T** use anti-mouse IgG secondary — 10E4 is IgM. The wrong secondary gives no signal.
- **DON'T** synthesise HS from WGA on the backend. The platform refuses to do this; the extractor only runs on a real `heparan_sulfate` channel input.

## Channel assignment

In the GlycoQuant Analysis tab, assign your HS-stained channel to the **`heparan_sulfate`** slot in the channel-assignment panel. The pipeline will:

- Run the WGA extractor on the `glycocalyx` slot (as before)
- Run the sibling `extract_hs_features` on the `heparan_sulfate` slot
- Both result columns (`glycocalyx_*` and `hs_*`) appear in the per-cell CSV
- Cross-modal predictor and the glyco↔mechano correlation heatmap pick up `hs_*` automatically — both polymer readouts get scored independently against the mechanotransduction signature

If the slot is left empty, the pipeline runs exactly as before with no `hs_*` columns. There is no penalty for not supplying HS data.

## Validation expectations

For a Labouesse-protocol experiment:

- **siSDC1** should reduce `hs_pericellular_ratio` (syndecan-1 carries HS chains; KD reduces surface HS density) and *might* reduce `glycocalyx_pericellular_ratio` weakly (SDC1 also carries some sialic-acid-bearing glycoproteins).
- **HPSE overexpression** should reduce `hs_pericellular_ratio` (heparanase cleaves HS) but leave `glycocalyx_pericellular_ratio` largely unchanged (WGA targets are HPSE-resistant).
- **EXT1 KD** should reduce `hs_pericellular_ratio` (EXT1 polymerises the HS chain) without affecting WGA.

A useful negative-control sanity check: the **heparitinase-treated well** should drop `hs_*` features to near-background while leaving `glycocalyx_*` features intact. If the WGA features also drop, the heparitinase treatment is either non-specific or the cells are damaged — re-run.

## References

- Galustian C, Childs RA, Yuen C-T *et al.* Valency dependent patterns of binding of human L-selectin toward sialyl and sulphated oligosaccharides of Le^a and Le^x types: relevance to anti-adhesion therapeutics. *Biochemistry* 36, 5260–5266 (1997). [DOI](https://doi.org/10.1021/bi962887a) — and the earlier 10E4 epitope characterisation in *Glycoconj J* 12, 202–209 (1995).
- David G, Bai XM, Van der Schueren B *et al.* Developmental changes in heparan sulfate expression: in situ detection with mAbs. *J Cell Biol* 119, 961–975 (1992). [DOI](https://doi.org/10.1083/jcb.119.4.961) — original 10E4 characterisation.
- Multhaupt HAB & Couchman JR. Heparan sulfate biosynthesis: methods for investigation of the heparanosome. *J Histochem Cytochem* 60, 908–915 (2012). [DOI](https://doi.org/10.1369/0022155412460056) — practical IF protocol notes.
