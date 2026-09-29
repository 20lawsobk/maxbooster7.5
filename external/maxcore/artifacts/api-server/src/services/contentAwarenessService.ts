/** Read-only compatibility facade for Core's mandatory immutable snapshot. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ContentGenerationMode = "social" | "ad_copy" | "video_script" | "email" |
  "press_release" | "blog" | "melody" | "music" | "songwriting" | "content" | "advertising";
export interface ContentAwarenessContext {
  snapshot_id: string;
  awareness: string | Record<string, unknown>;
  contextString?: string;
  [key: string]: unknown;
}
export class ContentGenerationAwarenessService {
  async getContextForMode(mode: ContentGenerationMode, platform?: string): Promise<ContentAwarenessContext> {
    try {
      const token = process.env.PDIM_LOCAL_CHANNEL_TOKEN;
      if (!token) throw new Error("Private awareness channel is not configured");
      const response = await fetch(`http://127.0.0.1:${process.env.MODEL_API_PORT ?? "9878"}/api/awareness/unified/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ modality: mode, platform }),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      if (!response.ok) throw new Error(`Unified awareness HTTP ${response.status}`);
      const receipt: unknown = await response.json();
      if (typeof receipt !== "object" || receipt === null || Array.isArray(receipt) ||
          !("snapshot_id" in receipt) || typeof receipt.snapshot_id !== "string" || !receipt.snapshot_id ||
          !("awareness" in receipt)) throw new Error("Invalid awareness receipt");
      const awareness = receipt.awareness;
      if (!(typeof awareness === "string" ? awareness.length > 0 : isRecord(awareness))) {
        throw new Error("Invalid awareness receipt");
      }
      const contextString = typeof awareness === "string" ? awareness
        : "contextString" in awareness ? awareness.contextString : undefined;
      if (contextString !== undefined && typeof contextString !== "string") {
        throw new Error("Invalid awareness receipt");
      }
      return {
        ...receipt,
        snapshot_id: receipt.snapshot_id,
        awareness,
        contextString,
      };
    } catch (cause) {
      throw Object.assign(new Error("Required MaxCore awareness snapshot unavailable", { cause }), { status: 503 });
    }
  }
}
export const contentAwarenessService = new ContentGenerationAwarenessService();