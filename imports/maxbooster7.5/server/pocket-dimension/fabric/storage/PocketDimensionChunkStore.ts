import { createHash } from "node:crypto";
import { getPdimClient } from "../../../lib/pdimClient.js";
import type { ChunkStore } from "./ChunkStore.js";
import type { ChunkId } from "../types.js";
import { logger } from "../../../logger.js";
import type { PocketDimension } from "../../index.js";

const CHUNK_KEY_PREFIX = "chunks";
const WRITE_IMMUTABLE = `
if redis.call('EXISTS',KEYS[2])==1 then return -1 end
local current=redis.call('GET',KEYS[1])
if current and current~=ARGV[1] then return -2 end
if not current then redis.call('SET',KEYS[1],ARGV[1]) end
return 1`;
const DELETE_IMMUTABLE = `
redis.call('SET',KEYS[2],'1')
redis.call('DEL',KEYS[1])
return 1`;

export class PocketDimensionChunkStore implements ChunkStore {
  private pocket: PocketDimension | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly pocketName: string, private readonly owner = () => getPdimClient()) {}

  private immutableKey(id: string): string | null {
    if (!/^[a-f0-9]{64}\.[a-f0-9-]+$/.test(id)) return null;
    return `pdim:fabric-replica:v2:${createHash("sha256").update(this.pocketName).digest("hex")}:${id}`;
  }

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
    const key = this.immutableKey(chunkId);
    if (key) {
      const result = Number(await this.owner().eval(WRITE_IMMUTABLE, 2, key, `${key}:deleted`, data.toString("base64")));
      if (result === -1) throw Object.assign(new Error("Immutable fabric replica was permanently deleted"), { code: "FABRIC_REPLICA_RETIRED" });
      if (result === -2) throw Object.assign(new Error("Immutable fabric replica replacement refused"), { code: "FABRIC_REPLICA_CONFLICT" });
      if (result !== 1) throw new Error("Immutable fabric publication was not confirmed");
      return;
    }
    await this.ensureOpen();
    await this.pocket!.refresh();
    await this.pocket!.write(this.chunkKey(chunkId), data);
  }

  async getChunk(chunkId: ChunkId): Promise<Buffer> {
    const key = this.immutableKey(chunkId);
    if (key) {
      // Integrity checks must reach the authority, never PDIM's stale-on-error
      // GET cache. EVAL also preserves ordering with publication/deletion.
      const value = await this.owner().eval("return redis.call('GET',KEYS[1])", 1, key) as string | null;
      if (value === null) throw new Error(`Immutable fabric replica not found: ${chunkId}`);
      return Buffer.from(value, "base64");
    }
    await this.ensureOpen();
    await this.pocket!.refresh();
    const data = await this.pocket!.read(this.chunkKey(chunkId));
    if (!data)
      throw new Error(
        `Chunk ${chunkId} not found in bubble ${this.pocketName}`,
      );
    return Buffer?.isBuffer(data) ? data : Buffer?.from(data);
  }

  async deleteChunk(chunkId: ChunkId): Promise<void> {
    const key = this.immutableKey(chunkId);
    if (key) {
      // Keep this small tombstone permanently. Removing/expiring it permits a
      // delayed write from a fenced-out owner to resurrect reclaimed bytes.
      // It is control metadata, not a live content replica/capacity charge.
      const result = Number(await this.owner().eval(DELETE_IMMUTABLE, 2, key, `${key}:deleted`));
      if (result !== 1) throw new Error("Immutable fabric deletion was not confirmed");
      return;
    }
    await this.ensureOpen();
    await this.pocket!.refresh();
    await this.pocket!.delete(this.chunkKey(chunkId));
  }

  async hasChunk(chunkId: ChunkId): Promise<boolean> {
    const key = this.immutableKey(chunkId);
    if (key) return await this.owner().eval("return redis.call('GET',KEYS[1])", 1, key) !== null;
    await this.ensureOpen();
    await this.pocket!.refresh();
    return this.pocket!.exists(this.chunkKey(chunkId));
  }
}
