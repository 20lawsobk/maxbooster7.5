/** File bytes use Pocket Dimension; ownership and per-file state use PostgreSQL.
 * Cross-instance byte authority must still be provided by the deployment. */
import { pocketManager } from "../pocket-dimension/index.js";
import { createHash, randomUUID } from "crypto";
import { getPdimClient } from "../lib/pdimClient.js";
import { HybridStorageRepository, type HybridMetadataRow } from "./hybridStorageRepository.js";
import { HybridImmutableByteStore } from "./hybridImmutableByteStore.js";

const COLD_TIER_THRESHOLD_DAYS = 30;
const COLD_TIER_THRESHOLD_MS = COLD_TIER_THRESHOLD_DAYS * 86400000;
const HOT_ACCESS_COUNT_THRESHOLD = 5;

export type StorageTier = "hot" | "cold";
export type StorageLocation = "replit" | "pocket-dimension";

export interface HybridFileMetadata {
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  compressedSize: number;
  tier: StorageTier;
  location: StorageLocation;
  contentHash: string;
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  userId: string;
  isPublic: boolean;
  isDeduplicated: boolean;
  deduplicationRef?: string;
  metadata?: Record<string, any>;
}

export interface DeduplicationStats {
  totalDuplicates: number;
  spaceSaved: number;
  savingsPercent: number;
  crossUserDuplicates: number;
}

export interface TierBreakdown {
  hot: {
    count: number;
    sizeBytes: number;
    files: string[];
  };
  cold: {
    count: number;
    sizeBytes: number;
    compressedSize: number;
    compressionRatio: number;
    files: string[];
  };
}

export interface StorageAnalytics {
  totalFiles: number;
  totalSizeBytes: number;
  physicalSizeBytes: number;
  tierBreakdown: TierBreakdown;
  deduplication: DeduplicationStats;
  overallCompressionRatio: number;
  costSavingsPercent: number;
  recommendations: StorageRecommendation[];
  accessPatterns: {
    mostAccessed: HybridFileMetadata[];
    leastAccessed: HybridFileMetadata[];
    recentlyAccessed: HybridFileMetadata[];
  };
}

export interface StorageRecommendation {
  type: "tier_down" | "tier_up" | "deduplicate" | "cleanup" | "compress";
  priority: "low" | "medium" | "high";
  message: string;
  potentialSavings?: number;
  affectedKeys?: string[];
}

export interface UploadResult {
  key: string;
  tier: StorageTier;
  sizeBytes: number;
  compressedSize: number;
  contentHash: string;
  isDeduplicated: boolean;
  compressionRatio?: number;
}

export interface TieringDecision {
  shouldTierDown: boolean;
  shouldTierUp: boolean;
  reason: string;
  currentTier: StorageTier;
  recommendedTier: StorageTier;
}

interface ByteStore {
  write(key: string, data: Buffer): Promise<{ compressedSize: number }>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<boolean>;
}
interface StorageDependencies {
  repository?: HybridStorageRepository;
  byteStore?: ByteStore;
  openPocket?: () => Promise<ByteStore>;
  loadLegacy?: () => Promise<string | null>;
}

/** Validate the whole legacy ownership snapshot before importing any row.
 * The source is never overwritten, evicted, repaired speculatively or deleted. */
export function parseLegacyHybridIndex(raw: string | null): HybridMetadataRow[] {
  if (raw === null) return [];
  const index = JSON.parse(raw);
  if (!index || typeof index !== "object" || Array.isArray(index) ||
      !["files", "contentHashes", "publicHashes"].every(name =>
        index[name] && typeof index[name] === "object" && !Array.isArray(index[name]))) {
    throw new Error("invalid hybrid storage index root");
  }
  const files = new Map<string, HybridFileMetadata>();
  for (const [key, value] of Object.entries(index.files)) {
    const v = value as HybridFileMetadata;
    const createdAt = new Date(v?.createdAt), lastAccessed = new Date(v?.lastAccessed);
    if (!v || typeof v !== "object" || Array.isArray(v) || v.key !== key || !key ||
        typeof v.userId !== "string" || !v.userId || typeof v.originalName !== "string" ||
        typeof v.mimeType !== "string" || typeof v.contentHash !== "string" ||
        typeof v.isPublic !== "boolean" || typeof v.isDeduplicated !== "boolean" ||
        !["hot", "cold"].includes(v.tier) ||
        ![v.sizeBytes, v.compressedSize, v.accessCount].every(n => Number.isSafeInteger(n) && n >= 0) ||
        !Number.isFinite(createdAt.getTime()) || !Number.isFinite(lastAccessed.getTime())) {
      throw new Error(`invalid hybrid storage file entry ${JSON.stringify(key)}`);
    }
    files.set(key, { ...v, createdAt, lastAccessed, location: "pocket-dimension" });
  }
  for (const [hash, keys] of Object.entries(index.contentHashes)) {
    if (!Array.isArray(keys) || !keys.every(key => typeof key === "string" && files.get(key)?.contentHash === hash)) {
      throw new Error("invalid hybrid content-hash references");
    }
  }
  for (const [hash, key] of Object.entries(index.publicHashes)) {
    if (typeof key !== "string" || files.get(key)?.contentHash !== hash) throw new Error("invalid hybrid public-hash references");
  }
  return [...files.values()].map(entry => {
    let source = entry;
    const visited = new Set<string>();
    while (source.isDeduplicated) {
      if (!source.deduplicationRef || visited.has(source.key)) throw new Error("cyclic or missing hybrid deduplication reference");
      visited.add(source.key);
      const next = files.get(source.deduplicationRef);
      if (!next || next.contentHash !== entry.contentHash || next.sizeBytes !== entry.sizeBytes) {
        throw new Error("unresolved hybrid deduplication ownership reference");
      }
      source = next;
    }
    return { entry, blobKey: `storage/${source.key}`, state: "active" };
  });
}

export class HybridStorageService {
  private static instance: HybridStorageService;
  private coldPocket: ByteStore | null = null;
  private repository?: HybridStorageRepository;
  private readonly byteStore: ByteStore;
  private initialization?: Promise<void>;

  constructor(private readonly dependencies: StorageDependencies = {}) {
    this.repository = dependencies.repository;
    this.byteStore = dependencies.byteStore ?? new HybridImmutableByteStore({
      // Bypass PDIM's stale-on-error L1 reads for publication/integrity checks.
      get: async key => (await getPdimClient().mget(key))[0],
      set: (key, value) => getPdimClient().set(key, value),
      setnx: (key, value) => getPdimClient().setnx(key, value),
      del: (...keys) => getPdimClient().del(...keys),
    });
  }

  static getInstance(): HybridStorageService {
    return HybridStorageService.instance ??= new HybridStorageService();
  }

  async initialize(): Promise<void> {
    if (!this.initialization) this.initialization = this.initializeOnce().catch(error => {
      this.initialization = undefined;
      throw error;
    });
    return this.initialization;
  }

  private async initializeOnce(): Promise<void> {
    try {
      this.coldPocket = await (this.dependencies.openPocket?.() ?? pocketManager.openPocket("hybrid-cold-storage", {
        compressionLevel: 9, enableDeduplication: true, enableVersioning: true, chunkSize: 32 * 1024 * 1024,
      }));
    } catch (error) {
      throw new Error("Hybrid storage initialization failed: Pocket Dimension is unavailable or corrupt", { cause: error });
    }
    if (!this.repository) {
      const { pool } = await import("../db.js");
      this.repository = new HybridStorageRepository(pool);
    }
    try {
      await this.repository.importLegacy(async () => parseLegacyHybridIndex(await (
        this.dependencies.loadLegacy?.() ?? getPdimClient().get("hybrid:storage:index")
      )));
    } catch (error) {
      throw new Error("Failed to load hybrid storage ownership index: stored value is unavailable or corrupt", { cause: error });
    }
  }

  async upload(userId: string, fileName: string, data: Buffer, mimeType: string, options?: {
    folder?: string; forceTier?: StorageTier; forceLocation?: StorageLocation;
    isPublic?: boolean; metadata?: Record<string, any>;
  }): Promise<UploadResult> {
    await this.initialize();
    if (!userId || !fileName || !Buffer.isBuffer(data) || !mimeType) throw new Error("Invalid hybrid upload");
    const contentHash = createHash("sha256").update(data).digest("hex");
    const name = fileName.replace(/[^a-zA-Z0-9?._-]/g, "_");
    const folder = options?.folder ? options.folder.replace(/[^a-zA-Z0-9/_-]/g, "_") + "/" : "";
    const key = `${userId}/${folder}${randomUUID()}-${name}`;
    const entry: HybridFileMetadata = {
      key, originalName: fileName, mimeType, sizeBytes: data.length, compressedSize: data.length,
      tier: "cold", location: "pocket-dimension", contentHash, accessCount: 0,
      lastAccessed: new Date(), createdAt: new Date(), userId,
      isPublic: options?.isPublic ?? false, isDeduplicated: false, metadata: options?.metadata,
    };
    const blobKey = `hybrid:v2:${randomUUID()}`;
    // Keep a durable, invisible intent before writing bytes. Ambiguous SQL/network
    // failures retain this record for reconciliation; they never ACK an upload.
    const intent = await this.repository!.beginUpload(entry, blobKey);
    if (intent.deduplicated) {
      const verified = await this.byteStore.read(intent.blobKey);
      if (!verified.equals(data)) throw new Error("Hybrid deduplicated bytes failed verification");
      await this.repository!.activate(key, intent.compressedSize);
      return { key, tier: "cold", sizeBytes: data.length, compressedSize: intent.compressedSize,
        contentHash, isDeduplicated: true,
        compressionRatio: intent.compressedSize ? data.length / intent.compressedSize : 1 };
    }
    const stored = await this.byteStore.write(blobKey, data);
    if (!Number.isSafeInteger(stored.compressedSize) || stored.compressedSize < 0) throw new Error("Invalid stored byte receipt");
    await this.repository!.activate(key, stored.compressedSize);
    return { key, tier: "cold", sizeBytes: data.length, compressedSize: stored.compressedSize,
      contentHash, isDeduplicated: false,
      compressionRatio: stored.compressedSize ? data.length / stored.compressedSize : 1 };
  }

  async read(userId: string, key: string): Promise<Buffer> {
    await this.initialize();
    const row = await this.repository!.get(key);
    if (!row) throw new Error(`File not found: ${key}`);
    if (row.entry.userId !== userId && !row.entry.isPublic) throw new Error(`Access denied: ${key}`);
    const data = await this.storeFor(row.blobKey).read(row.blobKey);
    if (data.length !== row.entry.sizeBytes || createHash("sha256").update(data).digest("hex") !== row.entry.contentHash) {
      throw new Error("Hybrid stored file integrity check failed");
    }
    await this.repository!.touch(key);
    return data;
  }

  async delete(userId: string, key: string): Promise<boolean> {
    await this.initialize();
    const deletion = await this.repository!.beginDelete(key, userId);
    if (!deletion.found) return false;
    if (deletion.blobKey) {
      await this.storeFor(deletion.blobKey).delete(deletion.blobKey);
      await this.repository!.finishDelete(key, userId);
    }
    return true;
  }

  /** Explicit recovery of a retained upload intent, without guessing that a
   * missing/unreadable blob was committed. The caller must own the intent. */
  async recoverPendingUpload(userId: string, key: string): Promise<boolean> {
    await this.initialize();
    const row = await this.repository!.get(key, true);
    if (!row) return false;
    if (row.entry.userId !== userId) throw new Error(`Access denied: ${key}`);
    if (row.state !== "uploading") return row.state === "active";
    const data = await this.storeFor(row.blobKey).read(row.blobKey);
    if (data.length !== row.entry.sizeBytes || createHash("sha256").update(data).digest("hex") !== row.entry.contentHash) {
      throw new Error("Hybrid pending upload integrity check failed");
    }
    const receipt = await this.storeFor(row.blobKey).write(row.blobKey, data);
    await this.repository!.activate(key, receipt.compressedSize);
    return true;
  }

  private storeFor(blobKey: string): ByteStore {
    return blobKey.startsWith("hybrid:v2:") ? this.byteStore : this.coldPocket!;
  }

  async listFiles(userId: string, options?: {
    tier?: StorageTier; location?: StorageLocation; folder?: string; includePublic?: boolean;
  }): Promise<HybridFileMetadata[]> {
    await this.initialize();
    return (await this.repository!.list(userId, options?.includePublic)).map(row => row.entry)
      .filter(entry => (!options?.tier || entry.tier === options.tier) &&
        (!options?.location || entry.location === options.location) &&
        (!options?.folder || entry.key.startsWith(`${entry.userId}/${options.folder}/`)))
      .sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime());
  }

  async getMetadata(key: string): Promise<HybridFileMetadata | undefined> {
    await this.initialize();
    return (await this.repository!.get(key))?.entry;
  }

  async exists(key: string): Promise<boolean> { return !!await this.getMetadata(key); }

  async getDownloadUrl(userId: string, key: string): Promise<string> {
    const entry = await this.getMetadata(key);
    if (!entry) throw new Error(`File not found: ${key}`);
    if (entry.userId !== userId && !entry.isPublic) throw new Error(`Access denied: ${key}`);
    return `/api/storage/hybrid/file/${encodeURIComponent(key)}`;
  }

  async tierDown(key: string): Promise<boolean> {
    const entry = await this.getMetadata(key);
    if (!entry || entry.tier === "cold" || entry.isDeduplicated) return false;
    return this.repository!.markCold(key);
  }

  async runAutoTiering(): Promise<{ tieredDown: number; tieredUp: number }> {
    await this.initialize();
    let tieredDown = 0;
    for (const { entry } of await this.repository!.list()) {
      if (entry.tier === "hot" && Date.now() - entry.lastAccessed.getTime() > COLD_TIER_THRESHOLD_MS &&
          entry.accessCount < HOT_ACCESS_COUNT_THRESHOLD && await this.tierDown(entry.key)) tieredDown++;
    }
    return { tieredDown, tieredUp: 0 };
  }

  async getAnalytics(userId?: string): Promise<StorageAnalytics> {
    await this.initialize();
    const rows = await this.repository!.list(userId);
    const entries = rows.map(row => row.entry);
    const unique = new Map(rows.map(row => [row.blobKey, row.entry]));
    const tierBreakdown: TierBreakdown = {
      hot: { count: 0, sizeBytes: 0, files: [] },
      cold: { count: 0, sizeBytes: 0, compressedSize: 0, compressionRatio: 1, files: [] },
    };
    for (const entry of unique.values()) {
      const tier = tierBreakdown[entry.tier];
      tier.count++; tier.sizeBytes += entry.sizeBytes; tier.files.push(entry.key);
      if (entry.tier === "cold") tierBreakdown.cold.compressedSize += entry.compressedSize;
    }
    if (tierBreakdown.cold.compressedSize) tierBreakdown.cold.compressionRatio = tierBreakdown.cold.sizeBytes / tierBreakdown.cold.compressedSize;
    const totalSizeBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
    const physicalSizeBytes = [...unique.values()].reduce((sum, entry) => sum + entry.compressedSize, 0);
    const ownersByBlob = new Map<string, Set<string>>();
    const duplicateRows: HybridMetadataRow[] = [];
    for (const row of rows) {
      const owners = ownersByBlob.get(row.blobKey);
      if (owners) { duplicateRows.push(row); owners.add(row.entry.userId); }
      else ownersByBlob.set(row.blobKey, new Set([row.entry.userId]));
    }
    const spaceSaved = duplicateRows.reduce((sum, row) => sum + row.entry.sizeBytes, 0);
    const cleanupCandidates = entries.filter(entry => entry.accessCount === 0);
    const recommendations: StorageRecommendation[] = cleanupCandidates.length > 10 ? [{
      type: "cleanup", priority: "medium",
      message: `${cleanupCandidates.length} files have never been accessed. Consider cleanup.`,
      potentialSavings: cleanupCandidates.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      affectedKeys: cleanupCandidates.slice(0, 10).map(entry => entry.key),
    }] : [];
    const sorted = [...entries].sort((a, b) => b.accessCount - a.accessCount);
    return {
      totalFiles: entries.length, totalSizeBytes, physicalSizeBytes, tierBreakdown,
      deduplication: { totalDuplicates: duplicateRows.length, spaceSaved,
        savingsPercent: totalSizeBytes ? spaceSaved / (totalSizeBytes || 1) * 100 : 0,
        crossUserDuplicates: duplicateRows.filter(row => (ownersByBlob.get(row.blobKey)?.size ?? 0) > 1).length },
      overallCompressionRatio: physicalSizeBytes ? totalSizeBytes / physicalSizeBytes : 1,
      costSavingsPercent: totalSizeBytes ? (totalSizeBytes - physicalSizeBytes) / (totalSizeBytes || 1) * 100 : 0,
      recommendations,
      accessPatterns: { mostAccessed: sorted.slice(0, 10), leastAccessed: sorted.slice(-10).reverse(),
        recentlyAccessed: [...entries].sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime()).slice(0, 10) },
    };
  }

  async getTierBreakdown(userId?: string): Promise<TierBreakdown> { return (await this.getAnalytics(userId)).tierBreakdown; }
  async getDeduplicationStats(userId?: string): Promise<DeduplicationStats> { return (await this.getAnalytics(userId)).deduplication; }

  async migrateFile(userId: string, key: string, _targetTier: StorageTier, _targetLocation: StorageLocation): Promise<boolean> {
    const entry = await this.getMetadata(key);
    if (!entry) return false;
    if (entry.userId !== userId) throw new Error(`Access denied: ${key}`);
    // PDIM is the sole tier; no byte rewrite or whole-index save is needed.
    return this.repository!.markCold(key, userId);
  }

  async optimizeStorage(_userId: string): Promise<{ tieredDown: number; tieredUp: number; deduplicated: number }> {
    return { ...await this.runAutoTiering(), deduplicated: 0 };
  }

  async cleanup(userId: string, options?: { olderThanDays?: number }): Promise<{ deletedCount: number; freedBytes: number }> {
    const days = options?.olderThanDays ?? 90;
    if (!Number.isFinite(days) || days < 0) throw new Error("Invalid cleanup age");
    let deletedCount = 0, freedBytes = 0;
    for (const entry of await this.listFiles(userId)) {
      if (entry.accessCount === 0 && Date.now() - entry.lastAccessed.getTime() > days * 86400000 && await this.delete(userId, entry.key)) {
        deletedCount++; freedBytes += entry.sizeBytes;
      }
    }
    return { deletedCount, freedBytes };
  }
}

export const hybridStorageService = HybridStorageService.getInstance();
