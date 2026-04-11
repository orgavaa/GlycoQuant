/**
 * Typed API client for the GlycoQuant FastAPI backend.
 *
 * Every function here returns a Promise<T> where T matches the
 * Pydantic response model in ``backend/app/schemas.py``. Keep the
 * two in sync by hand (or in the future, generate from OpenAPI).
 */
import axios, { AxiosInstance } from "axios";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
});

// ---------------------------------------------------------------------------
// Schemas (kept in sync with backend/app/schemas.py)
// ---------------------------------------------------------------------------

export type JobStatus = "queued" | "running" | "complete" | "failed";
export type JobPhase =
  | "segmenting"
  | "extracting"
  | "embedding"
  | "done"
  | "idle";

export interface JobProgress {
  phase: JobPhase;
  pct: number;
  message: string;
}

export interface JobResult {
  image_hash: string;
  cell_count: number;
  features_df_json: string;
  segmentation_figure_json: string;
  radial_profile_figure_json: string;
  correlation_figure_json: string;
  hero_metrics: Record<string, number | null>;
  has_deep_features: boolean;
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

export interface DemoCondition {
  name: string;
  description: string;
  cell_count: number;
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
}

export interface MetabolicInhibitor {
  name: string;
  target: string;
  pathway: string;
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
  evidence_per_target: Record<string, PathwayEvidence>;
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

export interface SubmitAnalyzeArgs {
  demoCondition?: "control" | "siSDC1" | "heparinase";
  upload?: File;
  cellDiameter: number;
  includeDeepFeatures: boolean;
}

export async function submitAnalyze(
  args: SubmitAnalyzeArgs,
): Promise<AnalyzeResponse> {
  const form = new FormData();
  if (args.demoCondition) form.append("demo_condition", args.demoCondition);
  if (args.upload) form.append("upload", args.upload);
  form.append("cell_diameter", String(args.cellDiameter));
  form.append("include_deep_features", args.includeDeepFeatures ? "true" : "false");

  const { data } = await api.post<AnalyzeResponse>("/analysis/analyze", form, {
    headers: { "Content-Type": "multipart/form-data" },
    // Uploads can exceed the default 30s timeout
    timeout: 120_000,
  });
  return data;
}

export async function fetchJobStatus(jobId: string): Promise<JobStatusResponse> {
  const { data } = await api.get<JobStatusResponse>(
    `/analysis/jobs/${jobId}`,
  );
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
