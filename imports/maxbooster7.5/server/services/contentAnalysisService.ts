/**
 * Thin application adapter for MaxCore's native, deterministic content
 * analyzers.  Pixel, frame, text and HTML measurements are performed only by
 * MaxCore; this service deliberately contains no local scoring or heuristics.
 */
import { AIUnavailableError } from "../lib/aiSource.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import { MaxCoreControlError } from "./maxcoreControlTransport.js";
import { getMaxcoreOrigin } from "./maxcoreConnector.js";
import type {
  AnalysisEnvelope,
  AnalysisKind,
  AnalysisValue,
} from "@shared/types/contentAnalysis.js";

export interface AudioAnalysisResult {
  duration?: number;
  tempo?: number;
  bpm?: number;
  key?: string;
  mode?: string;
  musical_key?: string;
  source: "maxcore_audio_conductor";
  [key: string]: unknown;
}

const SAFE_UPSTREAM_STATUSES = new Set([400, 413, 415, 422, 429]);
const OWNED_AUDIO_ASSET =
  /^\/uploads\/audio-inputs\/[a-f0-9]{64}\/[a-f0-9-]+\.(?:wav|mp3|flac|ogg|opus|webm|m4a|aac|aiff)$/i;

/**
 * Accept only the opaque path issued by MaxCore's authenticated audio upload.
 * Same-MaxCore-origin URLs are reduced back to that path; arbitrary remote and
 * local filesystem locations are never promoted into analysis inputs.
 */
export function normalizeOwnedAudioAsset(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const candidate = value.trim();
  if (OWNED_AUDIO_ASSET.test(candidate)) return candidate;
  try {
    const parsed = new URL(candidate);
    const maxcore = new URL(getMaxcoreOrigin());
    return parsed.origin === maxcore.origin &&
      !parsed.search &&
      !parsed.hash &&
      OWNED_AUDIO_ASSET.test(parsed.pathname)
      ? parsed.pathname
      : null;
  } catch {
    return null;
  }
}

export class ContentAnalysisUpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ContentAnalysisUpstreamError";
  }
}

export type ContentAnalysisTransport = (
  kind: AnalysisKind,
  body: Record<string, string>,
  actorId: string,
) => Promise<unknown>;

export const maxcoreAnalysisTransport: ContentAnalysisTransport = async (
  kind,
  body,
  actorId,
) => {
  try {
    const response = await MaxCoreAIClient.generate<unknown>(
      `/api/analysis/${kind}`,
      body,
      actorId,
      600_000,
      false,
    );
    if (response === null) {
      throw new AIUnavailableError(`MaxCore ${kind} analysis unavailable`);
    }
    return response;
  } catch (error) {
    if (error instanceof MaxCoreControlError) {
      const status = SAFE_UPSTREAM_STATUSES.has(error.status)
        ? error.status
        : 503;
      throw new ContentAnalysisUpstreamError(
        status === 503
          ? `MaxCore ${kind} analysis unavailable`
          : `MaxCore rejected the ${kind} analysis request`,
        status,
      );
    }
    if (error instanceof AIUnavailableError) throw error;
    throw new AIUnavailableError(`MaxCore ${kind} analysis unavailable`);
  }
};

function isAnalysisValue(value: unknown, depth = 0): value is AnalysisValue {
  if (depth > 12 || value === null) return value === null;
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isAnalysisValue(item, depth + 1));
  }
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every((item) =>
    isAnalysisValue(item, depth + 1),
  );
}

export function validateAnalysisEnvelope(
  value: unknown,
  expectedKind: AnalysisKind,
): AnalysisEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AIUnavailableError("MaxCore analysis returned an invalid envelope");
  }
  const envelope = value as Record<string, unknown>;
  if (
    envelope.schema_version !== 1 ||
    envelope.source !== "maxcore_native_analysis" ||
    envelope.kind !== expectedKind ||
    typeof envelope.method !== "string" ||
    !envelope.method.trim() ||
    !envelope.analysis ||
    typeof envelope.analysis !== "object" ||
    Array.isArray(envelope.analysis) ||
    !isAnalysisValue(envelope.analysis) ||
    !Array.isArray(envelope.limitations) ||
    !envelope.limitations.every((item) => typeof item === "string")
  ) {
    throw new AIUnavailableError("MaxCore analysis returned an invalid envelope");
  }
  return envelope as unknown as AnalysisEnvelope;
}

export class ContentAnalysisService {
  constructor(
    private readonly transport: ContentAnalysisTransport =
      maxcoreAnalysisTransport,
  ) {}

  private async analyze(
    kind: AnalysisKind,
    body: Record<string, string>,
    actorId: string,
  ): Promise<AnalysisEnvelope> {
    if (!actorId?.trim()) {
      throw new TypeError("A trusted actor id is required for content analysis");
    }
    const raw = await this.transport(kind, body, actorId);
    if (!raw) {
      throw new AIUnavailableError(`MaxCore ${kind} analysis unavailable`);
    }
    return validateAnalysisEnvelope(raw, kind);
  }

  analyzeImage(url: string, actorId: string): Promise<AnalysisEnvelope> {
    return this.analyze("image", { url }, actorId);
  }

  analyzeVideo(url: string, actorId: string): Promise<AnalysisEnvelope> {
    return this.analyze("video", { url }, actorId);
  }

  analyzeText(text: string, actorId: string): Promise<AnalysisEnvelope> {
    return this.analyze("text", { text }, actorId);
  }

  analyzeWebsite(url: string, actorId: string): Promise<AnalysisEnvelope> {
    return this.analyze("website", { url }, actorId);
  }

  async analyzeAudio(
    audioUrl: string,
    metadata?: Record<string, unknown>,
    userId?: string,
  ): Promise<AudioAnalysisResult> {
    const { pythonAIService } = await import("./pythonAIService.js");
    const result = await pythonAIService.analyzeAudio(
      audioUrl,
      Boolean(metadata?.detailed),
      userId,
    );
    if (!result.success || !result.data) {
      throw new AIUnavailableError(
        result.error || "MaxCore audio conductor unavailable",
      );
    }
    return result.data as AudioAnalysisResult;
  }
}

export const contentAnalysisService = new ContentAnalysisService();