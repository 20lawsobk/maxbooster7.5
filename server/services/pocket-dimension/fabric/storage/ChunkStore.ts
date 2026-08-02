import type { ChunkId } from "../compression/types.js";

export interface ChunkStore {
  putChunk(chunkId: ChunkId, data: Buffer): Promise<void>;
  getChunk(chunkId: ChunkId): Promise<Buffer>;
  deleteChunk(chunkId: ChunkId): Promise<void>;
  hasChunk(chunkId: ChunkId): Promise<boolean>;
}
