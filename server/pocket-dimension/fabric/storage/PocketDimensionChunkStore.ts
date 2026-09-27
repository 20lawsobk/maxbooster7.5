import type { ChunkStore } from "./ChunkStore.js";
import type { ChunkId } from "../types.js";
import { logger } from "../../../logger.js";
import type { PocketDimension } from "../../index.js";

const CHUNK_KEY_PREFIX = "chunks";

export class PocketDimensionChunkStore implements ChunkStore {
  private pocket: PocketDimension | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly pocketName: string) {}

  private async ensureOpen(): Promise<void> {
    if (this.pocket) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const { PocketDimensionManager } = await import("../../index.js");
      const manager = PocketDimensionManager?.getInstance("./pocket-dimensions");
      this.pocket = await manager?.openPocket(this.pocketName, {
        compressionLevel: 9,
        enableDeduplication: true,
        enableVersioning: false,
        chunkSize: 4 * 1024 * 1024,
      });
      logger.info(
        `[PocketDimensionChunkStore] Node bubble opened: ${this.pocketName}`,
      );
    })().catch((error) => {
      this.initPromise = null;
      throw error;
    });

    return this.initPromise;
  }

  private chunkKey(chunkId: ChunkId): string {
    return `${CHUNK_KEY_PREFIX}/${chunkId?.slice(0, 2)}/${chunkId}`;
  }

  async putChunk(chunkId: ChunkId, data: Buffer): Promise<void> {
    await this.ensureOpen();
    await this.pocket!.write(this.chunkKey(chunkId), data);
  }

  async getChunk(chunkId: ChunkId): Promise<Buffer> {
    await this.ensureOpen();
    const data = await this.pocket!.read(this.chunkKey(chunkId));
    if (!data)
      throw new Error(
        `Chunk ${chunkId} not found in bubble ${this.pocketName}`,
      );
    return Buffer?.isBuffer(data) ? data : Buffer?.from(data);
  }

  async deleteChunk(chunkId: ChunkId): Promise<void> {
    await this.ensureOpen();
    await this.pocket!.delete(this.chunkKey(chunkId));
  }

  async hasChunk(chunkId: ChunkId): Promise<boolean> {
    await this.ensureOpen();
    return this.pocket!.exists(this.chunkKey(chunkId));
  }
}
