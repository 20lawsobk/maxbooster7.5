/**
 * POCKET DIMENSION STORAGE ENGINE
 *
 * A virtualized, infinite-capacity storage system that uses advanced compression,
 * content-addressed chunking, and streaming decompression to create what effectively
 * appears as unlimited storage space within bracket notation.
 *
 * Inspired by the compression techniques used for desktop app installers,
 * "turned up to infinite" - creating a storage pocket dimension within brackets.
 *
 * Features:
 * - Bracket notation access: pocket['path/to/file']
 * - Streaming compression/decompression
 * - Content-addressed storage with deduplication
 * - Recursive compression (dimensions within dimensions)
 * - Delta compression for versioning
 * - Per-pocket encryption
 * - Infinite-like capacity through chunking + cloud storage
 */

import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scryptSync,
} from "crypto";
import { createGzip, createGunzip, constants as zlibConstants } from "zlib";
import { pipeline, Readable, Writable, Transform } from "stream";
import { promisify } from "util";
import { EventEmitter } from "events";
import fs from "fs/promises";
import path from "path";

const pipelineAsync = promisify(pipeline);

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PocketChunk {
  id: string; // Content-addressed hash
  size: number; // Original size
  compressedSize: number;
  compressionRatio: number;
  createdAt: Date;
  accessCount: number;
  lastAccessed: Date;
  encrypted: boolean;
  depth: number; // Recursion depth (dimension within dimension)
}

export interface PocketMetadata {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  totalSize: number;
  compressedSize: number;
  chunkCount: number;
  maxDepth: number;
  encrypted: boolean;
  version: number;
  parentDimension?: string; // For nested dimensions
}

export interface PocketEntry {
  path: string;
  type: "file" | "directory" | "dimension";
  size: number;
  compressedSize: number;
  chunks: string[]; // Chunk IDs
  createdAt: Date;
  modifiedAt: Date;
  version: number;
  metadata: Record<string, any>;
}

export interface PocketStats {
  totalEntries: number;
  totalSize: number;
  compressedSize: number;
  compressionRatio: number;
  deduplicationSavings: number;
  nestedDimensions: number;
  maxDepth: number;
  chunkCount: number;
  uniqueChunks: number;
}

export interface PocketDimensionConfig {
  id: string;
  name: string;
  encryptionKey?: string;
  chunkSize?: number; // Default 32 MB
  maxRecursionDepth?: number; // Default 10
  compressionLevel?: number; // 1-9, default 9
  enableDeduplication?: boolean;
  enableVersioning?: boolean;
  storagePath?: string;
}

// ============================================================================
// POCKET DIMENSION CORE ENGINE
// ============================================================================

export class PocketDimension extends EventEmitter {
  private id: string;
  private name: string;
  private encryptionKey: Buffer | null = null;
  private chunkSize: number;
  private maxRecursionDepth: number;
  private compressionLevel: number;
  private enableDeduplication: boolean;
  private enableVersioning: boolean;
  private storagePath: string;

  // In-memory indices (would be persisted in production)
  private chunks: Map<string, PocketChunk> = new Map();
  private entries: Map<string, PocketEntry> = new Map();
  private chunkData: Map<string, Buffer> = new Map(); // Chunk storage
  private nestedDimensions: Map<string, PocketDimension> = new Map();

  private metadata: PocketMetadata;
  private isOpen: boolean = false;
  private currentDepth: number = 0;
  private rawEncryptionKey: string | null = null; // Store raw key for persistence

  // Serialized + coalesced index persistence. `flush()` may be called
  // concurrently (e.g. parallel chunk writes); without ordering, a slower
  // older persist could finish last and overwrite newer index state, silently
  // dropping entries. We run at most one persist at a time and coalesce all
  // pending requests into a single trailing pass.
  private flushScheduled: Promise<void> | null = null;
  private flushDirty: boolean = false;

  constructor(config: PocketDimensionConfig) {
    super();

    this.id = config.id;
    this.name = config.name;
    this.chunkSize = config.chunkSize || 32 * 1024 * 1024; // 32 MB default
    this.maxRecursionDepth = config.maxRecursionDepth || 10;
    this.compressionLevel = config.compressionLevel || 9;
    this.enableDeduplication = config.enableDeduplication ?? true;
    this.enableVersioning = config.enableVersioning ?? true;
    this.storagePath = config.storagePath || "./pocket-dimensions";

    if (config.encryptionKey) {
      this.rawEncryptionKey = config.encryptionKey;
      this.encryptionKey = scryptSync(
        config.encryptionKey,
        "pocket-dimension-salt",
        32,
      );
    }

    this.metadata = {
      id: this.id,
      name: this.name,
      createdAt: new Date(),
      updatedAt: new Date(),
      totalSize: 0,
      compressedSize: 0,
      chunkCount: 0,
      maxDepth: 0,
      encrypted: !!this.encryptionKey,
      version: 1,
    };
  }

  // ============================================================================
  // BRACKET NOTATION ACCESS - The Magic Happens Here
  // ============================================================================

  /**
   * Creates a Proxy that allows bracket notation access to the pocket dimension
   * Usage: pocket['path/to/file'] or pocket['nested/dimension']['deeper/path']
   */
  public asBracketAccessor(): PocketBracketAccessor {
    return new Proxy(this, {
      get: (target, prop: string) => {
        if (typeof prop === "string") {
          // Check if this is a nested dimension
          if (target.nestedDimensions.has(prop)) {
            return target.nestedDimensions.get(prop)!.asBracketAccessor();
          }
          // Check if this is an existing entry
          if (target.entries.has(prop)) {
            return target.read(prop);
          }
          // Return accessor for creating new entry
          return {
            write: (data: Buffer | string) => target.write(prop, data),
            read: () => target.read(prop),
            delete: () => target.delete(prop),
            exists: () => target.exists(prop),
            createDimension: (config?: Partial<PocketDimensionConfig>) =>
              target.createNestedDimension(prop, config),
          };
        }
        return Reflect.get(target, prop);
      },
      set: (target, prop: string, value: Buffer | string) => {
        if (typeof prop === "string") {
          target.write(prop, value);
          return true;
        }
        return Reflect.set(target, prop, value);
      },
    }) as unknown as PocketBracketAccessor;
  }

  // ============================================================================
  // CORE OPERATIONS
  // ============================================================================

  async open(): Promise<void> {
    if (this.isOpen) return;

    // Ensure storage directory exists
    await fs.mkdir(path.join(this.storagePath, this.id), { recursive: true });

    // Load metadata if exists
    try {
      const metaPath = path.join(this.storagePath, this.id, "metadata.json");
      const metaData = await fs.readFile(metaPath, "utf-8");
      this.metadata = JSON.parse(metaData);

      // Load encryption key if the dimension was encrypted
      if (this.metadata.encrypted && !this.encryptionKey) {
        const keyPath = path.join(this.storagePath, this.id, ".keyfile");
        try {
          const keyData = await fs.readFile(keyPath, "utf-8");
          const keyInfo = JSON.parse(keyData);
          this.rawEncryptionKey = keyInfo.key;
          this.encryptionKey = scryptSync(
            keyInfo.key,
            "pocket-dimension-salt",
            32,
          );
        } catch {
          throw new Error(
            `Encrypted pocket dimension ${this.id} is missing its keyfile - data cannot be decrypted`,
          );
        }
      }

      // Load index
      const indexPath = path.join(this.storagePath, this.id, "index.json");
      const indexData = await fs.readFile(indexPath, "utf-8");
      const index = JSON.parse(indexData);

      this.entries = new Map(Object.entries(index.entries));
      this.chunks = new Map(Object.entries(index.chunks));
    } catch (error: any) {
      if (error.message?.includes("keyfile")) {
        throw error; // Re-throw keyfile errors
      }
      // New dimension, start fresh
    }

    this.isOpen = true;
    this.emit("opened", { id: this.id, name: this.name });
  }

  async close(): Promise<void> {
    if (!this.isOpen) return;

    // Persist metadata
    await this.persistMetadata();

    // Close nested dimensions
    for (const [, nested] of this.nestedDimensions) {
      await nested.close();
    }

    this.isOpen = false;
    this.emit("closed", { id: this.id });
  }

  /**
   * Durably flush the in-memory key→chunk index to disk without closing the
   * dimension. Chunk blobs are written immediately on `write()`, but the index
   * (entries/chunks maps) is otherwise only persisted on `close()`. A crash or
   * SIGKILL restart skips `close()`, which would orphan freshly written chunks.
   * Callers needing write durability must flush after mutating writes/deletes.
   */
  async flush(): Promise<void> {
    if (!this.isOpen) return;
    // Mark dirty and coalesce: if a persist is already scheduled, all callers
    // await the same trailing pass, which is guaranteed to run after the most
    // recent in-memory mutation (write/delete updates the maps synchronously
    // before calling flush()).
    this.flushDirty = true;
    if (this.flushScheduled) return this.flushScheduled;
    this.flushScheduled = (async () => {
      try {
        while (this.flushDirty) {
          this.flushDirty = false;
          await this.persistMetadata();
        }
      } finally {
        this.flushScheduled = null;
      }
    })();
    return this.flushScheduled;
  }

  /** Atomically write a file: write a temp sibling then rename over the target,
   * so a crash mid-write can never leave a truncated/corrupt file. */
  private async atomicWrite(
    filePath: string,
    data: string,
    mode?: number,
  ): Promise<void> {
    const tmpPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
    await fs.writeFile(
      tmpPath,
      data,
      mode !== undefined ? { mode } : undefined,
    );
    await fs.rename(tmpPath, filePath);
  }

  private async persistMetadata(): Promise<void> {
    const metaPath = path.join(this.storagePath, this.id, "metadata.json");
    await this.atomicWrite(metaPath, JSON.stringify(this.metadata, null, 2));

    // Serialize the key→chunk index incrementally (compact JSON, yielding to
    // the event loop every batch) so a pocket with tens of thousands of chunks
    // can never freeze the server for seconds during a flush. Mutations that
    // land between yields set flushDirty via flush(), so the coalesced trailing
    // persist always re-writes the newest state.
    const YIELD_EVERY = 1_000;
    const entryParts: string[] = [];
    let n = 0;
    for (const [k, v] of this.entries) {
      entryParts.push(`${JSON.stringify(k)}:${JSON.stringify(v)}`);
      if (++n % YIELD_EVERY === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
    const chunkParts: string[] = [];
    for (const [k, v] of this.chunks) {
      chunkParts.push(`${JSON.stringify(k)}:${JSON.stringify(v)}`);
      if (++n % YIELD_EVERY === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
    const indexPath = path.join(this.storagePath, this.id, "index.json");
    await this.atomicWrite(
      indexPath,
      `{"entries":{${entryParts.join(",")}},"chunks":{${chunkParts.join(",")}}}`,
    );

    // Persist encryption key if encrypted (stored separately for security)
    if (this.rawEncryptionKey) {
      const keyPath = path.join(this.storagePath, this.id, ".keyfile");
      await this.atomicWrite(
        keyPath,
        JSON.stringify(
          {
            key: this.rawEncryptionKey,
            createdAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        0o600,
      ); // Only owner can read/write
    }
  }

  // ============================================================================
  // WRITE OPERATIONS - Streaming Compression + Chunking
  // ============================================================================

  async write(
    entryPath: string,
    data: Buffer | string,
    options?: { depth?: number },
  ): Promise<PocketEntry> {
    if (!this.isOpen) await this.open();

    const buffer = typeof data === "string" ? Buffer.from(data) : data;
    const depth = options?.depth || 0;

    if (depth > this.maxRecursionDepth) {
      throw new Error(
        `Maximum recursion depth (${this.maxRecursionDepth}) exceeded - dimension inception limit reached`,
      );
    }

    // ── Evict old chunk files before writing new content ────────────────────
    // PDIM is content-addressed: every write() with different data produces new
    // chunk files with new hash IDs.  Without this cleanup the old chunk files
    // become permanent orphans on disk, growing without bound until ENOSPC.
    const oldEntry = this.entries.get(entryPath);
    if (oldEntry) {
      // Build a ref-count map so we only delete truly unreferenced chunks
      // (deduplication means the same chunk can be referenced by multiple entries).
      const refCounts = new Map<string, number>();
      for (const [, e] of this.entries) {
        for (const cid of e.chunks) {
          refCounts.set(cid, (refCounts.get(cid) ?? 0) + 1);
        }
      }
      for (const chunkId of oldEntry.chunks) {
        if ((refCounts.get(chunkId) ?? 0) <= 1) {
          const chunkPath = path.join(
            this.storagePath,
            this.id,
            "chunks",
            chunkId,
          );
          await fs.unlink(chunkPath).catch(() => {});
          this.chunks.delete(chunkId);
          this.chunkData.delete(chunkId);
        }
      }
    }

    const originalSize = buffer.length;
    const chunks: string[] = [];
    let compressedSize = 0;

    // Split into chunks
    for (let offset = 0; offset < buffer.length; offset += this.chunkSize) {
      const chunkData = buffer.subarray(
        offset,
        Math.min(offset + this.chunkSize, buffer.length),
      );
      const chunk = await this.processChunk(chunkData, depth);
      chunks.push(chunk.id);
      compressedSize += chunk.compressedSize;
    }

    const entry: PocketEntry = {
      path: entryPath,
      type: "file",
      size: originalSize,
      compressedSize,
      chunks,
      createdAt: this.entries.has(entryPath)
        ? this.entries.get(entryPath)!.createdAt
        : new Date(),
      modifiedAt: new Date(),
      version: (this.entries.get(entryPath)?.version || 0) + 1,
      metadata: {},
    };

    this.entries.set(entryPath, entry);
    this.updateMetadata(originalSize, compressedSize);

    this.emit("written", {
      path: entryPath,
      size: originalSize,
      compressedSize,
    });

    return entry;
  }

  private async processChunk(
    data: Buffer,
    depth: number,
  ): Promise<PocketChunk> {
    // Generate content-addressed hash
    const hash = this.hashContent(data);

    // Check for deduplication
    if (this.enableDeduplication && this.chunks.has(hash)) {
      const existing = this.chunks.get(hash)!;
      existing.accessCount++;
      existing.lastAccessed = new Date();
      return existing;
    }

    // Compress the chunk
    const compressed = await this.compress(data);

    // Encrypt if enabled
    const finalData = this.encryptionKey
      ? this.encrypt(compressed)
      : compressed;

    // Store the chunk
    this.chunkData.set(hash, finalData);
    await this.persistChunk(hash, finalData);

    const chunk: PocketChunk = {
      id: hash,
      size: data.length,
      compressedSize: finalData.length,
      compressionRatio: data.length / (finalData.length || 1),
      createdAt: new Date(),
      accessCount: 1,
      lastAccessed: new Date(),
      encrypted: !!this.encryptionKey,
      depth,
    };

    this.chunks.set(hash, chunk);

    return chunk;
  }

  private async persistChunk(id: string, data: Buffer): Promise<void> {
    const chunkDir = path.join(this.storagePath, this.id, "chunks");
    await fs.mkdir(chunkDir, { recursive: true });
    await fs.writeFile(path.join(chunkDir, id), data);
  }

  // ============================================================================
  // READ OPERATIONS - Streaming Decompression
  // ============================================================================

  async read(entryPath: string): Promise<Buffer> {
    if (!this.isOpen) await this.open();

    const entry = this.entries.get(entryPath);
    if (!entry) {
      throw new Error(`Entry not found in pocket dimension: ${entryPath}`);
    }

    const chunks: Buffer[] = [];

    for (const chunkId of entry.chunks) {
      const chunkData = await this.readChunk(chunkId);
      chunks.push(chunkData);
    }

    this.emit("read", { path: entryPath, size: entry.size });

    return Buffer.concat(chunks);
  }

  private async readChunk(id: string): Promise<Buffer> {
    // Check in-memory cache first
    let data = this.chunkData.get(id);

    if (!data) {
      // Load from disk
      const chunkPath = path.join(this.storagePath, this.id, "chunks", id);
      data = await fs.readFile(chunkPath);
      this.chunkData.set(id, data);
    }

    // Decrypt if needed
    const decrypted = this.encryptionKey ? this.decrypt(data) : data;

    // Decompress
    const decompressed = await this.decompress(decrypted);

    // Update access stats
    const chunk = this.chunks.get(id);
    if (chunk) {
      chunk.accessCount++;
      chunk.lastAccessed = new Date();
    }

    return decompressed;
  }

  async readStream(entryPath: string): Promise<Readable> {
    const data = await this.read(entryPath);
    return Readable.from(data);
  }

  // ============================================================================
  // NESTED DIMENSIONS - Dimensions Within Dimensions (Inception!)
  // ============================================================================

  async createNestedDimension(
    dimensionPath: string,
    config?: Partial<PocketDimensionConfig>,
  ): Promise<PocketDimension> {
    if (!this.isOpen) await this.open();

    if (this.currentDepth >= this.maxRecursionDepth) {
      throw new Error(
        `Maximum dimension nesting depth (${this.maxRecursionDepth}) reached - cannot go deeper into the pocket dimension`,
      );
    }

    const nested = new PocketDimension({
      id: `${this.id}/${dimensionPath}`,
      name: dimensionPath,
      encryptionKey: config?.encryptionKey,
      chunkSize: config?.chunkSize || this.chunkSize,
      maxRecursionDepth: config?.maxRecursionDepth || this.maxRecursionDepth,
      compressionLevel: config?.compressionLevel || this.compressionLevel,
      enableDeduplication:
        config?.enableDeduplication ?? this.enableDeduplication,
      enableVersioning: config?.enableVersioning ?? this.enableVersioning,
      storagePath: this.storagePath,
    });

    (nested as any).currentDepth = this.currentDepth + 1;
    (nested as any).metadata.parentDimension = this.id;

    await nested.open();
    this.nestedDimensions.set(dimensionPath, nested);

    // Create directory entry
    const entry: PocketEntry = {
      path: dimensionPath,
      type: "dimension",
      size: 0,
      compressedSize: 0,
      chunks: [],
      createdAt: new Date(),
      modifiedAt: new Date(),
      version: 1,
      metadata: { dimensionId: nested.id },
    };

    this.entries.set(dimensionPath, entry);
    this.metadata.maxDepth = Math.max(
      this.metadata.maxDepth,
      this.currentDepth + 1,
    );

    this.emit("dimensionCreated", {
      path: dimensionPath,
      depth: this.currentDepth + 1,
    });

    return nested;
  }

  getNestedDimension(path: string): PocketDimension | undefined {
    return this.nestedDimensions.get(path);
  }

  // ============================================================================
  // UTILITY OPERATIONS
  // ============================================================================

  exists(entryPath: string): boolean {
    return this.entries.has(entryPath);
  }

  async delete(entryPath: string): Promise<boolean> {
    if (!this.isOpen) await this.open();

    const entry = this.entries.get(entryPath);
    if (!entry) return false;

    // If it's a dimension, close and remove it
    if (entry.type === "dimension") {
      const nested = this.nestedDimensions.get(entryPath);
      if (nested) {
        await nested.close();
        this.nestedDimensions.delete(entryPath);
      }
    }

    // Remove the entry first so ref-counting below excludes it
    this.entries.delete(entryPath);
    this.metadata.totalSize -= entry.size;
    this.metadata.compressedSize -= entry.compressedSize;

    // ── Actually delete chunk files from disk ────────────────────────────────
    // Build a ref-count of remaining entries so we don't delete shared chunks.
    const refCounts = new Map<string, number>();
    for (const [, e] of this.entries) {
      for (const cid of e.chunks) {
        refCounts.set(cid, (refCounts.get(cid) ?? 0) + 1);
      }
    }
    for (const chunkId of entry.chunks) {
      if (!refCounts.has(chunkId)) {
        const chunkPath = path.join(
          this.storagePath,
          this.id,
          "chunks",
          chunkId,
        );
        await fs.unlink(chunkPath).catch(() => {});
        this.chunks.delete(chunkId);
        this.chunkData.delete(chunkId);
      }
    }

    this.emit("deleted", { path: entryPath });

    return true;
  }

  /**
   * compact() — Garbage-collect orphaned chunk files.
   *
   * Scans the chunks/ directory on disk and deletes any chunk file whose ID is
   * not referenced by any current entry.  Call this when ENOSPC is detected or
   * as a periodic maintenance step to reclaim disk space accumulated from
   * previous runs / old code paths that didn't clean up on write.
   *
   * Returns the number of orphaned chunk files deleted.
   */
  async compact(): Promise<number> {
    if (!this.isOpen) await this.open();

    const chunkDir = path.join(this.storagePath, this.id, "chunks");
    let files: string[];
    try {
      files = await fs.readdir(chunkDir);
    } catch {
      return 0; // chunk dir doesn't exist yet — nothing to compact
    }

    // Build the set of chunk IDs referenced by live entries
    const liveChunks = new Set<string>();
    for (const [, entry] of this.entries) {
      for (const cid of entry.chunks) {
        liveChunks.add(cid);
      }
    }

    let deleted = 0;
    for (const file of files) {
      if (!liveChunks.has(file)) {
        await fs.unlink(path.join(chunkDir, file)).catch(() => {});
        this.chunks.delete(file);
        this.chunkData.delete(file);
        deleted++;
      }
    }

    return deleted;
  }

  async list(prefix?: string): Promise<PocketEntry[]> {
    if (!this.isOpen) await this.open();

    const results: PocketEntry[] = [];

    for (const [path, entry] of this.entries) {
      if (!prefix || path.startsWith(prefix)) {
        results.push(entry);
      }
    }

    return results;
  }

  getStats(): PocketStats {
    let uniqueChunks = 0;
    let duplicateRefs = 0;

    for (const chunk of this.chunks.values()) {
      uniqueChunks++;
      duplicateRefs += chunk.accessCount - 1;
    }

    const deduplicationSavings =
      duplicateRefs > 0
        ? (duplicateRefs / (uniqueChunks + duplicateRefs)) * 100
        : 0;

    return {
      totalEntries: this.entries.size,
      totalSize: this.metadata.totalSize,
      compressedSize: this.metadata.compressedSize,
      compressionRatio:
        this.metadata.totalSize > 0
          ? this.metadata.totalSize / this.metadata.compressedSize
          : 0,
      deduplicationSavings,
      nestedDimensions: this.nestedDimensions.size,
      maxDepth: this.metadata.maxDepth,
      chunkCount: this.chunks.size,
      uniqueChunks,
    };
  }

  // ============================================================================
  // COMPRESSION ENGINE
  // ============================================================================

  private async compress(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gzip = createGzip({
        level: this.compressionLevel,
        memLevel: 9,
        strategy: zlibConstants.Z_DEFAULT_STRATEGY,
      });

      const source = Readable.from(data);
      const destination = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        },
        final(callback) {
          resolve(Buffer.concat(chunks));
          callback();
        },
      });

      source.pipe(gzip).pipe(destination).on("error", reject);
    });
  }

  private async decompress(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gunzip = createGunzip();

      const source = Readable.from(data);
      const destination = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        },
        final(callback) {
          resolve(Buffer.concat(chunks));
          callback();
        },
      });

      source.pipe(gunzip).pipe(destination).on("error", reject);
    });
  }

  // ============================================================================
  // ENCRYPTION ENGINE
  // ============================================================================

  private encrypt(data: Buffer): Buffer {
    if (!this.encryptionKey) return data;

    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Prepend IV and auth tag
    return Buffer.concat([iv, authTag, encrypted]);
  }

  private decrypt(data: Buffer): Buffer {
    if (!this.encryptionKey) return data;

    const iv = data.subarray(0, 16);
    const authTag = data.subarray(16, 32);
    const encrypted = data.subarray(32);

    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv, {
      authTagLength: 16,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private hashContent(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex");
  }

  private updateMetadata(originalSize: number, compressedSize: number): void {
    this.metadata.totalSize += originalSize;
    this.metadata.compressedSize += compressedSize;
    this.metadata.chunkCount = this.chunks.size;
    this.metadata.updatedAt = new Date();
  }

  getMetadata(): PocketMetadata {
    return { ...this.metadata };
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }
}

// ============================================================================
// BRACKET ACCESSOR TYPE
// ============================================================================

export interface PocketBracketAccessor {
  [key: string]:
    | PocketBracketAccessor
    | Promise<Buffer>
    | {
        write: (data: Buffer | string) => Promise<PocketEntry>;
        read: () => Promise<Buffer>;
        delete: () => Promise<boolean>;
        exists: () => boolean;
        createDimension: (
          config?: Partial<PocketDimensionConfig>,
        ) => Promise<PocketDimension>;
      };
}

// ============================================================================
// POCKET DIMENSION MANAGER - Global Access Point
// ============================================================================

export class PocketDimensionManager {
  private static instance: PocketDimensionManager;
  private dimensions: Map<string, PocketDimension> = new Map();
  private storagePath: string;

  private constructor(storagePath: string = "./pocket-dimensions") {
    this.storagePath = storagePath;
  }

  static getInstance(storagePath?: string): PocketDimensionManager {
    if (!PocketDimensionManager.instance) {
      PocketDimensionManager.instance = new PocketDimensionManager(storagePath);
    }
    return PocketDimensionManager.instance;
  }

  /**
   * Open or create a pocket dimension with bracket notation access
   * Usage: const pocket = await manager.openPocket('my-dimension');
   *        pocket['files/audio.mp3'].write(audioData);
   */
  async openPocket<T extends string>(
    id: T,
    config?: Partial<PocketDimensionConfig>,
  ): Promise<PocketDimension & PocketBracketAccessor> {
    if (this.dimensions.has(id)) {
      const dimension = this.dimensions.get(id)!;
      return dimension as PocketDimension & PocketBracketAccessor;
    }

    const dimension = new PocketDimension({
      id,
      name: config?.name || id,
      encryptionKey: config?.encryptionKey,
      chunkSize: config?.chunkSize,
      maxRecursionDepth: config?.maxRecursionDepth,
      compressionLevel: config?.compressionLevel,
      enableDeduplication: config?.enableDeduplication,
      enableVersioning: config?.enableVersioning,
      storagePath: this.storagePath,
    });

    await dimension.open();
    this.dimensions.set(id, dimension);

    // Return dimension with bracket accessor capability
    return new Proxy(dimension, {
      get: (target, prop: string) => {
        if (prop in target) {
          const value = (target as any)[prop];
          return typeof value === "function" ? value.bind(target) : value;
        }
        // Bracket accessor for paths
        return target.asBracketAccessor()[prop];
      },
      set: (target, prop: string, value: Buffer | string) => {
        if (prop in target) {
          (target as any)[prop] = value;
          return true;
        }
        target.write(prop, value);
        return true;
      },
    }) as PocketDimension & PocketBracketAccessor;
  }

  async closePocket(id: string): Promise<void> {
    const dimension = this.dimensions.get(id);
    if (dimension) {
      await dimension.close();
      this.dimensions.delete(id);
    }
  }

  async closeAll(): Promise<void> {
    for (const [id] of this.dimensions) {
      await this.closePocket(id);
    }
  }

  listPockets(): string[] {
    return Array.from(this.dimensions.keys());
  }

  getPocket(id: string): PocketDimension | undefined {
    return this.dimensions.get(id);
  }

  getGlobalStats(): {
    pockets: number;
    totalSize: number;
    compressedSize: number;
  } {
    let totalSize = 0;
    let compressedSize = 0;

    for (const dimension of this.dimensions.values()) {
      const stats = dimension.getStats();
      totalSize += stats.totalSize;
      compressedSize += stats.compressedSize;
    }

    return {
      pockets: this.dimensions.size,
      totalSize,
      compressedSize,
    };
  }
}

// Export singleton
export const pocketManager = PocketDimensionManager.getInstance(
  "./pocket-dimensions",
);

// ============================================================================
// CONVENIENCE FUNCTION - Open pocket dimension with template literal syntax
// ============================================================================

export async function pocket<T extends string>(
  id: T,
  config?: Partial<PocketDimensionConfig>,
): Promise<PocketDimension & PocketBracketAccessor> {
  return pocketManager.openPocket(id, config);
}

export default {
  PocketDimension,
  PocketDimensionManager,
  pocketManager,
  pocket,
};
