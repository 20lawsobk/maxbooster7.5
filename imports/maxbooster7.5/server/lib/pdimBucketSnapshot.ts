import type { PdimBucketJournal } from "./pdimBucketJournal.js";
import { createHash } from "node:crypto";

type Snapshot = {
  format: "pdim-bucket-snapshot-v1";
  redisSequence: number;
  capsuleSequence: number;
  count: number;
  chunks: string[];
};
type Objects = Pick<PdimBucketJournal<unknown>, "putImmutable" | "readImmutable">;
const validSequence = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;

/** Chunk a previously captured, immutable entry view. Never create a whole-store
 * JSON string or a disk staging copy. The caller must capture mutable containers
 * at the canonical owner's checkpoint boundary before calling this function. */
export async function writeBucketSnapshot(
  objects: Objects,
  entries: Iterable<readonly [string, unknown]>,
  redisSequence: number,
  capsuleSequence: number,
  chunkBytes = 4 * 1024 * 1024,
): Promise<string> {
  if (!validSequence(redisSequence) || !validSequence(capsuleSequence) ||
      !Number.isSafeInteger(chunkBytes) || chunkBytes < 1) throw new Error("Invalid snapshot limits");
  const chunks: string[] = [];
  let lines: string[] = [];
  let bytes = 2;
  let count = 0;
  const seen = new Set<string>();
  const flush = async () => {
    if (!lines.length) return;
    chunks.push(await objects.putImmutable(Buffer.from(`[${lines.join(",")}]`)));
    lines = [];
    bytes = 2;
  };
  for (const [key, value] of entries) {
    if (typeof key !== "string" || seen.has(key) || value === undefined) {
      throw new Error("Invalid or duplicate snapshot entry");
    }
    seen.add(key);
    const line = JSON.stringify([key, value]);
    const length = Buffer.byteLength(line);
    if (bytes + length + 1 > chunkBytes) await flush();
    lines.push(line);
    bytes += length + 1;
    count++;
  }
  await flush();
  const manifest: Snapshot = {
    format: "pdim-bucket-snapshot-v1", redisSequence, capsuleSequence, count, chunks,
  };
  return objects.putImmutable(Buffer.from(JSON.stringify(manifest)));
}

export async function readBucketSnapshot<E>(
  objects: Objects,
  manifestBytes: Buffer,
  validate: (key: string, entry: unknown) => E,
  onProgress?: (completed: number, total: number) => void,
): Promise<{ entries: Map<string, E>; redisSequence: number; capsuleSequence: number }> {
  const manifest = JSON.parse(manifestBytes.toString()) as Snapshot;
  if (manifest.format !== "pdim-bucket-snapshot-v1" ||
      !validSequence(manifest.redisSequence) || !validSequence(manifest.capsuleSequence) ||
      !validSequence(manifest.count) || !Array.isArray(manifest.chunks) ||
      manifest.chunks.some(id => typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))) {
    throw new Error("Invalid bucket PDIM snapshot manifest");
  }
  const entries = new Map<string, E>();
  onProgress?.(0, manifest.chunks.length);
  // Bound concurrent downloads; do not serialize hundreds of network round trips
  // or retain buffers for the entire snapshot during startup.
  for (let offset = 0; offset < manifest.chunks.length; offset += 4) {
    const buffers = await Promise.all(manifest.chunks.slice(offset, offset + 4)
      .map(id => objects.readImmutable(id)));
    for (const buffer of buffers) {
    const rows: unknown = JSON.parse(buffer.toString());
    if (!Array.isArray(rows)) throw new Error("Invalid bucket PDIM snapshot chunk");
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 2 ||
          typeof row[0] !== "string" || entries.has(row[0])) {
        throw new Error("Invalid or duplicate bucket PDIM snapshot entry");
      }
      entries.set(row[0], validate(row[0], row[1]));
    }
    }
    const completed = Math.min(offset + 4, manifest.chunks.length);
    if (completed % 32 === 0 || completed === manifest.chunks.length) {
      onProgress?.(completed, manifest.chunks.length);
    }
  }
  if (entries.size !== manifest.count) throw new Error("Bucket PDIM snapshot count mismatch");
  return { entries, redisSequence: manifest.redisSequence, capsuleSequence: manifest.capsuleSequence };
}

/** Full readback verification with at most one shard resident alongside the
 * source map. Do not allocate another whole-store Map during migration. */
export async function verifyBucketSnapshot(
  objects: Objects, id: string, expected: ReadonlyMap<string, unknown>,
  redisSequence: number, capsuleSequence: number,
): Promise<void> {
  const manifest = JSON.parse((await objects.readImmutable(id)).toString()) as Snapshot;
  if (manifest.format !== "pdim-bucket-snapshot-v1" || manifest.count !== expected.size ||
      manifest.redisSequence !== redisSequence || manifest.capsuleSequence !== capsuleSequence ||
      !Array.isArray(manifest.chunks)) throw new Error("Imported snapshot contract mismatch");
  const seen = new Set<string>();
  const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  for (const chunk of manifest.chunks) {
    const rows: unknown = JSON.parse((await objects.readImmutable(chunk)).toString());
    if (!Array.isArray(rows)) throw new Error("Invalid imported snapshot chunk");
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" ||
          seen.has(row[0]) || !expected.has(row[0]) ||
          digest(row[1]) !== digest(expected.get(row[0]))) {
        throw new Error("Imported snapshot entry mismatch");
      }
      seen.add(row[0]);
    }
  }
  if (seen.size !== expected.size) throw new Error("Imported snapshot missing entries");
}
