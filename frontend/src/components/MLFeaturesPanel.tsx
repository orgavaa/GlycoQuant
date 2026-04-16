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
        className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-gray-400 flex-shrink-0 mt-0.5">
          {open ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
        </span>
        <span className="text-gray-500 flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-gray-900">{title}</div>
          <div className="text-[12px] text-gray-700 leading-relaxed mt-1">{question}</div>
          <div className="text-[11px] text-gray-500 leading-relaxed mt-1">
            <span className="text-gray-400 uppercase tracking-wider mr-1.5">how</span>
            {method}
          </div>
        </div>
      </button>
      {open && <div className="px-5 pb-5 pt-2 border-t border-gray-100">{children}</div>}
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
      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-[12px] font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
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
      <Card className="!bg-gray-50/60 !border-gray-200">
        <h3 className="text-[13px] font-semibold text-gray-900 mb-1">Exploratory models</h3>
        <p className="text-[12px] text-gray-600 leading-relaxed">
          The per-cell features above are the primary scientific output. The three modules
          below are <strong>optional</strong> models that look for additional patterns in your
          data — they run only when you click <em>Run</em>, never automatically. Each module
          reports descriptive statistics on this image alone and does not draw biological
          conclusions for you.
        </p>
      </Card>

      <Module
        icon={<Layers size={14} strokeWidth={1.5} />}
        title="Cell groups by visual similarity"
        question={"Do my cells fall into a few distinct visual subpopulations, or do they look like a single continuum?"}
        method={"Cell-DINO ViT-L/16 embeddings (5120 dims per cell) → UMAP projection to 2D → Leiden community detection. Reports the number of clusters and each cluster's mean feature values. Cluster IDs are arbitrary — any biological interpretation is for you to make."}
      >
        <PhenotypeSection result={result} jobId={jobId} />
      </Module>

      <Module
        icon={<Network size={14} strokeWidth={1.5} />}
        title="Is mechanical state spatially organised?"
        question={"Can a cell's mechano score be predicted from its neighbours' features alone? If yes, mechanical state forms spatial domains; if no, each cell behaves independently of its neighbourhood."}
        method={"Cells become nodes in a Delaunay graph (each cell connected to its geometric neighbours). A 2-layer Graph Convolutional Network predicts each cell's mechano score from its neighbours, and the held-out R² is reported. R² is descriptive of this image only."}
      >
        <SpatialSection jobId={jobId} />
      </Module>

      <Module
        icon={<ArrowLeftRight size={14} strokeWidth={1.5} />}
        title="How tightly coupled are glycocalyx and mechano features?"
        question={"How well can a small neural network predict each mechano feature from glycocalyx features alone (or vice-versa)? High R² means the two readouts share variance — it does not prove that one causes the other."}
        method={"Multi-layer perceptron (3 hidden layers) trained per-target with 5-fold cross-validation on this image's feature matrix. Reports out-of-fold R² for every target feature and the input features that most influenced the prediction (gradient magnitude)."}
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
          idleLabel="Run cluster discovery"
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
      <div className="flex items-center gap-3 flex-wrap">
        <RunButton
          loading={loading}
          disabled={!jobId}
          onClick={handleRun}
          idleLabel="Run spatial model"
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
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5 flex items-center gap-1.5">
            {r2Label}
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-medium normal-case tracking-normal ${strategyTint}`}
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
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Prediction direction
          </div>
          <div className="inline-flex items-center gap-1 bg-gray-100 rounded p-0.5">
            <button
              onClick={() => setDirection("glyco_to_mechano")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                direction === "glyco_to_mechano" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              glyco {"\u2192"} mechano
            </button>
            <button
              onClick={() => setDirection("mechano_to_glyco")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                direction === "mechano_to_glyco" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
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
