import type { ChunkStore } from './ChunkStore.js';
import type { ChunkId } from '../types.js';
import { logger } from '../../../logger.js';

const CHUNK_PREFIX = 'fabric-chunks/';

export class ReplitChunkStore implements ChunkStore {
  private client: Record<string, unknown> | null = null;

  private async getClient(): Promise<unknown> {
    if (this.client) return this.client;
    let sidecarAvailable = false;
    try {
      const probe = await fetch('http://127.0.0.1:1106/object-storage/default-bucket', {
        signal: AbortSignal.timeout(600),
      });
      sidecarAvailable = probe.ok || probe.status < 500;
    } catch {
      sidecarAvailable = false;
    }
    if (!sidecarAvailable) {
      throw new Error('Replit Object Storage sidecar not reachable (Cloud Run / Autoscale)');
    }
    try {
      const { Client } = await import('@replit/object-storage');
      const bucketId = process.env.REPLIT_BUCKET_ID || process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      this.client = new Client(bucketId ? { bucketId } : undefined);
      return this.client;
    } catch (err) {
      throw new Error(`Replit Object Storage not available: ${err}`);
    }
  }

  private key(chunkId: ChunkId): string {
    return `${CHUNK_PREFIX}${chunkId.slice(0, 2)}/${chunkId}`;
  }

  async putChunk(chunkId: ChunkId, data: Buffer): Promise<void> {
    const client = await this.getClient();
    const { ok, error } = await client.uploadFromBytes(this.key(chunkId), data);
    if (!ok) throw new Error(`ReplitChunkStore.putChunk failed: ${error}`);
  }

  async getChunk(chunkId: ChunkId): Promise<Buffer> {
    const client = await this.getClient();
    const { ok, value, error } = await client.downloadAsBytes(this.key(chunkId));
    if (!ok) throw new Error(`ReplitChunkStore.getChunk failed: ${error}`);
    return Buffer.from(value as Uint8Array);
  }

  async deleteChunk(chunkId: ChunkId): Promise<void> {
    const client = await this.getClient();
    const { ok, error } = await client.delete(this.key(chunkId));
    if (!ok) logger.warn(`ReplitChunkStore.deleteChunk: ${error}`);
  }

  async hasChunk(chunkId: ChunkId): Promise<boolean> {
    try {
      const client = await this.getClient();
      const { ok } = await client.downloadAsBytes(this.key(chunkId));
      return ok;
    } catch {
      return false;
    }
  }
}
