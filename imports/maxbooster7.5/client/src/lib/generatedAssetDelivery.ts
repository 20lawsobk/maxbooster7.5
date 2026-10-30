/** A generation plan is not a finished text or media asset. */
export function isDeliveredGenerationAsset(asset: {
  modality?: string; payload?: unknown; metadata?: { kind?: string; status?: string };
}): boolean {
  if (["specification", "plan", "planning"].includes(asset.metadata?.kind ?? "") ||
      ["failed", "pending", "queued"].includes(asset.metadata?.status ?? "")) return false;
  if (typeof asset.payload !== "string" || !asset.payload.trim()) return false;
  if ((asset.modality ?? "text") === "text") return !asset.payload.startsWith("asset://");
  if (!["image", "audio", "video"].includes(asset.modality!)) return false;
  if (!asset.payload.startsWith("/api/storage/file/")) return false;
  try {
    const key = decodeURIComponent(asset.payload.slice("/api/storage/file/".length));
    return /^users\/[^/]+\/.+/.test(key) && !/[\\\0%?#]/.test(key) && !key.split("/").includes("..");
  } catch { return false; }
}
