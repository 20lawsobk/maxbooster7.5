import { createHash } from "node:crypto";
import { codecMesh } from "../pocket-dimension/fabric/compression/CodecMesh.js";
import { decodeContainer, encodeContainer } from "../pocket-dimension/fabric/compression/ContainerFormat.js";

export interface HybridByteAuthority {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  setnx(key: string, value: string): Promise<number>;
  del(...keys: string[]): Promise<unknown>;
}
interface Manifest {
  version: 1;
  bytes: number;
  sha256: string;
  compressedSize: number;
  chunks: Array<{ hash: string; bytes: number }>;
}
const CHUNK_SIZE = 32 * 1024 * 1024;
const MAX_CHUNKS = 128;
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/** Uses existing lossless codec/container support, with immutable per-file
 * manifests rather than PocketDimension's process-cached mutable directory.
 * All chunk keys belong to this file; deletion cannot affect another owner. */
export class HybridImmutableByteStore {
  constructor(private readonly authority: HybridByteAuthority) {}

  private validateKey(key: string): void {
    if (!/^hybrid:v2:[0-9a-f-]{36}$/.test(key)) throw new Error("Invalid immutable hybrid blob key");
  }

  private async manifest(key: string): Promise<Manifest | undefined> {
    this.validateKey(key);
    const raw = await this.authority.get(key);
    if (raw === null) return undefined;
    const manifest = JSON.parse(raw) as Manifest;
    if (manifest.version !== 1 || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 0 ||
        manifest.bytes > MAX_CHUNKS * CHUNK_SIZE || !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
        !Number.isSafeInteger(manifest.compressedSize) || manifest.compressedSize < 0 ||
        !Array.isArray(manifest.chunks) || manifest.chunks.length > MAX_CHUNKS ||
        manifest.chunks.length !== Math.ceil(manifest.bytes / CHUNK_SIZE) ||
        !manifest.chunks.every(chunk => /^[a-f0-9]{64}$/.test(chunk.hash) &&
          Number.isSafeInteger(chunk.bytes) && chunk.bytes > 0 && chunk.bytes <= CHUNK_SIZE)) {
      throw new Error("Corrupt immutable hybrid manifest");
    }
    return manifest;
  }

  async write(key: string, data: Buffer): Promise<{ compressedSize: number }> {
    this.validateKey(key);
    if (data.length > MAX_CHUNKS * CHUNK_SIZE) throw new Error("Hybrid blob exceeds supported chunk count");
    const hash = digest(data), existing = await this.manifest(key);
    if (existing) {
      if (existing.sha256 !== hash || existing.bytes !== data.length) throw new Error("Immutable hybrid blob replacement refused");
      await this.read(key);
      return { compressedSize: existing.compressedSize };
    }
    const chunks: Manifest["chunks"] = [];
    let compressedSize = 0;
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const bytes = data.subarray(offset, Math.min(offset + CHUNK_SIZE, data.length));
      const result = await codecMesh.compress(bytes, { contentClass: "unknown" });
      const encoded = encodeContainer({ profile: "lossless-max-dedup", contentClass: "unknown",
        codec: result.codec, isDelta: false, originalBytes: bytes.length,
        ...(result.dictId ? { dictId: result.dictId } : {}),
        ...(result.blockSizes ? { blockSizes: result.blockSizes } : {}) }, result.compressed);
      const chunkHash = digest(encoded);
      await this.authority.setnx(`${key}:chunk:${chunkHash}`, encoded.toString("base64"));
      chunks.push({ hash: chunkHash, bytes: bytes.length });
      compressedSize += encoded.length;
    }
    // Publication happens last. A failed/ambiguous write leaves the SQL upload
    // intent, never a successful file receipt or speculative deletion of bytes.
    await this.authority.setnx(key, JSON.stringify({ version: 1, bytes: data.length, sha256: hash, compressedSize, chunks }));
    const committed = await this.manifest(key);
    if (!committed || committed.sha256 !== hash || committed.bytes !== data.length) throw new Error("Hybrid blob publication was not confirmed");
    await this.read(key);
    return { compressedSize: committed.compressedSize };
  }

  async read(key: string): Promise<Buffer> {
    const manifest = await this.manifest(key);
    if (!manifest) throw new Error("Hybrid blob not found");
    const decoded: Buffer[] = [];
    for (const chunk of manifest.chunks) {
      const raw = await this.authority.get(`${key}:chunk:${chunk.hash}`);
      if (raw === null) throw new Error("Hybrid blob chunk missing");
      const encoded = Buffer.from(raw, "base64");
      if (digest(encoded) !== chunk.hash) throw new Error("Hybrid blob chunk checksum mismatch");
      const { header, payload } = decodeContainer(encoded);
      if (header.originalBytes !== chunk.bytes || header.isDelta) throw new Error("Hybrid blob chunk header mismatch");
      const bytes = await codecMesh.decompress(header.codec, payload, { dictId: header.dictId, blockSizes: header.blockSizes });
      if (bytes.length !== chunk.bytes) throw new Error("Hybrid blob decoded length mismatch");
      decoded.push(bytes);
    }
    const data = Buffer.concat(decoded);
    if (data.length !== manifest.bytes || digest(data) !== manifest.sha256) throw new Error("Hybrid blob content integrity check failed");
    return data;
  }

  async delete(key: string): Promise<boolean> {
    const manifest = await this.manifest(key);
    if (!manifest) return false;
    for (const chunk of manifest.chunks) await this.authority.del(`${key}:chunk:${chunk.hash}`);
    await this.authority.del(key); // Retain manifest until every deletion ACKs, so retries know all keys.
    return true;
  }
}
