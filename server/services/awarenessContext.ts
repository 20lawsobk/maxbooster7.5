/** Read-only compatibility facade. MaxCore alone builds awareness snapshots. */
import { maxCoreControlTransport, MaxCoreControlError } from "./maxcoreControlTransport.js";
export {
  getPlatformOptimization,
  normalizeSocialAwarenessPlatform,
  platformAwarenessOptimization,
} from "./platformAwarenessOptimization.js";

export type AwarenessMode = "social" | "ad_copy" | "video_script" | "email" |
  "press_release" | "blog" | "melody" | "music" | "songwriting" | "content" | "advertising";

export interface AwarenessContext {
  snapshot_id?: string;
  awareness?: string | Record<string, unknown>;
  contextString?: string;
  confidence?: number;
  signalCount?: number;
  trendingGenres?: string[];
  trendingMoods?: string[];
  contentAngles?: string[];
  ctaPatterns?: string[];
  emotionalTriggers?: string[];
  platformAlgorithmNotes?: string[];
  [key: string]: unknown;
}

export interface UnifiedAwarenessReceipt {
  snapshot_id: string;
  awareness: string | Record<string, unknown>;
  [key: string]: unknown;
}

export async function getUnifiedAwarenessContext(
  modality: AwarenessMode, platform?: string,
): Promise<UnifiedAwarenessReceipt | undefined> {
  try {
    const receipt = await maxCoreControlTransport.request<UnifiedAwarenessReceipt>(
      "/api/awareness/unified/context",
      { method: "POST", authScope: "generation", body: { platform, modality } },
    );
    // MaxCore explicitly reports a warming scanner. Do not manufacture a
    // snapshot or gate generation on optional conditioning.
    if (receipt.ready === false && receipt.snapshot_id === null) return undefined;
    if (!receipt.snapshot_id || typeof receipt.snapshot_id !== "string" ||
        !receipt.awareness || !["string", "object"].includes(typeof receipt.awareness) ||
        Array.isArray(receipt.awareness)) {
      throw new Error("Invalid unified awareness snapshot receipt");
    }
    return receipt;
  } catch (error) {
    throw new MaxCoreControlError("Required MaxCore awareness snapshot unavailable", 503, error);
  }
}

/** Never substitutes local, stale, empty, or heuristic context on failure. */
export async function getAwarenessContext(mode: AwarenessMode): Promise<AwarenessContext> {
  const receipt = await getUnifiedAwarenessContext(mode);
  if (!receipt) return {};
  return {
    ...receipt,
    contextString: typeof receipt.awareness === "string"
      ? receipt.awareness
      : typeof receipt.awareness.contextString === "string" ? receipt.awareness.contextString : undefined,
  };
}

export async function getUnifiedAwarenessStatus(): Promise<Record<string, unknown>> {
  return maxCoreControlTransport.request("/api/awareness/unified/status", {
    authScope: "generation", timeoutMs: 5_000,
  });
}

export interface MaxCoreAwarenessPayload extends Partial<UnifiedAwarenessReceipt> {
  /** Explicit caller direction is transported unchanged, never prompt-planned here. */
  extraContext: string;
}

export async function buildMaxCoreAwarenessPayload(
  mode: AwarenessMode, platform?: string, extraDirection?: string,
): Promise<MaxCoreAwarenessPayload> {
  return {
    ...await getUnifiedAwarenessContext(mode, platform),
    extraContext: extraDirection ?? "",
  };
}