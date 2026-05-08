import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Layers, Network, ArrowLeftRight, Play } from "lucide-react";
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
  question,
  method,
  defaultOpen = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  question: string;
  method: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card noPadding>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50"
      >
        <span className="text-gray-400 flex-shrink-0 mt-0.5">
          {open ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
        </span>
        <span className="text-gray-500 flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-gray-950">{title}</div>
          <div className="mt-1 text-[12px] leading-relaxed text-gray-700">{question}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-gray-500">
            <span className="mr-1.5 font-semibold uppercase text-gray-400">method</span>
            {method}
          </div>
        </div>
      </button>
      {open && <div className="border-t border-gray-100 px-4 pb-4 pt-3">{children}</div>}
    </Card>
  );
}

// Standardised "run" button — readable, with a play affordance and explicit state copy.
function RunButton({
  loading,
  disabled,
  onClick,
  idleLabel,
  loadingLabel,
}: {
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
  idleLabel: string;
  loadingLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="inline-flex items-center gap-2 rounded-md bg-gray-950 px-4 py-2 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {loading ? (
        <>
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          {loadingLabel}
        </>
      ) : (
        <>
          <Play size={12} strokeWidth={1.5} />
          {idleLabel}
        </>
      )}
    </button>
  );
}

export function MLFeaturesPanel({ result }: Props) {
  const jobId = useJobStore(s => s.latestJobId);

  return (
    <div className="flex flex-col gap-3">
      <Card className="!border-gray-200 !bg-gray-50">
        <h3 className="mb-1 text-[13px] font-semibold text-gray-950">Exploratory ML</h3>
        <p className="text-[12px] leading-relaxed text-gray-600">
          Optional image-local models. Outputs are descriptive and do not establish biological causality.
        </p>
      </Card>

      <Module
        icon={<Layers size={14} strokeWidth={1.5} />}
        title="Embedding landscape"
        question={"Cell-DINO embeddings projected into a two-dimensional cell-state map."}
        method={"5120-d Cell-DINO ViT-L/16 features; UMAP projection; Leiden community detection. Cluster labels are arbitrary."}
      >
        <PhenotypeSection result={result} jobId={jobId} />
      </Module>

      <Module
        icon={<Network size={14} strokeWidth={1.5} />}
        title="Spatial graph"
        question={"Neighbourhood prediction of per-cell mechano score on the field graph."}
        method={"Delaunay neighbours; 2-layer GCN; held-out R² reported with spatial-block CV when possible."}
      >
        <SpatialSection jobId={jobId} />
      </Module>

      <Module
        icon={<ArrowLeftRight size={14} strokeWidth={1.5} />}
        title="Cross-modal regression"
        question={"Cross-validated prediction between WGA/glycan and mechanotransduction feature sets."}
        method={"Per-target MLP with 5-fold CV; reports held-out R² and gradient-magnitude feature influence."}
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
      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-[12px] text-amber-800">
        <span className="font-medium">Needs deep embeddings.</span>
        <span className="text-amber-700">Re-run the analysis with "Cell-DINO deep embeddings" enabled in the loader to activate this module.</span>
      </div>
    );
  }

  if (!phenotype) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <RunButton
          loading={loading}
          onClick={handleRun}
          idleLabel="Run model"
          loadingLabel="Computing UMAP + Leiden…"
        />
        <span className="text-[11px] text-gray-500">~10–30 s on typical fields.</span>
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
          <div className="mt-0.5 text-[9px] font-semibold uppercase text-gray-500">clusters</div>
        </div>
        {Object.entries(data.cluster_sizes).slice(0, 5).map(([cid, size]) => (
          <div key={cid}>
            <div className="text-[14px] font-semibold text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{size}</div>
            <div className="mt-0.5 text-[9px] font-semibold uppercase text-gray-500">c{cid}</div>
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
      <div className="flex items-center gap-3 flex-wrap">
        <RunButton
          loading={loading}
          disabled={!jobId}
          onClick={handleRun}
          idleLabel="Run graph"
          loadingLabel="Training GCN…"
        />
        <span className="text-[11px] text-gray-500">Trains a 2-layer GCN on this image (~5–15 s).</span>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    );
  }

  return <SpatialResults data={spatial} />;
}

function SpatialResults({ data }: { data: SpatialGNNResponse }) {
  const hasCv = data.cv_k !== undefined && data.cv_k > 0;
  const cvStrategy = data.cv_strategy ?? "random";
  const r2Std = data.r2_std ?? 0;
  const cvK = data.cv_k ?? 1;
  const strategyLabel = cvStrategy === "spatial" ? "spatial block CV" : "random split";
  const strategyTint =
    cvStrategy === "spatial"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-amber-50 text-amber-700 border-amber-200";
  const r2Label = hasCv
    ? cvStrategy === "spatial"
      ? `R² over ${cvK} spatial folds`
      : "R² (held-out, random split)"
    : "R² (held-out)";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-6 pb-3 border-b border-gray-100">
        <div>
          <div
            className="text-[18px] font-semibold text-gray-900 inline-flex items-baseline gap-1"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            <span>{data.r2_score.toFixed(3)}</span>
            {hasCv && cvStrategy === "spatial" && r2Std > 0 && (
              <span className="text-[12px] font-normal text-gray-500">
                ± {r2Std.toFixed(2)}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase text-gray-500">
            {r2Label}
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-medium normal-case ${strategyTint}`}
              title={
                cvStrategy === "spatial"
                  ? "Spatial block cross-validation via k-means on cell centroids. Stricter than a random split because the train/test boundary respects graph autocorrelation (Roberts 2017)."
                  : "Random 80/20 split — fell back from spatial because the image has too few cells or too few per-fold cells for block CV. R² is likely optimistic vs. the spatial estimate."
              }
            >
              {strategyLabel}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[14px] font-semibold text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{data.n_edges}</div>
          <div className="mt-0.5 text-[9px] font-semibold uppercase text-gray-500">edges</div>
        </div>
        <div>
          <div className="text-[14px] font-semibold text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{data.mean_neighbors.toFixed(1)}</div>
          <div className="mt-0.5 text-[9px] font-semibold uppercase text-gray-500">mean degree</div>
        </div>
      </div>

      <div className="text-[11px] text-gray-500 leading-relaxed">
        R² is the held-out variance of mechano score explained by neighbourhood features on
        this image. Higher values indicate more spatial structure; low values do not exclude
        cell-autonomous regulation.
        {cvStrategy === "spatial" && data.fold_r2_scores && data.fold_r2_scores.length > 1 && (
          <span className="block mt-1 text-gray-400">
            Per-fold R²:{" "}
            <span style={{ fontFeatureSettings: "'tnum'" }}>
              {data.fold_r2_scores.map((r, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {r.toFixed(2)}
                </span>
              ))}
            </span>
          </span>
        )}
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
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase text-gray-500">
            Prediction direction
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
            <button
              onClick={() => setDirection("glyco_to_mechano")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                direction === "glyco_to_mechano" ? "bg-gray-950 text-white shadow-sm" : "text-gray-500 hover:bg-white/70 hover:text-gray-950"
              }`}
            >
              glyco {"\u2192"} mechano
            </button>
            <button
              onClick={() => setDirection("mechano_to_glyco")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                direction === "mechano_to_glyco" ? "bg-gray-950 text-white shadow-sm" : "text-gray-500 hover:bg-white/70 hover:text-gray-950"
              }`}
            >
              mechano {"\u2192"} glyco
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <RunButton
            loading={loading}
            disabled={!jobId}
            onClick={handleRun}
            idleLabel="Run regression"
            loadingLabel="Fitting MLP (5-fold CV)…"
          />
          <span className="text-[11px] text-gray-500">5-fold cross-validated MLP per target (~10–30 s).</span>
          {error && <span className="text-[11px] text-red-600">{error}</span>}
        </div>
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
          <div className="text-[9px] font-semibold uppercase text-gray-500">{label}</div>
          <div className="text-[18px] font-semibold text-gray-900 mt-0.5" style={{ fontFeatureSettings: "'tnum'" }}>
            {data.overall_r2.toFixed(3)}
          </div>
          <div className="mt-0.5 text-[9px] font-semibold uppercase text-gray-500">
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
