# UI Science Guidelines

> "From the same image, we quantify glycocalyx state, mechanotransduction state, and their coupling."

This is the one sentence the entire interface must serve. If a screen, card, or interaction does not advance that sentence, it does not belong on Tab 1.

These rules govern how GlycoQuant presents single-cell mechanobiology data to a PI, a postdoc, and a technically strong reviewer. They are deliberately stricter than generic dashboard guidance because the primary target is **scientific trust**, not product engagement.

---

## 1. Audience and success conditions

Users in priority order:
1. **PI** — needs to grasp the biological story in <30 seconds.
2. **Mechanobiology postdoc** — needs to drill into individual cells and verify the methodology.
3. **Technical reviewer** — needs to audit how every number was computed.

A reviewer must be able to:
- State what the screen is about in one sentence.
- Identify the headline result without scrolling on a 14" laptop.
- Trace any displayed score back to its segmentation, channel mapping, and feature equation.

---

## 2. Information architecture

Tab 1 has **exactly four sub-views**, in this fixed order:

| View | Purpose | Time-on-task |
|---|---|---|
| **Overview** | Hero screen — answers the thesis premise at a glance | 30 s |
| **Single Cell** | Inspection screen — drill into one selected cell | 2 min |
| **Condition Compare** | Experimental screen — control vs perturbation effect sizes | 5 min |
| **Methods & QC** | Trust screen — segmentation QC, exclusion rules, parameter provenance | as needed |

No fifth view. New surfaces must replace one of these or live as a progressive-disclosure drawer inside one of them.

---

## 3. Overview screen — strict content order

The Overview is a 12-column grid on desktop (≥1280 px), single-column stack on mobile.

```
desktop:                          mobile:
┌──────── 1–7 ────────┬─ 8–12 ─┐  ┌─ hero metrics ─┐
│                     │ metrics │  ├────────────────┤
│  microscopy canvas  ├────────┤  │  image canvas  │
│                     │ heatmap │  ├────────────────┤
│                     ├────────┤  │   heatmap      │
│                     │ score   │  ├────────────────┤
└─────────────────────┴────────┘  │  score dist.   │
┌──────── secondary plots ──────┐  ├────────────────┤
│  representative cells / etc.  │  │ representative │
└───────────────────────────────┘  └────────────────┘
```

Content order is **fixed**:
1. Hero metrics strip (3 numbers, no more)
2. Microscopy canvas
3. Glycocalyx ↔ mechanotransduction correlation heatmap
4. Mechanotransduction score distribution
5. Representative cells (top-3 by mechano score)
6. All-feature correlation **inside a collapsed panel**

Hero metrics, exactly three:
- **Cells analysed** — sample-size truth, before any averaging
- **Mean mechanotransduction score** — composite single-number readout
- **Strongest glyco↔mechano |r|** — the headline scientific finding

Do not surface "mean YAP", "mean FA count" etc. on Overview. They go on Single Cell or Methods & QC where the reader has already opted into detail.

---

## 4. Visual encoding rules

Honour pre-attentive ranking: **position > length > area > color hue**. Reserve hue for grouping, warnings and overlays.

- Quantitative comparisons: bar, line, dot, scatter, violin, histogram. No pies, no radial charts, no 3D.
- Diverging palettes only on data with a meaningful zero.
- **Never** use rainbow colormaps anywhere (heatmaps, overlays, traces).
- **Never** encode the same quantity in two channels at once (color *and* area).
- Categorical color scheme stays stable across screens. Biological channels keep fixed identities:
  - DAPI → blue
  - Glycocalyx (WGA/lectin) → green
  - YAP → magenta
  - Actin → amber
  - Focal adhesions → red-orange
- Sequential mechano-score ramp: a single hue ramp (default: charcoal → teal). Same ramp on the canvas overlay and the score histogram so the eye carries one mental model.
- QC palette: amber for warning, red for failure, neutral grey for "ok / uninteresting". No green ticks — green is reserved for the glycocalyx channel.

---

## 5. Microscopy canvas rules

The canvas is the product. Treat it like the cockpit of a scientific workstation, not a static image.

- Pan, zoom, hover, click-to-lock, lasso-select.
- **One** heat-style overlay active at a time. Mask outlines may coexist with one heat overlay.
- Overlay modes: segmentation, glycocalyx score, mechano score, cluster/state, corrected YAP, QC flags.
- A cell hovered anywhere in the UI highlights on the canvas, and vice versa.
- The selected cell ID is global state (Zustand) so Single Cell, Methods & QC and the canvas stay in sync.
- Image pane never collapses below 480 px wide on desktop. If the user shrinks the window past that, the right rail collapses first.

---

## 6. Score and state cards

### Mechano score card
Must show, in this order:
1. The histogram (or KDE)
2. Mean ± SD
3. PCA mode badge: `PCA · PC1 explains X% over N cells` **or** `Weighted-sum fallback (N < 30)`
4. A warning row when the fallback fired or when fewer than 50% of cells contributed

### Cell state card (Single Cell view)
For the selected cell:
- Cell ID + condition label
- A **plain English summary line**, e.g. *"High glycocalyx heterogeneity, high corrected YAP, aligned actin, mature adhesions."*
- Mechano score + percentile within the image
- Top 3 glycocalyx feature deviations (z-score vs population)
- Corrected YAP N/C, actin coherence, FA mature fraction
- QC badges: segmentation OK, mitosis flag, edge-clipped flag

### Methods provenance card
A reviewer audit surface. Always lists:
- Segmentation model + version + parameters used
- Pixel size (µm/px) and how it was set (manifest / sidebar override)
- Number of detected cells, excluded cells, and exclusion reasons
- YAP size-correction slope and R²
- Mechano-score loadings table
- Software version, image hash, timestamp

---

## 7. Interaction model

Every interaction must answer one of four questions:
- *What changed?*
- *Where is it?*
- *How strong is it?*
- *Can I trust it?*

Rules:
- **Hover** reveals, **click** persists, **double-click** resets.
- Every chart cross-highlights with the canvas where applicable.
- Every summary metric is clickable and recolours the canvas by that metric.
- Every derived metric exposes a "how computed" drawer that points back to the relevant Methods & QC entry.
- Progressive disclosure first, density second.

---

## 8. States and failure modes

The UI must have explicit visual states for:

| State | Visual treatment |
|---|---|
| Loading | Skeleton that mirrors the final layout |
| Partial result | Card renders with `—` placeholders + a small "computing" badge |
| QC warning | Amber border + tooltip explaining the threshold that fired |
| Low-cell PCA fallback | Yellow banner inside the mechano-score card |
| Feature unavailable (channel missing) | Card greyed out + "channel not provided" line; **never silently empty** |
| Segmentation failed | Red banner replacing the canvas with the failure cause |

The interface must keep working when one module returns NaN. A NaN is rendered as `—`, never as `0` or a blank.

---

## 9. Visual language

- Sans-serif only. 4 text sizes maximum on a screen.
- Tabular numerals on every numeric display.
- Hero metric numbers at ~2× body size, aligned to a baseline grid.
- Cards have weight tiers:
  - **Tier 1** (largest, highest border contrast): canvas, glyco↔mechano heatmap, mechano score
  - **Tier 2**: representative cells, condition strip, single-cell evidence panel
  - **Tier 3**: tables, QC detail, all-feature correlation, parameter logs
- Whitespace > decorative chrome. No drop shadows on data cards.

---

## 10. Quality bar — the screen ships only when

A reviewer can tick all of these without prompting:

- [ ] I can explain the screen in one sentence.
- [ ] The headline result is visible without scrolling on a 14" laptop.
- [ ] The first chart is biologically meaningful, not merely computational.
- [ ] Every number on screen can be traced back to a method via at most two clicks.
- [ ] The interface still works when one module returns NaN.
- [ ] No rainbow heatmaps, no 3D, no pie, no decorative color.
- [ ] The strict Overview content order is preserved.
- [ ] Hero metric count is **3**, not 4, not 7.

If any box is unchecked, the screen does not ship.

---

## 11. What we explicitly defer

Listed here so PRs do not silently re-add them:
- Heavy explainability panels (TCAV, attention maps).
- Full DINOv2 embedding explorer (UMAP scatter is fine, but no live cluster surgery).
- Multi-batch cohort browser (one batch at a time on Tab 1).
- Per-user theme personalization, dark/light toggle beyond the default theme.

These will be revisited when there is concrete user demand or scientific need, not before.
