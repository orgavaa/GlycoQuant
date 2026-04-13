import { useState } from "react";
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

type MLTab = "phenotype" | "spatial" | "crossmodal";

export function MLFeaturesPanel({ result }: Props) {
  const [activeTab, setActiveTab] = useState<MLTab>("phenotype");
  const jobId = useJobStore(s => s.latestJobId);

  if (!jobId) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
          <div className="text-[13px] font-medium text-amber-800 mb-1">Re-run analysis to enable ML features</div>
          <div className="text-[11px] text-amber-600">
            The current results were loaded from a previous session. Run a new analysis to unlock Cell Atlas, Spatial GNN, and Cross-Modal prediction.
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: MLTab; label: string }[] = [
    { id: "phenotype", label: "Cell Atlas" },
    { id: "spatial", label: "Spatial GNN" },
    { id: "crossmodal", label: "Cross-Modal" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Tab strip */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 rounded-md text-[12px] font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "phenotype" && <PhenotypeTab result={result} jobId={jobId} />}
      {activeTab === "spatial" && <SpatialTab jobId={jobId} />}
      {activeTab === "crossmodal" && <CrossModalTab jobId={jobId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phenotype Discovery (UMAP + Leiden)
// ---------------------------------------------------------------------------

function PhenotypeTab({ result, jobId }: { result: JobResult; jobId: string | null }) {
  const phenotype = useJobStore(s => s.phenotypeResult);
  const setPhenotype = useJobStore(s => s.setPhenotypeResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = result.has_deep_features;

  const handleRun = async () => {
    if (!jobId) {
      setError("No job ID available. Please re-run the analysis.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await runPhenotypeDiscovery(jobId);
      setPhenotype(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canRun) {
    return (
      <Card>
        <div className="text-[13px] text-gray-500 py-6 text-center">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Requires deep features</div>
          Re-run the analysis with "Cell-DINO deep embeddings" enabled to unlock phenotype discovery.
        </div>
      </Card>
    );
  }

  if (!phenotype) {
    return (
      <Card>
        <div className="text-center py-6">
          <div className="text-[14px] font-semibold text-gray-900 mb-2">Cell Phenotype Discovery</div>
          <p className="text-[12px] text-gray-500 mb-4 leading-relaxed max-w-md mx-auto">
            Projects Cell-DINO embeddings into a 2D UMAP landscape and discovers cell subpopulations
            via Leiden community detection. Reveals phenotypic heterogeneity invisible to single-feature analysis.
          </p>
          <button
            onClick={handleRun}
            disabled={loading}
            className="px-5 py-2.5 bg-blue-600 text-white text-[13px] font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Running UMAP + Leiden...
              </span>
            ) : "Discover phenotypes"}
          </button>
          {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
        </div>
      </Card>
    );
  }

  return <PhenotypeResults data={phenotype} />;
}

function PhenotypeResults({ data }: { data: PhenotypeResponse }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Hero metrics */}
      <Card>
        <div className="flex items-center gap-6">
          <div className="text-center flex-1">
            <div className="text-[24px] font-bold text-gray-900" style={{ fontFeatureSettings: "'tnum'" }}>{data.n_clusters}</div>
            <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Phenotypes</div>
          </div>
          {Object.entries(data.cluster_sizes).slice(0, 4).map(([cid, size]) => (
            <div key={cid} className="text-center flex-1">
              <div className="text-[18px] font-bold text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{size}</div>
              <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Cluster {cid}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* UMAP landscape */}
      <Card>
        <h3 className="text-[14px] font-semibold text-gray-900 mb-1">UMAP landscape</h3>
        <p className="text-[11px] text-gray-400 mb-3">Cell-DINO embeddings projected to 2D, colored by Leiden cluster</p>
        <PlotlyFigure figureJson={data.landscape_figure_json} height={380} />
      </Card>

      {/* Cluster summaries */}
      {data.cluster_summaries.length > 0 && (
        <Card>
          <h3 className="text-[14px] font-semibold text-gray-900 mb-3">Cluster profiles</h3>
          <div className="space-y-3">
            {data.cluster_summaries.map(cs => (
              <div key={cs.cluster_id} className="bg-gray-50 rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-semibold text-gray-900">Cluster {cs.cluster_id}</span>
                  <span className="text-[11px] text-gray-400">{cs.size} cells ({(cs.fraction * 100).toFixed(1)}%)</span>
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
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spatial GNN
// ---------------------------------------------------------------------------

function SpatialTab({ jobId }: { jobId: string | null }) {
  const spatial = useJobStore(s => s.spatialGNNResult);
  const setSpatial = useJobStore(s => s.setSpatialGNNResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!jobId) { setError("No job ID available. Please re-run the analysis."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await runSpatialGNN(jobId);
      setSpatial(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!spatial) {
    return (
      <Card>
        <div className="text-center py-6">
          <div className="text-[14px] font-semibold text-gray-900 mb-2">Spatial Context GNN</div>
          <p className="text-[12px] text-gray-500 mb-4 leading-relaxed max-w-md mx-auto">
            Builds a Delaunay graph over cell centroids and trains a 2-layer GCN to predict
            mechano score from neighbourhood context. Reveals whether mechanical state is
            spatially coherent or cell-autonomous.
          </p>
          <button
            onClick={handleRun}
            disabled={loading || !jobId}
            className="px-5 py-2.5 bg-blue-600 text-white text-[13px] font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Training GCN...
              </span>
            ) : "Run spatial analysis"}
          </button>
          {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
        </div>
      </Card>
    );
  }

  return <SpatialResults data={spatial} />;
}

function SpatialResults({ data }: { data: SpatialGNNResponse }) {
  const r2Color = data.r2_score > 0.3 ? "text-emerald-600" : data.r2_score > 0.1 ? "text-amber-600" : "text-red-600";

  return (
    <div className="flex flex-col gap-4">
      {/* Hero metrics */}
      <Card>
        <div className="flex items-center gap-6">
          <div className="text-center flex-1">
            <div className={`text-[28px] font-bold ${r2Color}`} style={{ fontFeatureSettings: "'tnum'" }}>
              {data.r2_score.toFixed(3)}
            </div>
            <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-1">R{"\u00b2"} (spatial)</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-[20px] font-bold text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{data.n_edges}</div>
            <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Edges</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-[20px] font-bold text-gray-700" style={{ fontFeatureSettings: "'tnum'" }}>{data.mean_neighbors.toFixed(1)}</div>
            <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-1">Avg neighbors</div>
          </div>
        </div>
      </Card>

      {/* Scientific interpretation */}
      <Card>
        <div className="text-[12px] text-gray-600 leading-relaxed">
          {data.r2_score > 0.3 ? (
            <><strong className="text-emerald-700">Spatially coherent:</strong> The GCN explains {(data.r2_score * 100).toFixed(0)}% of mechano-score variance from cell neighbourhood alone. This tissue exhibits mechanical domains — groups of nearby cells share a common mechanotransduction state.</>
          ) : data.r2_score > 0.1 ? (
            <><strong className="text-amber-700">Weakly spatial:</strong> Neighbourhood context explains {(data.r2_score * 100).toFixed(0)}% of mechanical state. There is some spatial patterning but cell-autonomous factors dominate.</>
          ) : (
            <><strong className="text-red-700">Cell-autonomous:</strong> Neighbourhood context explains only {(data.r2_score * 100).toFixed(0)}% of mechano score. Each cell's mechanical state is largely independent of its neighbours in this image.</>
          )}
        </div>
      </Card>

      {/* Graph visualization */}
      <Card>
        <h3 className="text-[14px] font-semibold text-gray-900 mb-1">Spatial graph</h3>
        <p className="text-[11px] text-gray-400 mb-3">Delaunay triangulation, nodes colored by predicted mechano score</p>
        <PlotlyFigure figureJson={data.graph_figure_json} height={380} />
      </Card>

      {/* Feature importance */}
      <Card>
        <h3 className="text-[14px] font-semibold text-gray-900 mb-1">Feature importance</h3>
        <p className="text-[11px] text-gray-400 mb-3">Which interpretable features contribute most to the GCN prediction</p>
        <PlotlyFigure figureJson={data.importance_figure_json} />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cross-Modal Prediction
// ---------------------------------------------------------------------------

function CrossModalTab({ jobId }: { jobId: string | null }) {
  const crossModal = useJobStore(s => s.crossModalResult);
  const setCrossModal = useJobStore(s => s.setCrossModalResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"glyco_to_mechano" | "mechano_to_glyco">("glyco_to_mechano");

  const handleRun = async () => {
    if (!jobId) { setError("No job ID available. Please re-run the analysis."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await runCrossModal(jobId, direction);
      setCrossModal(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!crossModal) {
    return (
      <Card>
        <div className="text-center py-6">
          <div className="text-[14px] font-semibold text-gray-900 mb-2">Cross-Modal Prediction</div>
          <p className="text-[12px] text-gray-500 mb-4 leading-relaxed max-w-md mx-auto">
            Trains an MLP to predict mechanotransduction features from glycocalyx features
            (or reverse). Answers: <em>"How much of a cell's mechanical state can you infer
            from its surface coat alone?"</em>
          </p>

          {/* Direction toggle */}
          <div className="flex items-center gap-2 justify-center mb-4">
            <button
              onClick={() => setDirection("glyco_to_mechano")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                direction === "glyco_to_mechano" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              Glyco {"\u2192"} Mechano
            </button>
            <button
              onClick={() => setDirection("mechano_to_glyco")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                direction === "mechano_to_glyco" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              Mechano {"\u2192"} Glyco
            </button>
          </div>

          <button
            onClick={handleRun}
            disabled={loading || !jobId}
            className="px-5 py-2.5 bg-blue-600 text-white text-[13px] font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Training MLP (5-fold CV)...
              </span>
            ) : "Run prediction"}
          </button>
          {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
        </div>
      </Card>
    );
  }

  return <CrossModalResults data={crossModal} />;
}

function CrossModalResults({ data }: { data: CrossModalResponse }) {
  const arrow = "\u2192";
  const label = data.direction === "glyco_to_mechano"
    ? `Glycocalyx ${arrow} Mechanotransduction`
    : `Mechanotransduction ${arrow} Glycocalyx`;

  const r2Color = data.overall_r2 > 0.3 ? "text-emerald-600" : data.overall_r2 > 0.1 ? "text-amber-600" : "text-red-600";

  return (
    <div className="flex flex-col gap-4">
      {/* Hero */}
      <Card>
        <div className="text-center">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</div>
          <div className={`text-[32px] font-bold ${r2Color}`} style={{ fontFeatureSettings: "'tnum'" }}>
            {data.overall_r2.toFixed(3)}
          </div>
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-1">
            Mean R{"\u00b2"} across {data.target_features.length} targets
          </div>
        </div>
      </Card>

      {/* Scientific interpretation */}
      <Card>
        <div className="text-[12px] text-gray-600 leading-relaxed">
          {data.overall_r2 > 0.3 ? (
            <><strong className="text-emerald-700">Strong coupling:</strong> Glycocalyx conformation explains {(data.overall_r2 * 100).toFixed(0)}% of mechanotransduction variance at single-cell resolution. This supports tight biomechanical coupling between the pericellular coat and downstream signalling (Paszek 2014, Hamrangsekachaee 2025).</>
          ) : data.overall_r2 > 0.1 ? (
            <><strong className="text-amber-700">Moderate coupling:</strong> {(data.overall_r2 * 100).toFixed(0)}% variance explained. Glycocalyx and mechanotransduction are correlated but other factors (substrate stiffness, cell density) likely contribute.</>
          ) : (
            <><strong className="text-red-700">Weak coupling:</strong> Only {(data.overall_r2 * 100).toFixed(0)}% explained. In this image, glycocalyx features alone are poor predictors of mechanical state — possibly due to homogeneous conditions or insufficient cell count.</>
          )}
        </div>
      </Card>

      {/* Per-target R² bar chart */}
      <Card>
        <h3 className="text-[14px] font-semibold text-gray-900 mb-1">Per-target R{"\u00b2"}</h3>
        <p className="text-[11px] text-gray-400 mb-3">5-fold cross-validated prediction accuracy per feature</p>
        <PlotlyFigure figureJson={data.r2_figure_json} />
      </Card>

      {/* Feature importance */}
      <Card>
        <h3 className="text-[14px] font-semibold text-gray-900 mb-1">Input feature importance</h3>
        <p className="text-[11px] text-gray-400 mb-3">Which input features drive the prediction (gradient magnitude)</p>
        <PlotlyFigure figureJson={data.importance_figure_json} />
      </Card>
    </div>
  );
}
