/**
 * Condition Compare — 1:1 React port of stitch/condition_compare/code.html
 * lines 143–406.
 *
 * Phase 1 has no multi-condition cohort loader, so every numeric slot
 * (effect sizes, KDE distributions, feature deltas) renders the Stitch
 * mock value as-is. Static cell-crop image URLs are kept verbatim from
 * the Stitch HTML. The FAB filter drawer is wired to local React state.
 *
 * The shell (top nav, right sidebar) is rendered by App.tsx.
 */
import { useState } from "react";

const STITCH_CONTROL_IMAGES = [
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuD0aJC8WE8uPVzr6eXnUpGed7AuiZrvrApfpEayGnko3sEKCI-K9W_ekn7PLqu4QxEhiv6nNofLSsqF32hVvGkMl9y51EQEyWxnXHQJVSXyygRlzATbVmI1Ts-83WXkLhNZZT9MI4-hBKhcB7Wyk2KzDALzWgLVdKZuOjzyE2FjVorvqTkp1GB_XcwgWloTGnsm5lt6Frfds-W05QbcrTZZwMaCpuCeUoTrgPJZbh3tB9Zl3f05W6o2dTcfRqNwU2llsvr1vAdYkKc",
    id: "0928-A",
    note: "Low Stress Signature",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBedJQy7Xwbqp2qmpUxGPmNR7dWqwrVHWH_-S0AySaG5T_JhSK_9pTx9UVvAoOekL614KJ2J1WBBmhzImFwTmT05amw5U2pcPADxQsi0rBAu3aAEpiX-7ahh2or_VFzOXjSMZiNBlAhhg5h0sLreRtpcOoeSFf-eJg2qcrntS_aRflodmm20nXvA7-z6sYeNcRU6OZNhBLboVxObE-5Ik3z3IQyO18Mc45veGKMV5YKQ3EWv2lDiBrdJzxVCxpX6mGw-N8psa4XcbI",
    id: "0928-B",
    note: "Thick Glyco Coat",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuD8qw_QCzlCBJaVnCU9xNnOqrxykBIc_ciXxgLiieULCh1IaNidVPtjgn0022u-1D-24UY5DFXQjnyj15P3jJOgFt_cynLeuEm1zCEqtErfghbhXmTK-a9PVcY305pmWpFXCJR__DHaPd1Ngc6JjqapnUf5TvTffiiq684_Ewa-6tE28ln_5PbEFjBqjqAZ4Z7qdJNTffsQWtMuEqe-n4-DvKXvLHSixZMHpZl_0G2TTvVJTrKUgH8QMK0wVUmpC9FN2DNXeOT6xMc",
    id: "0928-C",
    note: "Cytoplasmic YAP",
  },
];

const STITCH_PERTURBATION_IMAGES = [
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuAmr7CSXuz7gB3xuozc3UDWIH7d4gAFJI99AQPBFuLROyAW1uTWoMzXxvjE5zhj2RYgDnc2VXXrWycr92HmxaTd3E2IsB4pkXk0YLJFoJigDiICUM-8fp8ZQ0xAD2rnT-Gm1lAPleM3PIOeEAsuE5gk59Er5QwwccqSisvATM3hAYIRfvmInvy3-MZ-ffd3gyM-jz744qMNYe5nl_CQW0fSMdCk6axE2isPac7XDIvBGJw4ZGrx976NYADizbgIiRqRMuacGyV0Huk",
    id: "1142-X",
    note: "Thin Glycocalyx",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuD_3wCIsv4PI23Jg842aaBH53jnyI8JqGSDNXwmwxJWLmAjZBc7jqXIK9e3ed23xaCxAQxQl2If-HRnzddukb3iqBIlK2ec7MSoe5QAHTlbHiUh1WuvBU1AQnRX8KqPYdIl5KCRpv-GHR4iYt1e6Vz4EiFQJia3LN_WGxG_NJpLkr-okcQNeT-uniXD2UDLfyDLcLy617jtMG2of4F4tnPKaVilXNxxHDTSHa1VP0uUERvmhIDhyRffFjbmfFlcWNCY7r0dMTybzkY",
    id: "1142-Y",
    note: "Nuclear YAP Shift",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCClDsfHT414To18Zbp-flzavrG5AmLTC25mL0D7IB2HX0VSZNqIhDHj1ETXClsoTHR1MlVokprNkK72D1TC1J--PjgSkNjOIIT6EeQHuz37irJ9Igll_XlKsApC51Y6mt-wz9F0i-LNQ354zvRJlEbWHbInFQ50-M1hw7lWGX2QHxwXANDMeEFZgOmge3eAvut4PH9vJNcYaH1ptgS2bo_jBCLtud7xbNi4B9598ramqYN1Udxm8xQ-2eBNAxDzIiOU0WDt2LsC2I",
    id: "1142-Z",
    note: "Stress Fiber Bias",
  },
];

export function CompareView() {
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  return (
    <main className="min-h-screen p-8 bg-surface">
      <header className="mb-12">
        <h1 className="text-4xl font-headline font-semibold tracking-tight text-on-surface">
          Experimental Comparison
        </h1>
        <p className="text-on-surface-variant mt-2 max-w-2xl text-sm leading-relaxed">
          Compare a control population against a perturbation condition to
          quantify glycocalyx remodeling and mechanotransduction shifts at
          the population level. Load two image runs from the Overview tab
          to populate the effect-size cards, distribution overlays, and
          matched-specimen snapshots below.
        </p>
        <div className="mt-4 px-4 py-3 ghost-border bg-amber-500/5 text-amber-800 text-xs max-w-xl">
          <strong className="uppercase tracking-widest text-[10px]">
            Awaiting paired cohort
          </strong>
          <span className="mx-2">—</span>
          The comparison view activates once a second image condition is
          loaded. The layout below shows the target structure with
          reference values from published Cell Painting perturbation
          screens.
        </div>
      </header>

      {/* Band 1: Effect Size Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Card: Glycocalyx Composite */}
        <div className="bg-surface-container-lowest p-6 ghost-border">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Effect Size: Glycocalyx
            </span>
            <div className="w-2 h-2" style={{ backgroundColor: "#00FF00" }} />
          </div>
          <div className="text-3xl font-medium tracking-tighter font-headline text-on-surface tabular-nums">
            -0.42
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="material-symbols-outlined text-error-stitch text-sm">
              trending_down
            </span>
            <span className="text-xs font-medium text-on-surface-variant">
              Cohen&apos;s d (p &lt; 0.001)
            </span>
          </div>
          <div className="mt-6 h-1 w-full bg-surface-container flex">
            <div
              className="h-full bg-error-stitch"
              style={{ width: "42%" }}
            />
          </div>
          <p className="mt-3 text-[11px] text-on-surface-variant italic">
            Significant reduction in sialic acid density observed.
          </p>
        </div>

        {/* Card: YAP Translocation */}
        <div className="bg-surface-container-lowest p-6 ghost-border">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Effect Size: YAP Nucleus/Cyto
            </span>
            <div className="w-2 h-2" style={{ backgroundColor: "#FF00FF" }} />
          </div>
          <div className="text-3xl font-medium tracking-tighter font-headline text-on-surface tabular-nums">
            +0.68
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="material-symbols-outlined text-primary text-sm">
              trending_up
            </span>
            <span className="text-xs font-medium text-on-surface-variant">
              Cohen&apos;s d (p &lt; 0.001)
            </span>
          </div>
          <div className="mt-6 h-1 w-full bg-surface-container flex justify-end">
            <div className="h-full bg-primary" style={{ width: "68%" }} />
          </div>
          <p className="mt-3 text-[11px] text-on-surface-variant italic">
            Robust mechanical activation and nuclear translocation.
          </p>
        </div>

        {/* Card: Mechano Score */}
        <div className="bg-surface-container-lowest p-6 ghost-border">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Composite Mechano-Score
            </span>
            <div className="w-2 h-2" style={{ backgroundColor: "#FFBF00" }} />
          </div>
          <div className="text-3xl font-medium tracking-tighter font-headline text-on-surface tabular-nums">
            Δ 12.4%
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="material-symbols-outlined text-primary text-sm">
              analytics
            </span>
            <span className="text-xs font-medium text-on-surface-variant">
              Global integrated shift
            </span>
          </div>
          <div className="mt-6 flex items-end gap-1 h-8">
            <div className="bg-surface-container-highest w-full h-4" />
            <div className="bg-primary w-full h-6" />
          </div>
          <p className="mt-3 text-[11px] text-on-surface-variant italic">
            Weighted average of cytoskeletal and glycocalyx markers.
          </p>
        </div>
      </section>

      {/* Band 2: Comparison Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
        {/* Distribution Plot (Large) */}
        <div className="lg:col-span-8 bg-surface-container-lowest p-8 ghost-border">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight">
                Condition Distribution: Mechano Score
              </h2>
              <p className="text-xs text-on-surface-variant mt-1">
                Kernel density estimation with 95% Confidence Intervals
              </p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-300" />
                <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                  Control
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                  Perturbation
                </span>
              </div>
            </div>
          </div>
          {/* Simulated Density Chart — Stitch SVG kept verbatim */}
          <div className="h-64 relative flex items-end">
            <svg className="w-full h-full" viewBox="0 0 1000 200" preserveAspectRatio="none">
              <path
                d="M0,180 Q150,180 250,80 T450,180 T700,180 T1000,180"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2"
              />
              <path
                d="M0,180 Q150,180 250,80 T450,180 T700,180 T1000,180 L1000,200 L0,200 Z"
                fill="#94a3b8"
                fillOpacity="0.1"
              />
              <path
                d="M0,180 Q300,180 500,40 T750,180 T1000,180"
                fill="none"
                stroke="#343dff"
                strokeWidth="2"
              />
              <path
                d="M0,180 Q300,180 500,40 T750,180 T1000,180 L1000,200 L0,200 Z"
                fill="#343dff"
                fillOpacity="0.1"
              />
            </svg>
            <div className="absolute -bottom-6 left-0 w-full flex justify-between text-[9px] uppercase font-bold text-on-surface-variant tracking-tighter">
              <span>Low Mechanical Stress</span>
              <span>Population Shift</span>
              <span>High Mechanical Stress</span>
            </div>
          </div>
        </div>

        {/* Top Changing Features (Small) */}
        <div className="lg:col-span-4 bg-surface-container-lowest p-8 ghost-border">
          <h2 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-tight mb-8">
            Feature Delta (Δ)
          </h2>
          <div className="space-y-6">
            <FeatureDeltaRow label="Sialic Acid Vol." delta="-14.2%" tone="negative" pct={65} />
            <FeatureDeltaRow label="Nuclear Circ." delta="+2.1%" tone="neutral" pct={15} />
            <FeatureDeltaRow label="Actin Alignment" delta="+38.5%" tone="positive" pct={85} />
            <FeatureDeltaRow label="YAP N/C Ratio" delta="+22.8%" tone="positive" pct={55} />
          </div>
          <div className="mt-10 border-t border-outline-variant/15 pt-4">
            <p className="text-[10px] text-on-surface-variant leading-relaxed uppercase">
              The most significant remodeling is observed in cytoskeletal alignment and glycocalyx thinning.
            </p>
          </div>
        </div>
      </section>

      {/* Band 3: Representative Cells */}
      <section className="mb-12">
        <div className="flex items-center gap-4 mb-8">
          <h2 className="text-xl font-headline font-semibold tracking-tight text-on-surface">
            Phenotype Snapshots
          </h2>
          <div className="h-[1px] flex-1 bg-outline-variant/15" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            n=6 Matched Specimens
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Control Column */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4 border-l-2 border-slate-300 pl-3">
              Control (Quiescent)
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {STITCH_CONTROL_IMAGES.map((cell) => (
                <div key={cell.id} className="space-y-2">
                  <div className="aspect-square bg-slate-200 overflow-hidden relative group">
                    <img
                      alt="control cell"
                      className="w-full h-full object-cover"
                      src={cell.src}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white material-symbols-outlined">
                        zoom_in
                      </span>
                    </div>
                  </div>
                  <p className="text-[9px] font-medium text-on-surface-variant leading-tight">
                    Cell ID: {cell.id}
                    <br />
                    {cell.note}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Perturbation Column */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4 border-l-2 border-primary pl-3">
              Perturbation (Reactive)
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {STITCH_PERTURBATION_IMAGES.map((cell) => (
                <div key={cell.id} className="space-y-2">
                  <div className="aspect-square bg-slate-200 overflow-hidden relative group">
                    <img
                      alt="perturbation cell"
                      className="w-full h-full object-cover"
                      src={cell.src}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 bg-error-stitch/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white material-symbols-outlined">
                        zoom_in
                      </span>
                    </div>
                  </div>
                  <p className="text-[9px] font-medium text-on-surface-variant leading-tight">
                    Cell ID: {cell.id}
                    <br />
                    {cell.note}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Legend Section */}
      <footer className="mt-20 pt-8 border-t border-outline-variant/20 flex flex-wrap gap-8">
        <ChannelLegend color="#0000FF" label="DAPI (Nucleus)" />
        <ChannelLegend color="#00FF00" label="WGA (Glycocalyx)" />
        <ChannelLegend color="#FF00FF" label="YAP (Mechanotransduction)" />
        <ChannelLegend color="#FFBF00" label="Actin (Cytoskeleton)" />
        <ChannelLegend color="#FF4500" label="Focal Adhesions" />
      </footer>

      {/* Floating Filter Drawer FAB */}
      <div className="fixed bottom-8 left-8 z-50">
        <button
          type="button"
          onClick={() => setShowFilterDrawer((v) => !v)}
          className="bg-on-surface text-surface py-3 px-5 rounded-full shadow-2xl flex items-center gap-3 hover:scale-105 transition-transform"
        >
          <span className="material-symbols-outlined">filter_alt</span>
          <span className="text-xs font-semibold uppercase tracking-widest">
            Adjust Thresholds
          </span>
        </button>
      </div>

      {/* Hidden Filter Overlay */}
      {showFilterDrawer && (
        <div className="fixed inset-0 z-40 bg-on-surface/5 backdrop-blur-sm pointer-events-none">
          <div className="absolute left-8 bottom-24 w-80 bg-surface-container-lowest p-6 ghost-border shadow-xl pointer-events-auto">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-bold uppercase tracking-widest">
                Filter Controls
              </span>
              <button
                type="button"
                onClick={() => setShowFilterDrawer(false)}
                className="material-symbols-outlined text-xs cursor-pointer text-on-surface-variant"
              >
                close
              </button>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-on-surface-variant">
                  Min. Cell Confidence
                </label>
                <input
                  type="range"
                  className="w-full accent-primary"
                  defaultValue={85}
                />
                <div className="flex justify-between text-[9px] text-on-surface-variant">
                  <span>0.50</span>
                  <span>0.85</span>
                  <span>1.00</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-on-surface-variant">
                  Nuclear Area Cutoff (μm²)
                </label>
                <input
                  type="range"
                  className="w-full accent-primary"
                  defaultValue={120}
                />
              </div>
              <button
                type="button"
                className="w-full py-2 bg-surface-container text-[10px] font-bold uppercase tracking-widest hover:bg-surface-container-high transition-colors"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------
// Tiny presentational helpers
// ---------------------------------------------------------------------

function FeatureDeltaRow({
  label,
  delta,
  tone,
  pct,
}: {
  label: string;
  delta: string;
  tone: "positive" | "negative" | "neutral";
  pct: number;
}) {
  const deltaClass = {
    positive: "text-primary",
    negative: "text-error-stitch",
    neutral: "text-on-surface-variant",
  }[tone];
  const barClass = {
    positive: "bg-primary",
    negative: "bg-error-stitch",
    neutral: "bg-on-surface-variant",
  }[tone];
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-bold uppercase text-on-surface-variant">
        <span>{label}</span>
        <span className={`tabular-nums ${deltaClass}`}>{delta}</span>
      </div>
      <div className="h-1.5 bg-surface-container-low overflow-hidden">
        <div className={`h-full ${barClass}`} style={{ width: `${pct}%` }} />
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
