import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Layers, Network, ArrowLeftRight } from "lucide-react";
import { Card } from "./Card";
import { PlotlyFigure } from "./PlotlyFigure";
import { useJobStore } from "@/lib/jobStore";
import {
  runPhenotypeDiscovery,
  runSpatialGNN,
  runCrossModal,
  type PhenotypeResponse,
  type SpatialGNNResponse,
  type CrossModalResponse,
} from "@/lib/api";
import type { JobResult } from "@/lib/api";

interface Props {
  result: JobResult;
}

// Collapsible module — exploratory, opt-in. Modules do not auto-run.
function Module({
  icon,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card noPadding>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-gray-400 flex-shrink-0">
          {open ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
        </span>
        <span className="text-gray-500 flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-gray-900">{title}</div>
          <div className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{subtitle}</div>
        </div>
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </Card>
  );
}

export function MLFeaturesPanel({ result }: Props) {
  const jobId = useJobStore(s => s.latestJobId);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Exploratory modules. Each runs on demand and reports descriptive statistics only —
        no module is required for the primary per-cell analysis.
      </p>
      <Module
        icon={<Layers size={14} strokeWidth={1.5} />}
        title="Embedding-defined cluster structure"
        subtitle="UMAP + Leiden on Cell-DINO embeddings. Reports cluster counts and per-cluster mean feature values — does not assert biological phenotype labels."
      >
        <PhenotypeSection result={result} jobId={jobId} />
      </Module>

      <Module
        icon={<Network size={14} strokeWidth={1.5} />}
        title="Spatial neighbourhood regression"
        subtitle="Delaunay graph + 2-layer GCN predicts mechano score from neighbourhood features. Reports held-out R² as a descriptor of local spatial structure."
      >
        <SpatialSection jobId={jobId} />
      </Module>

      <Module
        icon={<ArrowLeftRight size={14} strokeWidth={1.5} />}
        title="Cross-modal feature regression"
        subtitle="MLP regressing mechano features on glyco features (or reverse) with 5-fold CV. Reports per-target R² — does not imply mechanistic causation."
      >
        <CrossModalSection jobId={jobId} />
      </Module>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phenotype (UMAP + Leiden)
// ---------------------------------------------------------------------------

function PhenotypeSection({ result, jobId }: { result: JobResult; jobId: string | null }) {
  const phenotype = useJobStore(s => s.phenotypeResult);
  const setPhenotype = useJobStore(s => s.setPhenotypeResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = result.has_deep_features;

  const handleRun = async () => {
    if (!jobId) { setError("No job ID available — re-run the analysis."); return; }
    setLoading(true); setError(null);
    try {
      setPhenotype(await runPhenotypeDiscovery(jobId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canRun) {
    return (
      <div className="text-[12px] text-gray-500 py-2">
        Deep embeddings were not computed for this job. Re-run analysis with
        "Cell-DINO deep embeddings" enabled to activate this module.
      </div>
    );
  }

  if (!phenotype) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={handleRun}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-900 text-white text-[11px] font-medium rounded hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "Running UMAP + Leiden…" : "Compute clusters"}
        </button>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    );
  }

  return <PhenotypeResults data={phenotype} />;
}

function PhenotypeResults({ data }: { data: PhenotypeResponse }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-6 pb-3 border-b border-gray-100">
        <div>
          <div className="text-[18px] font-semibold text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>{data.n_clusters}</div>
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">clusters</div>
        </div>
        {Object.entries(data.cluster_sizes).slice(0, 5).map(([cid, size]) => (
          <div key={cid}>
            <div className="text-[14px] font-semibold text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{size}</div>
            <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">c{cid}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-[11px] text-gray-400 mb-2">Cell-DINO embeddings projected to 2D (UMAP), coloured by Leiden cluster.</div>
        <PlotlyFigure figureJson={data.landscape_figure_json} height={360} />
      </div>

      {data.cluster_summaries.length > 0 && (
        <div>
          <div className="text-[12px] font-semibold text-gray-900 mb-2">Per-cluster mean features</div>
          <div className="space-y-2">
            {data.cluster_summaries.map(cs => (
              <div key={cs.cluster_id} className="bg-gray-50 rounded p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-gray-900">Cluster {cs.cluster_id}</span>
                  <span className="text-[10px] text-gray-400">{cs.size} cells ({(cs.fraction * 100).toFixed(1)}%)</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(cs.mean_features).slice(0, 6).map(([feat, val]) => (
                    <div key={feat} className="text-[10px]">
                      <span className="text-gray-400">{feat.replace("glycocalyx_", "glyco.").replace("_", " ")}</span>
                      <div className="font-medium text-gray-800" style={{ fontFeatureSettings: "'tnum'" }}>
                        {Number.isFinite(val) ? val.toFixed(3) : "\u2014"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spatial GNN
// ---------------------------------------------------------------------------

function SpatialSection({ jobId }: { jobId: string | null }) {
  const spatial = useJobStore(s => s.spatialGNNResult);
  const setSpatial = useJobStore(s => s.setSpatialGNNResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!jobId) { setError("No job ID available — re-run the analysis."); return; }
    setLoading(true); setError(null);
    try { setSpatial(await runSpatialGNN(jobId)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  if (!spatial) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={handleRun}
          disabled={loading || !jobId}
          className="px-3 py-1.5 bg-gray-900 text-white text-[11px] font-medium rounded hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "Training GCN…" : "Fit spatial model"}
        </button>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    );
  }

  return <SpatialResults data={spatial} />;
}

function SpatialResults({ data }: { data: SpatialGNNResponse }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-6 pb-3 border-b border-gray-100">
        <div>
          <div className="text-[18px] font-semibold text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>{data.r2_score.toFixed(3)}</div>
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">R² (held-out)</div>
        </div>
        <div>
          <div className="text-[14px] font-semibold text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{data.n_edges}</div>
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">edges</div>
        </div>
        <div>
          <div className="text-[14px] font-semibold text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{data.mean_neighbors.toFixed(1)}</div>
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">mean degree</div>
        </div>
      </div>

      <div className="text-[11px] text-gray-500 leading-relaxed">
        R² is the held-out variance of mechano score explained by neighbourhood features on
        this image. Higher values indicate more spatial structure; low values do not exclude
        cell-autonomous regulation.
      </div>

      <div>
        <div className="text-[11px] text-gray-400 mb-2">Delaunay graph, nodes coloured by predicted mechano score.</div>
        <PlotlyFigure figureJson={data.graph_figure_json} height={360} />
      </div>

      <div>
        <div className="text-[11px] text-gray-400 mb-2">Input feature gradient magnitudes.</div>
        <PlotlyFigure figureJson={data.importance_figure_json} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cross-Modal Prediction
// ---------------------------------------------------------------------------

function CrossModalSection({ jobId }: { jobId: string | null }) {
  const crossModal = useJobStore(s => s.crossModalResult);
  const setCrossModal = useJobStore(s => s.setCrossModalResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"glyco_to_mechano" | "mechano_to_glyco">("glyco_to_mechano");

  const handleRun = async () => {
    if (!jobId) { setError("No job ID available — re-run the analysis."); return; }
    setLoading(true); setError(null);
    try { setCrossModal(await runCrossModal(jobId, direction)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  if (!crossModal) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded p-0.5">
          <button
            onClick={() => setDirection("glyco_to_mechano")}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              direction === "glyco_to_mechano" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            glyco {"\u2192"} mechano
          </button>
          <button
            onClick={() => setDirection("mechano_to_glyco")}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              direction === "mechano_to_glyco" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            mechano {"\u2192"} glyco
          </button>
        </div>
        <button
          onClick={handleRun}
          disabled={loading || !jobId}
          className="px-3 py-1.5 bg-gray-900 text-white text-[11px] font-medium rounded hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "Fitting MLP (5-fold CV)…" : "Fit regression"}
        </button>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    );
  }

  return <CrossModalResults data={crossModal} />;
}

function CrossModalResults({ data }: { data: CrossModalResponse }) {
  const arrow = "\u2192";
  const label = data.direction === "glyco_to_mechano"
    ? `glyco ${arrow} mechano`
    : `mechano ${arrow} glyco`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-6 pb-3 border-b border-gray-100">
        <div>
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">{label}</div>
          <div className="text-[18px] font-semibold text-gray-900 mt-0.5" style={{ fontFeatureSettings: "'tnum'" }}>
            {data.overall_r2.toFixed(3)}
          </div>
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">
            mean R² · {data.target_features.length} targets
          </div>
        </div>
      </div>

      <div className="text-[11px] text-gray-500 leading-relaxed">
        Cross-validated R² of an MLP fit on this image's feature matrix. The score describes
        shared variance between the two feature sets — it does not adjudicate direction of
        causality or underlying mechanism.
      </div>

      <div>
        <div className="text-[11px] text-gray-400 mb-2">Per-target held-out R² (5-fold CV).</div>
        <PlotlyFigure figureJson={data.r2_figure_json} />
      </div>

      <div>
        <div className="text-[11px] text-gray-400 mb-2">Input feature importance (gradient magnitude).</div>
        <PlotlyFigure figureJson={data.importance_figure_json} />
      </div>
    </div>
  );
}
