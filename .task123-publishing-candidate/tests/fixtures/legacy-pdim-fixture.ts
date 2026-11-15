/** Synthetic historical-format bytes/index only; never used by production uploads. */
import { createHash } from "node:crypto";
import { pocketManager } from "../../server/pocket-dimension/index.js";
import type { HybridFileMetadata } from "../../server/services/hybridStorageService.js";
import { getPdimClient } from "../../server/lib/pdimClient.js";

export async function seedLegacyPdimFixture(items: Array<{ owner: string; name: string; bytes: Buffer; mimeType?: string; metadata?: Record<string, unknown> }>) {
  const pocket = await pocketManager.openPocket("hybrid-cold-storage", {
    compressionLevel: 9, enableDeduplication: true, enableVersioning: true, chunkSize: 32 * 1024 * 1024,
  });
  const files: Record<string, HybridFileMetadata> = {};
  const contentHashes: Record<string, string[]> = {};
  for (const [position, item] of items.entries()) {
    const key = `${item.owner}/legacy-${position}-${item.name}`;
    const contentHash = createHash("sha256").update(item.bytes).digest("hex");
    const prior = contentHashes[contentHash]?.[0];
    const stored = prior ? { compressedSize: item.bytes.length } : await pocket.write(`storage/${key}`, item.bytes);
    files[key] = {
      key, userId: item.owner, originalName: item.name, mimeType: item.mimeType ?? "application/octet-stream",
      contentHash, sizeBytes: item.bytes.length, compressedSize: stored.compressedSize,
      tier: "cold", location: "pocket-dimension", accessCount: 0, createdAt: new Date(), lastAccessed: new Date(),
      isPublic: false, isDeduplicated: Boolean(prior), ...(prior ? { deduplicationRef: prior } : {}), metadata: item.metadata,
    };
    (contentHashes[contentHash] ??= []).push(key);
  }
  await getPdimClient().set("hybrid:storage:index", JSON.stringify({ files, contentHashes, publicHashes: {} }));
  await pocketManager.closeAll();
  return Object.values(files);
}
