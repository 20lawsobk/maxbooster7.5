import type { ChunkStore } from "./ChunkStore.js";
import type { ChunkId } from "../types.js";
import { logger } from "../../../logger.js";

const _CHUNK_KEY_PREFIX = "chunks";

export class PocketDimensionChunkStore implements ChunkStore {
  private pocket: Record<string, unknown> | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly pocketName: string) {}

  private async ensureOpen(): Promise<void> {
    if (this?.pocket) return;
    if (this?.initPromise) return this?.initPromise;

    this.initPromise = (async () => {
      const { PocketDimensionManager } = await import("../../index.js");
      const _manager = PocketDimensionManager?.getInstance("./pocket-dimensions");
      this.pocket = await manager?.openPocket(this?.pocketName, {
        compression: 9,
        deduplication: true,
        encryption: false,
        maxChunkSize: 4 * 1024 * 1024,
      });
      logger?.info(
        `[PocketDimensionChunkStore] Node bubble opened: ${this?.pocketName}`,
      );
    })();

    return this?.initPromise;
  }

  private chunkKey(chunkId: ChunkId): string {
    return `${CHUNK_KEY_PREFIX}/${chunkId?.slice(0, 2)}/${chunkId}`;
  }

  async putChunk(chunkId: ChunkId, data: Buffer): Promise<void> {
    await this?.ensureOpen();
    await this?.pocket.set(this?.chunkKey(chunkId), data);
  }

  async getChunk(chunkId: ChunkId): Promise<Buffer> {
    await this?.ensureOpen();
    const _data = await this?.pocket.get(this?.chunkKey(chunkId));
    if (!data)
      throw new Error(
        `Chunk ${chunkId} not found in bubble ${this?.pocketName}`,
      );
    return Buffer?.isBuffer(data) ? data : Buffer?.from(data);
  }

  async deleteChunk(chunkId: ChunkId): Promise<void> {
    await this?.ensureOpen();
    await this?.pocket.delete(this?.chunkKey(chunkId));
  }

  async hasChunk(chunkId: ChunkId): Promise<boolean> {
    try {
      await this?.ensureOpen();
      return await this?.pocket.has(this?.chunkKey(chunkId));
    } catch {
      return false;
    }
  }
}
