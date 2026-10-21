import { contentAwarenessService, type ContentAwarenessContext } from "./contentAwarenessService.js";

/** Live public context comes exclusively from Core's context endpoint. */
export interface GenerationEnrichment {
  awarenessBlock: string;
  hasData: boolean;
  receipt: ContentAwarenessContext;
}
export async function buildGenerationEnrichment(params: {
  userId: string;
  artistProfileId?: string;
  platforms: string[];
  context?: string;
}): Promise<GenerationEnrichment> {
  const receipt = await contentAwarenessService.getContextForMode(
    "content", params.platforms.length === 1 ? params.platforms[0] : "general",
  );
  const payload = generationAwarenessPayload(receipt, params.context);
  return { awarenessBlock: payload.awareness as string, hasData: true, receipt };
}

/** Preserve live provenance and caller direction without overwriting either. */
export function generationAwarenessPayload(
  receipt: ContentAwarenessContext,
  callerAwareness?: unknown,
  extraContext?: unknown,
): Record<string, unknown> {
  assertFreshGenerationAwareness(receipt);
  const live = receipt.contextString ?? (typeof receipt.awareness === "string"
    ? receipt.awareness : JSON.stringify(receipt.awareness));
  const caller = callerAwareness === undefined ? "" : typeof callerAwareness === "string"
    ? callerAwareness : JSON.stringify(callerAwareness);
  return {
    ...receipt,
    awareness: live + (caller && caller !== live ? "\n" + caller : ""),
    ...(extraContext !== undefined ? { extra_context: extraContext } : {}),
  };
}

export function assertFreshGenerationAwareness(receipt: ContentAwarenessContext): void {
  if (typeof receipt.expires_at !== "number" || !Number.isFinite(receipt.expires_at) ||
      receipt.expires_at * 1000 <= Date.now()) {
    throw Object.assign(new Error("Generation awareness snapshot expired"), { status: 503 });
  }
}
