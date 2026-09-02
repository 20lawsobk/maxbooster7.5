import type { ChunkStore } from "./ChunkStore.js";
import type { ChunkId } from "../types.js";

const CHUNK_PREFIX = "fabric-chunks/";

export class ReplitChunkStore implements ChunkStore {
  private client: Record<string, (...args: unknown[]) => unknown> | null = null;

  /**
   * Optional per-node namespace so each fabric node's shards live under a
   * distinct key prefix in the shared bucket. This keeps replicated copies of
   * the same chunk physically separate (one object per node), preserving the
   * fabric's cross-node redundancy model on top of Object Storage.
   */
  constructor(private readonly namespace?: string) {}

  private async getClient(): Promise<
    Record<string, (...args: unknown[]) => unknown>
  > {
    if (this.client) return this.client;

    let sidecarAvailable = false;
    try {
      const probe = await fetch(
        "http://127.0.0.1:1106/object-storage/default-bucket",
        {
          signal: AbortSignal.timeout(600),
        },
      );
      sidecarAvailable = probe.ok || probe.status < 500;
    } catch {
      sidecarAvailable = false;
    }

    if (!sidecarAvailable) {
      throw new Error("Replit Object Storage sidecar not reachable");
    }

    // @ts-ignore — optional runtime dependency
    const { Client } = await import("@replit/object-storage");
    const bucketId =
      process.env["REPLIT_BUCKET_ID"] ||
      process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"];
    if (!bucketId) {
      throw new Error(
        "No Object Storage bucket configured. Set DEFAULT_OBJECT_STORAGE_BUCKET_ID.",
      );
    }
    this.client = new Client({ bucketId }) as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    return this.client;
  }

  private key(chunkId: ChunkId): string {
    const ns = this.namespace ? `${this.namespace}/` : "";
    return `${CHUNK_PREFIX}${ns}${chunkId.slice(0, 2)}/${chunkId}`;
  }

  async putChunk(chunkId: ChunkId, data: Buffer): Promise<void> {
    const client = await this.getClient();
    const result = await (
      client["uploadFromBytes"] as (
        key: string,
        data: Buffer,
      ) => Promise<{ ok: boolean; error?: string }>
    )(this.key(chunkId), data);
    if (!result.ok)
      throw new Error(`ReplitChunkStore.putChunk failed: ${result.error}`);
  }

  async getChunk(chunkId: ChunkId): Promise<Buffer> {
    const client = await this.getClient();
    // @replit/object-storage's downloadAsBytes resolves to Result<[Buffer]> —
    // value is a single-element array, NOT a bare Uint8Array. Unwrapping element
    // [0] is essential: Buffer.from(value) on the array coerces the inner Buffer
    // to NaN→0 and silently yields a 1-byte chunk, corrupting every read.
    const result = await (
      client["downloadAsBytes"] as (
        key: string,
      ) => Promise<{ ok: boolean; value?: [Uint8Array]; error?: string }>
    )(this.key(chunkId));
    if (!result.ok)
      throw new Error(`ReplitChunkStore.getChunk failed: ${result.error}`);
    const [bytes] = result.value as [Uint8Array];
    return Buffer.from(bytes);
  }

  async deleteChunk(chunkId: ChunkId): Promise<void> {
    const client = await this.getClient();
    await (client["delete"] as (key: string) => Promise<void>)(
      this.key(chunkId),
    );
  }

  async hasChunk(chunkId: ChunkId): Promise<boolean> {
    try {
      const client = await this.getClient();
      const result = await (
        client["downloadAsBytes"] as (key: string) => Promise<{ ok: boolean }>
      )(this.key(chunkId));
      return result.ok;
    } catch {
      return false;
    }
  }
}
