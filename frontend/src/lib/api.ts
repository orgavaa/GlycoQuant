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
  /** Number of glyco×mechano tiles with BH-FDR q < 0.05. */
  n_significant_pairs_fdr?: number | null;
  /** True when the Jones-2024 YAP size correction was subtracted from
   * yap_nc_ratio on this image. False when the R² gate skipped it. */
  yap_size_correction_applied?: boolean | null;
  yap_size_correction_r2?: number | null;
  yap_size_correction_slope_ci_lo?: number | null;
  yap_size_correction_slope_ci_hi?: number | null;
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
  /** User-supplied batch identifier for cross-session ComBat correction. */
  batch_id?: string | null;
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
  pathway_status?: PriorStatusBlock | null;
  geneformer_status?: PriorStatusBlock | null;
}

export interface PriorStatusBlock {
  /** "missing" | "invalid" | "stale" | "ready" */
  status: "missing" | "invalid" | "stale" | "ready" | string;
  detail: string;
  n_genes: number;
  generated_utc?: string | null;
  age_days?: number | null;
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
  /** Provenance tag — "string" for STRING v12 edges (default),
   * "curated" for literature-traceable edges added below the STRING
   * cutoff where primary literature is strong. */
  source?: "string" | "curated";
  /** PubMed DOI of the primary reference — present only on curated edges. */
  pubmed_doi?: string;
  /** One-line biochemical rationale for the curated edge. */
  reason?: string;
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
  /** Optional batch identifier for cross-session ComBat correction.
   * Captured today; the multi-job correction endpoint is wired separately. */
  batchId?: string;
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
  if (args.batchId && args.batchId.trim().length > 0) {
    form.append("batch_id", args.batchId.trim());
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
  const { data } = await api.get<JobStatusResponse>(`/analysis/jobs/${jobId}`, {
    // The final poll carries the full JobResult: channel PNGs, Plotly JSON,
    // cell overlays, and per-cell features. On hosted GPU runs that transfer
    // can exceed the generic 30s API timeout even though the job completed.
    timeout: 300_000,
  });
  return data;
}

/** POST the glyco↔mechano correlation recompute with a new null method.
 *
 * n_permutations=0 → parametric scipy null (fast, returns the original
 * figure shape). n_permutations>0 → empirical null via shuffle (slower
 * but distribution-free, preferred for heavy-tailed fluorescence data).
 * Reads the cached per-cell DataFrame on the backend — no image
 * re-upload required.
 */
export async function recomputeCorrelation(
  jobId: string,
  nPermutations: number,
): Promise<JobResult> {
  const { data } = await api.post<JobResult>(
    `/analysis/jobs/${jobId}/recompute-correlation`,
    undefined,
    { params: { n_permutations: nPermutations } },
  );
  return data;
}

/** URL to the per-job export zip. Directing the browser to this URL
 * triggers the backend's StreamingResponse download. */
export function exportUrl(jobId: string): string {
  return `${BASE_URL}/analysis/jobs/${jobId}/export`;
}

/** Pre-warm the Modal GPU container. Call before a live demo so the
 * first real analyze call doesn't pay the 30-60s cold-start penalty. */
export async function warmupModal(): Promise<{
  ok: boolean;
  modal: { ok: boolean; device: string; elapsed_ms: number };
}> {
  const { data } = await api.post<{
    ok: boolean;
    modal: { ok: boolean; device: string; elapsed_ms: number };
  }>("/analysis/warmup", undefined, { timeout: 120_000 });
  return data;
}

/** Liveness check against the backend. Surfaced as a green/red dot
 * next to the GlycoQuant logo so the user sees backend reachability
 * before they click anything. Polled every 30s. */
export interface HealthResponse {
  status: string;
  version?: string;
  device?: string;
  device_detail?: string;
}
export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>("/health", { timeout: 5_000 });
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
  /** Mean R² across spatial CV folds (or single random split when
   * cv_strategy="random"). */
  r2_score: number;
  node_importance: Record<string, number>;
  n_edges: number;
  mean_neighbors: number;
  cells_json: string;
  graph_figure_json: string;
  importance_figure_json: string;
  /** Standard deviation of R² across folds. 0 when cv_strategy="random". */
  r2_std?: number;
  /** Actual CV strategy used — may differ from the requested strategy
   * when the image is too small for meaningful spatial blocking. */
  cv_strategy?: "spatial" | "random";
  /** Number of folds actually run. */
  cv_k?: number;
  /** Per-fold R². Length equals cv_k. */
  fold_r2_scores?: number[];
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
