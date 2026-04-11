/**
 * Condition Compare — Stitch experimental screen.
 *
 * Layout per stitch/condition_compare/code.html:
 *   - Editorial header (display-md, max-w-2xl description with
 *     Control vs Perturbation framing)
 *   - Band 1: 3 effect-size cards (Cohen's d, trend arrow, hairline
 *     progress bar) — colour swatch top-right per channel
 *   - Band 2: 8/4 split — KDE distribution (large) + feature-delta
 *     bars (small)
 *   - Band 3: Phenotype Snapshots — 2-column control vs perturbation
 *     grid with thumbnail tiles
 *   - Footer: 5-channel legend
 *
 * Multi-condition support is not in Phase 1 scope. This view shows
 * the IA placeholder per UI_SCIENCE_GUIDELINES §11 — clearly marked
 * "coming next" panels with the Stitch visual language so the
 * eventual real implementation drops into the same shell.
 */
export function CompareView() {
  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10">
      <header className="mb-12">
        <h1 className="text-[2.75rem] font-headline font-medium tracking-tighter text-on-surface leading-none mb-4">
          Experimental Comparison
        </h1>
        <p className="text-on-surface-variant max-w-2xl text-sm leading-relaxed">
          Comparative analysis of <span className="font-semibold">control</span>{" "}
          vs <span className="font-semibold">perturbation</span> populations
          from a paired image cohort. Multi-image cohorts are scheduled for
          the Phase 2 cohort loader; the layout below is locked so the real
          implementation drops in without any visual rework.
        </p>
      </header>

      {/* Band 1 — Effect-size cards (placeholder copy) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <EffectSizeCard
          label="Effect Size · Glycocalyx"
          channelColor="#00FF00"
          value="—"
          trend="flat"
          interpretation="Reduction in WGA shell density (Cohen's d, p)"
        />
        <EffectSizeCard
          label="Effect Size · YAP N/C"
          channelColor="#FF00FF"
          value="—"
          trend="flat"
          interpretation="Nuclear translocation under stiffness gradient"
        />
        <EffectSizeCard
          label="Composite Mechano-Score"
          channelColor="#FFBF00"
          value="—"
          trend="flat"
          interpretation="PC1-weighted shift across the curated panel"
        />
      </section>

      {/* Band 2 — Distribution (8) + Feature delta (4) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
        <div className="lg:col-span-8 bg-surface-container-lowest p-8 ghost-border">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight">
                Condition Distribution · Mechano Score
              </h2>
              <p className="text-xs text-on-surface-variant mt-1">
                Kernel density estimation with 95% confidence intervals
              </p>
            </div>
            <div className="flex gap-4">
              <LegendDot color="bg-on-surface-variant/40" label="Control" />
              <LegendDot color="bg-primary" label="Perturbation" />
            </div>
          </div>
          <div className="h-64 ghost-border bg-surface-container-low/40 flex items-center justify-center">
            <p className="text-[10px] text-on-surface-variant uppercase tracking-[0.2em]">
              Distribution Plot · Awaiting Cohort Data
            </p>
          </div>
        </div>
        <div className="lg:col-span-4 bg-surface-container-lowest p-8 ghost-border">
          <h2 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight mb-8">
            Feature Delta (Δ)
          </h2>
          <div className="space-y-6">
            <FeatureDeltaRow label="Glycocalyx volume" delta="—" tone="neutral" />
            <FeatureDeltaRow label="YAP N/C ratio" delta="—" tone="neutral" />
            <FeatureDeltaRow label="Actin coherence" delta="—" tone="neutral" />
            <FeatureDeltaRow label="FA mature fraction" delta="—" tone="neutral" />
          </div>
          <div className="mt-10 pt-4 ghost-border-t">
            <p className="text-[10px] text-on-surface-variant leading-relaxed uppercase">
              Cohen&apos;s d will populate once a paired control image is
              loaded.
            </p>
          </div>
        </div>
      </section>

      {/* Band 3 — Phenotype snapshots */}
      <section className="mb-12">
        <div className="flex items-center gap-4 mb-8">
          <h2 className="text-xl font-headline font-semibold tracking-tight text-on-surface">
            Phenotype Snapshots
          </h2>
          <div className="h-[1px] flex-1 bg-outline-variant/20" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            n = 0 matched specimens
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <SnapshotColumn
            title="Control (Quiescent)"
            accent="border-on-surface-variant"
          />
          <SnapshotColumn
            title="Perturbation (Reactive)"
            accent="border-primary"
          />
        </div>
      </section>

      {/* Footer channel legend */}
      <footer className="mt-20 pt-8 ghost-border-t flex flex-wrap gap-8">
        <ChannelLegend color="#0000FF" label="DAPI (Nucleus)" />
        <ChannelLegend color="#00FF00" label="WGA (Glycocalyx)" />
        <ChannelLegend color="#FF00FF" label="YAP" />
        <ChannelLegend color="#FFBF00" label="Actin" />
        <ChannelLegend color="#FF4500" label="Focal Adhesions" />
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------
// Tiny presentational helpers
// ---------------------------------------------------------------------

function EffectSizeCard({
  label,
  channelColor,
  value,
  trend,
  interpretation,
}: {
  label: string;
  channelColor: string;
  value: string;
  trend: "up" | "down" | "flat";
  interpretation: string;
}) {
  const trendIcon =
    trend === "up" ? "trending_up" : trend === "down" ? "trending_down" : "trending_flat";
  return (
    <div className="bg-surface-container-lowest p-6 ghost-border">
      <div className="flex justify-between items-start mb-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
        <div className="w-2 h-2" style={{ backgroundColor: channelColor }} />
      </div>
      <div className="text-3xl font-headline font-medium tracking-tighter text-on-surface tabular-nums">
        {value}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="material-symbols-outlined text-on-surface-variant text-sm">
          {trendIcon}
        </span>
        <span className="text-xs font-medium text-on-surface-variant">
          {interpretation}
        </span>
      </div>
      <div className="mt-6 h-1 w-full bg-surface-container">
        <div className="h-full bg-on-surface-variant/40" style={{ width: "0%" }} />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
        {label}
      </span>
    </div>
  );
}

function FeatureDeltaRow({
  label,
  delta,
  tone,
}: {
  label: string;
  delta: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneClass = {
    positive: "text-primary",
    negative: "text-error-stitch",
    neutral: "text-on-surface-variant",
  }[tone];
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-bold uppercase text-on-surface-variant">
        <span>{label}</span>
        <span className={`tabular-nums ${toneClass}`}>{delta}</span>
      </div>
      <div className="h-1.5 bg-surface-container-low overflow-hidden">
        <div className="h-full bg-on-surface-variant/30" style={{ width: "0%" }} />
      </div>
    </div>
  );
}

function SnapshotColumn({
  title,
  accent,
}: {
  title: string;
  accent: string;
}) {
  return (
    <div>
      <h3
        className={`text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4 border-l-2 ${accent} pl-3`}
      >
        {title}
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-square bg-surface-container-highest/40 ghost-border flex items-center justify-center text-on-surface-variant/30 text-[9px] uppercase tracking-widest">
              cell&nbsp;crop
            </div>
            <p className="text-[9px] font-medium text-on-surface-variant leading-tight font-mono tabular-nums">
              awaiting cohort
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelLegend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}
