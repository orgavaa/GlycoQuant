/**
 * Typed API client for the GlycoQuant FastAPI backend.
 *
 * Every function here returns a Promise<T> where T matches the
 * Pydantic response model in ``backend/app/schemas.py``.
 */
import axios, { AxiosInstance } from "axios";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
});

api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string" && detail.length > 0) {
      err.message = detail;
    }
    return Promise.reject(err);
  },
);

// ---------------------------------------------------------------------------
// Schemas (kept in sync with backend/app/schemas.py)
// ---------------------------------------------------------------------------

export type JobStatus = "queued" | "running" | "complete" | "failed";
export type JobPhase = "segmenting" | "extracting" | "embedding" | "done" | "idle";

export interface JobProgress {
  phase: JobPhase;
  pct: number;
  message: string;
}

export interface MechanoScoreSummary {
  mode: "pca" | "weighted_sum";
  n_cells_used: number;
  n_features_used: number;
  pc1_variance_explained: number;
  loadings: Record<string, number>;
  mean: number | null;
  std: number | null;
  top_correlation_r: number | null;
  top_correlation_pair: [string, string] | null;
}

export type DeepEmbeddingBackend = "dinov2_base" | "cell_dino_channel_adaptive";

export interface JobResult {
  image_hash: string;
  cell_count: number;
  features_df_json: string;
  segmentation_figure_json: string;
  radial_profile_figure_json: string;
  correlation_figure_json: string;
  glyco_mechano_correlation_figure_json?: string | null;
  mechano_score_distribution_figure_json?: string | null;
  mechano_score_summary?: MechanoScoreSummary | null;
  hero_metrics: Record<string, number | null>;
  channel_pngs?: Record<string, string> | null;
  channel_trace_indices?: Record<string, number> | null;
  overlay_trace_ranges?: Record<string, number[]> | null;
  has_deep_features: boolean;
  deep_embedding_backend?: DeepEmbeddingBackend | null;
  warnings?: string[];
  pixel_size_um?: number;
  channel_assignments?: Record<string, string> | null;
  substitute_channels?: string[];
  cell_overlay?: {
    image_w: number;
    image_h: number;
    polygons: { cell_id: number; vertices: [number, number][] }[];
    n_cells: number;
    fallback_reason: string | null;
  } | null;
}

export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  progress: JobProgress;
  created_at: string;
  finished_at: string | null;
  result: JobResult | null;
  error: string | null;
}

export interface AnalyzeResponse {
  job_id: string;
  status: JobStatus;
  created_at: string;
}

export interface DemoChannelSlotSource {
  hpa_channel?: string;
  biological_identity: string;
  matches_labouesse_protocol: boolean;
  note?: string;
}

export interface DemoCondition {
  name: string;
  display_name: string;
  description: string;
  source: string;
  license: string;
  attribution: string;
  attribution_url: string;
  gene: string;
  cell_line: string;
  is_real_microscopy: boolean;
  slot_sources: Record<string, DemoChannelSlotSource>;
  pixel_size_um?: number | null;
}

export interface DemoListResponse {
  conditions: DemoCondition[];
}

export interface PriorGeneEntry {
  gene: string;
  geneformer_rank: number | null;
  geneformer_score: number | null;
  pathway_rank: number | null;
  pathway_score: number | null;
  abs_rank_divergence: number | null;
  /** Directionally-aware sidecar on the dynamic pathway score.
   * Positive = close to over-activated mechano axes (candidate KO to attenuate).
   * Negative = close to under-activated axes (candidate KO to restore).
   * Present only on /priors/contextual responses. */
  pathway_signed_score?: number | null;
}

export interface MetabolicInhibitor {
  name: string;
  target: string;
  pathway: string;
  mechanism: string;
  pathway_rank: number | null;
  pathway_score: number | null;
}

export interface PriorsResponse {
  pathway_available: boolean;
  geneformer_available: boolean;
  genes: PriorGeneEntry[];
  mechano_signature: string[];
  metabolic_inhibitors: MetabolicInhibitor[];
  pathway_metadata: Record<string, unknown>;
  geneformer_metadata: Record<string, unknown>;
  panel_summary_figure_json?: string | null;
  dynamic?: boolean;
  mechano_weights?: Record<string, number> | null;
  /** Direction-of-deviation sidecar per mechano gene. Positive = axis
   * over-activated vs the reference cohort; negative = under-activated.
   * Populated only when dynamic=true. */
  mechano_signed_z?: Record<string, number> | null;
  used_fallback_reference?: boolean;
  can_generate_geneformer?: boolean;
}

export interface GeneformerGenerationResponse {
  job_id: string;
  modal_call_id: string | null;
  state: string;
  message: string;
}

export interface GeneformerStatusResponse {
  job_id: string;
  state: "queued" | "running" | "complete" | "failed";
  elapsed_sec: number;
  message: string;
  error: string | null;
}

export interface PathwayEdge {
  from: string;
  to: string;
  confidence: number;
}

export interface PathwayEvidence {
  distance: number | null;
  path: string[];
  path_edges: PathwayEdge[];
}

export interface DrillDownResponse {
  gene: string;
  heatmap_figure_json: string;
  network_figure_json?: string | null;
  evidence_per_target: Record<string, PathwayEvidence>;
}

export interface EffectSize {
  feature: string;
  cohens_d: number;
  p_value: number;
  mean_a: number;
  mean_b: number;
  delta_pct: number;
}

export interface CompareResult {
  job_id_a: string;
  job_id_b: string;
  n_cells_a: number;
  n_cells_b: number;
  effect_sizes: EffectSize[];
  top_deltas: EffectSize[];
  violin_features: string[];
  violin_a: Record<string, number[]>;
  violin_b: Record<string, number[]>;
}

export interface CellCropsResponse {
  cell_id: number;
  crops: Record<string, string>;
  bbox: [number, number, number, number] | null;
}

// ---------------------------------------------------------------------------
// Endpoint wrappers
// ---------------------------------------------------------------------------

export async function fetchHealth(): Promise<{ status: string; version: string }> {
  const { data } = await api.get("/health");
  return data;
}

export async function fetchDemoList(): Promise<DemoListResponse> {
  const { data } = await api.get<DemoListResponse>("/demo");
  return data;
}

export function demoPreviewUrl(name: string): string {
  return `${BASE_URL}/demo/${name}/preview`;
}

export async function uploadPreview(file: File): Promise<string> {
  const form = new FormData();
  form.append("upload", file);
  try {
    const { data } = await api.post<Blob>("/analysis/preview", form, {
      headers: { "Content-Type": "multipart/form-data" },
      responseType: "blob",
      timeout: 60_000,
    });
    return URL.createObjectURL(data);
  } catch (err) {
    const anyErr = err as Record<string, unknown>;
    const blob = (anyErr?.response as Record<string, unknown>)?.data;
    if (blob instanceof Blob) {
      try {
        const text = await blob.text();
        const parsed = JSON.parse(text);
        if (parsed?.detail) throw new Error(String(parsed.detail));
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message) throw parseErr;
      }
    }
    throw new Error(
      (anyErr?.message as string) ?? "Preview request failed",
    );
  }
}

export interface SubmitAnalyzeArgs {
  demoCondition?: string;
  upload?: File;
  cellDiameter: number;
  includeDeepFeatures: boolean;
  pixelSizeUm?: number;
  channelAssignments?: Record<string, string>;
}

export async function submitAnalyze(args: SubmitAnalyzeArgs): Promise<AnalyzeResponse> {
  const form = new FormData();
  if (args.demoCondition) form.append("demo_condition", args.demoCondition);
  if (args.upload) form.append("upload", args.upload);
  form.append("cell_diameter", String(args.cellDiameter));
  form.append("include_deep_features", args.includeDeepFeatures ? "true" : "false");
  if (args.pixelSizeUm !== undefined) {
    form.append("pixel_size_um", String(args.pixelSizeUm));
  }
  if (args.channelAssignments) {
    form.append("channel_assignments", JSON.stringify(args.channelAssignments));
  }
  const { data } = await api.post<AnalyzeResponse>("/analysis/analyze", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120_000,
  });
  return data;
}

export async function fetchCellCrops(jobId: string, cellId: number): Promise<CellCropsResponse> {
  const { data } = await api.get<CellCropsResponse>(`/analysis/jobs/${jobId}/cells/${cellId}/crops`);
  return data;
}

export async function fetchCompare(jobIdA: string, jobIdB: string): Promise<CompareResult> {
  const { data } = await api.post<CompareResult>("/analysis/compare", { job_id_a: jobIdA, job_id_b: jobIdB });
  return data;
}

export async function fetchJobStatus(jobId: string): Promise<JobStatusResponse> {
  const { data } = await api.get<JobStatusResponse>(`/analysis/jobs/${jobId}`);
  return data;
}

export async function fetchPriors(): Promise<PriorsResponse> {
  const { data } = await api.get<PriorsResponse>("/priors");
  return data;
}

export async function fetchDrillDown(gene: string): Promise<DrillDownResponse> {
  const { data } = await api.get<DrillDownResponse>(`/priors/drill/${gene}`);
  return data;
}

export interface ContextualPriorsArgs {
  features_df_json: string;
  cell_count: number;
  dataset_label?: string | null;
}

export async function fetchContextualPriors(args: ContextualPriorsArgs): Promise<PriorsResponse> {
  const { data } = await api.post<PriorsResponse>("/priors/contextual", args);
  return data;
}

export async function generateGeneformer(): Promise<GeneformerGenerationResponse> {
  const { data } = await api.post<GeneformerGenerationResponse>("/priors/geneformer/generate");
  return data;
}

export async function fetchGeneformerStatus(jobId: string): Promise<GeneformerStatusResponse> {
  const { data } = await api.get<GeneformerStatusResponse>(`/priors/geneformer/status/${jobId}`);
  return data;
}

// ---------------------------------------------------------------------------
// ML features: phenotype discovery, spatial GNN, cross-modal
// ---------------------------------------------------------------------------

export interface ClusterSummary {
  cluster_id: number;
  size: number;
  fraction: number;
  mean_features: Record<string, number>;
}

export interface PhenotypeResponse {
  job_id: string;
  n_clusters: number;
  cluster_sizes: Record<number, number>;
  cluster_summaries: ClusterSummary[];
  cells_json: string;
  landscape_figure_json: string;
}

export interface SpatialGNNResponse {
  job_id: string;
  r2_score: number;
  node_importance: Record<string, number>;
  n_edges: number;
  mean_neighbors: number;
  cells_json: string;
  graph_figure_json: string;
  importance_figure_json: string;
}

export interface CrossModalResponse {
  job_id: string;
  direction: string;
  overall_r2: number;
  per_target_r2: Record<string, number>;
  feature_importance: Record<string, number>;
  input_features: string[];
  target_features: string[];
  r2_figure_json: string;
  importance_figure_json: string;
}

export async function runPhenotypeDiscovery(
  jobId: string,
  params?: { n_neighbors?: number; min_dist?: number; resolution?: number },
): Promise<PhenotypeResponse> {
  const query = new URLSearchParams();
  if (params?.n_neighbors) query.set("n_neighbors", String(params.n_neighbors));
  if (params?.min_dist) query.set("min_dist", String(params.min_dist));
  if (params?.resolution) query.set("resolution", String(params.resolution));
  const qs = query.toString();
  const { data } = await api.post<PhenotypeResponse>(
    `/analysis/ml/phenotype/${jobId}${qs ? "?" + qs : ""}`,
    {},
    { timeout: 120_000 },
  );
  return data;
}

export async function runSpatialGNN(
  jobId: string,
  maxEdgeDistUm?: number,
): Promise<SpatialGNNResponse> {
  const query = maxEdgeDistUm ? `?max_edge_dist_um=${maxEdgeDistUm}` : "";
  const { data } = await api.post<SpatialGNNResponse>(
    `/analysis/ml/spatial-gnn/${jobId}${query}`,
    {},
    { timeout: 120_000 },
  );
  return data;
}

export async function runCrossModal(
  jobId: string,
  direction: "glyco_to_mechano" | "mechano_to_glyco" = "glyco_to_mechano",
): Promise<CrossModalResponse> {
  const { data } = await api.post<CrossModalResponse>(
    `/analysis/ml/cross-modal/${jobId}?direction=${direction}`,
    {},
    { timeout: 120_000 },
  );
  return data;
}
