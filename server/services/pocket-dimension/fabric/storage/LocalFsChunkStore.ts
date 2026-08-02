import type { ChunkStore } from "./ChunkStore.js";
import type { ChunkId } from "../compression/types.js";
import fs from "fs/promises";
import path from "path";

export class LocalFsChunkStore implements ChunkStore {
  constructor(private baseDir: string) {}

  private resolvePath(chunkId: ChunkId): string {
    const prefix = chunkId?.slice(0, 2);
    return path?.join(this.baseDir, prefix, chunkId);
  }

  async putChunk(chunkId: ChunkId, data: Buffer): Promise<void> {
    const p = this.resolvePath(chunkId);
    await fs?.mkdir(path?.dirname(p), { recursive: true });
    await fs?.writeFile(p, data);
  }

  async getChunk(chunkId: ChunkId): Promise<Buffer> {
    return fs?.readFile(this.resolvePath(chunkId));
  }

  async deleteChunk(chunkId: ChunkId): Promise<void> {
    await fs?.rm(this.resolvePath(chunkId), { force: true });
  }

  async hasChunk(chunkId: ChunkId): Promise<boolean> {
    try {
      await fs?.access(this.resolvePath(chunkId));
      return true;
    } catch {
      return false;
    }
  }
}
