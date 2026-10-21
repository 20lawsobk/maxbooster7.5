import type {
  AwarenessMode,
  UnifiedAwarenessReceipt,
} from "./awarenessContext.js";
import { MaxCoreControlError, maxCoreControlTransport } from "./maxcoreControlTransport.js";

const generationModes: Readonly<Record<string, AwarenessMode>> = {
  "/api/content/generate": "content",
  "/api/generate/content": "content",
  "/api/generate/text": "content",
  "/api/platform/social/generate": "social",
  "/api/platform/ads/generate": "advertising",
  "/api/generate/image": "image",
  "/api/generate/audio": "audio",
  "/api/generate/video": "video",
  "/api/generate-video": "video",
  "/api/video/generate-ai": "video",
  "/api/platform/video/generate": "video",
  "/api/video/extend": "video",
  "/api/platform/daw/generate": "music",
  "/api/generate/campaign": "content",
};

export function usesGenerationAwareness(endpoint: string): boolean {
  return Object.hasOwn(generationModes, endpoint.split("?")[0]);
}

/** Fetch MaxCore's live signals; this layer neither plans nor generates copy. */
export async function prepareGenerationAwareness(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const mode = generationModes[endpoint.split("?")[0]];
  if (!mode) return body;
  const receipt = await maxCoreControlTransport.request<UnifiedAwarenessReceipt>(
    "/api/awareness/unified/context", {
      method: "POST", authScope: "generation", timeoutMs: 5_000,
      body: { modality: mode, platform: typeof body.platform === "string" ? body.platform : undefined },
    },
  );
  const context = typeof receipt?.awareness === "string"
    ? receipt.awareness
    : receipt?.awareness && typeof receipt.awareness === "object"
      ? receipt.awareness.contextString
      : undefined;
  if (!receipt || receipt.ready === false ||
      typeof receipt.snapshot_id !== "string" || !receipt.snapshot_id.trim() ||
      typeof context !== "string" || !context.trim() ||
      typeof receipt.expires_at !== "number" ||
      !Number.isFinite(receipt.expires_at) || receipt.expires_at * 1000 <= Date.now()) {
    throw new MaxCoreControlError("Fresh live awareness is unavailable for generation", 503);
  }
  return {
    ...body,
    awareness: {
      ...receipt,
      // Keep caller material separate from the authoritative public receipt.
      ...(body.awareness !== undefined ? { caller_context: body.awareness } : {}),
    },
  };
}
