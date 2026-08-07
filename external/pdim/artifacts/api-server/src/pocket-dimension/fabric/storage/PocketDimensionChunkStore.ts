import type { ChunkStore } from "./ChunkStore.js";
import type { ChunkId } from "../types.js";

const CHUNK_KEY_PREFIX = "chunks";

export class PocketDimensionChunkStore implements ChunkStore {
  private pocket: import("../../index.js").PocketDimension | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly pocketName: string) {}

  private async ensureOpen(): Promise<void> {
    if (this.pocket) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const { PocketDimensionManager } = await import("../../index.js");
      const manager = PocketDimensionManager.getInstance("./pocket-dimensions");
      this.pocket = await manager.openPocket(this.pocketName, {
        compressionLevel: 9,
        enableDeduplication: true,
        chunkSize: 4 * 1024 * 1024,
      });
    })();

    return this.initPromise;
  }

  private chunkKey(chunkId: ChunkId): string {
    return `${CHUNK_KEY_PREFIX}/${chunkId.slice(0, 2)}/${chunkId}`;
  }

  async putChunk(chunkId: ChunkId, data: Buffer): Promise<void> {
    await this.ensureOpen();
    await this.pocket!.write(this.chunkKey(chunkId), data);
    // Durably persist the key→chunk index so the shard survives a restart that
    // never runs close() (e.g. SIGKILL). Without this the chunk blob is on disk
    // but unreferenced, and erasure reconstruction cannot find it.
    await this.pocket!.flush();
  }

  async getChunk(chunkId: ChunkId): Promise<Buffer> {
    await this.ensureOpen();
    const data = await this.pocket!.read(this.chunkKey(chunkId));
    if (!data)
      throw new Error(
        `Chunk ${chunkId} not found in pocket ${this.pocketName}`,
      );
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  }

  async deleteChunk(chunkId: ChunkId): Promise<void> {
    await this.ensureOpen();
    await this.pocket!.delete(this.chunkKey(chunkId));
    await this.pocket!.flush();
  }

  async hasChunk(chunkId: ChunkId): Promise<boolean> {
    try {
      await this.ensureOpen();
      const data = await this.pocket!.read(this.chunkKey(chunkId)).catch(
        () => null,
      );
      return data !== null;
    } catch {
      return false;
    }
  }
}
