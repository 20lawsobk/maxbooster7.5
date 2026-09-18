export type AnalysisKind = "image" | "video" | "text" | "website";

export type AnalysisScalar = string | number | boolean | null;
export type AnalysisValue =
  | AnalysisScalar
  | AnalysisValue[]
  | { [key: string]: AnalysisValue };

/**
 * Stable provenance envelope. Analysis fields intentionally remain generic:
 * MaxCore's pure workers own their measured field contracts and may add new
 * measurements without requiring a frontend release.
 */
export interface AnalysisEnvelope {
  schema_version: 1;
  source: "maxcore_native_analysis";
  kind: AnalysisKind;
  method: string;
  analysis: Record<string, AnalysisValue>;
  limitations: string[];
}

export interface ContentAnalysisResponse {
  success: true;
  analysis: AnalysisEnvelope;
  timestamp: string;
}

export interface AnalysisAssetResponse {
  url: string;
  expires_at: string;
}