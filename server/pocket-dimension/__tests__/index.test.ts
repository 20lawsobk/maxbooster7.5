import { describe, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "crypto";
import { gzipSync } from "zlib";
import { PocketDimension, type PocketChunk, type PocketEntry, type PocketMetadata } from "../index.js";

// PocketDimension persists metadata/index/chunks through getPdimClient(),
// an HTTP-backed Redis-compatible adapter. These are unit tests (per
// vitest.config.ts, "no running server required"), so we replace it with an
// in-memory Map that behaves like the subset of the interface PocketDimension
// actually calls (get/set as raw string values, matching real PDIM semantics).
const { mockPdimStore } = vi.hoisted(() => ({
  mockPdimStore: new Map<string, string>(),
}));

vi.mock("../../lib/pdimClient.js", () => ({
  getPdimClient: () => ({
    get: async (key: string) =>
      mockPdimStore.has(key) ? (mockPdimStore.get(key) as string) : null,
    set: async (key: string, value: string) => {
      mockPdimStore.set(key, value);
      return "OK";
    },
  }),
}));

function findChunkBytes(id: string): Buffer {
  const chunkKey = [...mockPdimStore.keys()].find((k) =>
    k.startsWith(`pdim:chunk:${id}:`),
  );
  expect(chunkKey, `expected a persisted chunk for pocket ${id}`).toBeDefined();
  return Buffer.from(mockPdimStore.get(chunkKey!) as string, "base64");
}

describe("PocketDimension compression engine (codec-mesh integration)", () => {
  it("round-trips a plain write/read using the new codec-mesh container format", async () => {
    const id = `test-plain-${randomUUID()}`;
    const dim = new PocketDimension({ id, name: id });
    const original = Buffer.from("hello pocket dimension! ".repeat(500), "utf8");

    await dim.write("greeting.txt", original);
    const readBack = await dim.read("greeting.txt");

    expect(readBack.equals(original)).toBe(true);

    // The persisted chunk must carry the new PDCF container envelope (its
    // own leading magic bytes), not legacy gzip (magic 0x1f 0x8b) — this is
    // exactly the marker decompress() uses to route old vs. new chunks.
    const stored = findChunkBytes(id);
    expect(stored.subarray(0, 4).toString("ascii")).toBe("PDCF");
    expect(stored[0]).not.toBe(0x1f);

    // Sanity: the real codec actually shrank this highly repetitive input.
    expect(stored.length).toBeLessThan(original.length);
  });

  it("round-trips arbitrary binary data (not just text) through the new codec", async () => {
    const id = `test-binary-${randomUUID()}`;
    const dim = new PocketDimension({ id, name: id });
    const original = Buffer.from(
      Array.from({ length: 20000 }, (_, i) => (i * 37) % 256),
    );

    await dim.write("blob.bin", original);
    const readBack = await dim.read("blob.bin");

    expect(readBack.equals(original)).toBe(true);
    expect(findChunkBytes(id).subarray(0, 4).toString("ascii")).toBe("PDCF");
  });

  it("round-trips data through an encrypted pocket dimension with the new codec", async () => {
    const id = `test-enc-${randomUUID()}`;
    const dim = new PocketDimension({
      id,
      name: id,
      encryptionKey: "unit-test-encryption-passphrase",
    });
    const original = Buffer.from(
      JSON.stringify({
        hello: "world",
        n: 42,
        items: Array.from({ length: 400 }, (_, i) => i),
      }),
    );

    await dim.write("secret.json", original);
    const readBack = await dim.read("secret.json");

    expect(readBack.equals(original)).toBe(true);

    // Encryption must still be wrapping the compressed bytes: the bytes on
    // the wire should NOT be a readable PDCF container (they're ciphertext),
    // proving encrypt() still runs on top of the new compress() output.
    const stored = findChunkBytes(id);
    expect(stored.subarray(0, 4).toString("ascii")).not.toBe("PDCF");

    // A second dimension instance opening the same id with the right key
    // must also be able to decrypt+decompress it (keyfile round trip).
    const reopened = new PocketDimension({
      id,
      name: id,
      encryptionKey: "unit-test-encryption-passphrase",
    });
    const readAgain = await reopened.read("secret.json");
    expect(readAgain.equals(original)).toBe(true);
  });

  it("reads a pre-existing legacy gzip chunk with no container envelope (backward compatibility)", async () => {
    const id = `test-legacy-${randomUUID()}`;
    const plaintext = Buffer.from(
      "legacy pocket dimension chunk written before the codec-mesh integration. ".repeat(
        100,
      ),
    );
    const legacyCompressed = gzipSync(plaintext, { level: 9 });
    const hash = createHash("sha256").update(plaintext).digest("hex");

    // Seed the mock PDIM store to look exactly like a chunk this class wrote
    // before this change: raw gzip bytes, no PDCF envelope, no per-chunk
    // format marker anywhere in metadata.
    const chunkRecord: PocketChunk = {
      id: hash,
      size: plaintext.length,
      compressedSize: legacyCompressed.length,
      compressionRatio: plaintext.length / (legacyCompressed.length || 1),
      createdAt: new Date(),
      accessCount: 1,
      lastAccessed: new Date(),
      encrypted: false,
      depth: 0,
    };
    const entryRecord: PocketEntry = {
      path: "legacy-file.txt",
      type: "file",
      size: plaintext.length,
      compressedSize: legacyCompressed.length,
      chunks: [hash],
      createdAt: new Date(),
      modifiedAt: new Date(),
      version: 1,
      metadata: {},
    };
    const metadataRecord: PocketMetadata = {
      id,
      name: id,
      createdAt: new Date(),
      updatedAt: new Date(),
      totalSize: plaintext.length,
      compressedSize: legacyCompressed.length,
      chunkCount: 1,
      maxDepth: 0,
      encrypted: false,
      version: 1,
    };

    mockPdimStore.set(
      `pdim:meta:${id}:metadata`,
      JSON.stringify(metadataRecord),
    );
    mockPdimStore.set(
      `pdim:meta:${id}:index`,
      JSON.stringify({
        entries: { "legacy-file.txt": entryRecord },
        chunks: { [hash]: chunkRecord },
      }),
    );
    mockPdimStore.set(
      `pdim:chunk:${id}:${hash}`,
      legacyCompressed.toString("base64"),
    );

    // Confirm the fixture really does look like a legacy chunk (sanity check
    // on the test itself, not the production code).
    expect(legacyCompressed[0]).toBe(0x1f);
    expect(legacyCompressed[1]).toBe(0x8b);

    // Fresh instance, as if the process restarted after this change shipped.
    const dim = new PocketDimension({ id, name: id });
    const readBack = await dim.read("legacy-file.txt");

    expect(readBack.equals(plaintext)).toBe(true);
  });

  it("dedupes identical content within one dimension while still round-tripping", async () => {
    const id = `test-dedup-${randomUUID()}`;
    const dim = new PocketDimension({ id, name: id });
    const original = Buffer.from("repeated payload ".repeat(1000));

    await dim.write("a.txt", original);
    await dim.write("b.txt", original);

    expect((await dim.read("a.txt")).equals(original)).toBe(true);
    expect((await dim.read("b.txt")).equals(original)).toBe(true);

    const stats = dim.getStats();
    expect(stats.uniqueChunks).toBe(1);
  });
});
