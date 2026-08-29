import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";
import { compressionRouter } from "../../server/pocket-dimension/fabric/compression/CompressionProfileRouter.js";
import { isContainer } from "../../server/pocket-dimension/fabric/compression/ContainerFormat.js";

// Regression coverage for the fabric compression pipeline, which previously
// had no live callers and no tests: PocketStorageService.putObject computed
// compression metadata and then discarded it, and getObject never called
// any decompression — every stored object was unreadable in principle, it
// just happened that nothing ever tried to read one back. These tests
// exercise the router directly (encode -> container -> decode) for every
// profile, independent of the storage/placement layer, so the round trip
// is proven correct without needing real cluster nodes.

function textBuffer(n: number, filler = "the quick brown fox jumps over the lazy dog. "): Buffer {
  const reps = Math.ceil(n / filler.length);
  return Buffer.from(filler.repeat(reps).slice(0, n), "utf8");
}

describe("Compression fabric round trip", () => {
  it("lossless-max-dedup: plain object survives compress -> container -> decompress", async () => {
    const original = textBuffer(64 * 1024);
    const result = await compressionRouter.process(
      original,
      "notes.bin",
      "application/octet-stream",
      {},
    );
    expect(result.profile).toBe("lossless-max-dedup");
    expect(result.isDelta).toBe(false);

    const container = compressionRouter.encodeForStorage(result);
    expect(isContainer(container)).toBe(true);

    const restored = await compressionRouter.decodeFromStorage(container, async () => {
      throw new Error("should not need a delta base for a non-delta object");
    });
    expect(Buffer.compare(restored, original)).toBe(0);
  }, 20000);

  it("lossless-max-dedup: incompressible random data round-trips via the 'store' path", async () => {
    const original = randomBytes(32 * 1024);
    const result = await compressionRouter.process(
      original,
      "blob.bin",
      "application/octet-stream",
      {},
    );
    // Random bytes should be recognized as not worth compressing.
    expect(result.codec).toBe("store");

    const container = compressionRouter.encodeForStorage(result);
    const restored = await compressionRouter.decodeFromStorage(container, async () => {
      throw new Error("no delta expected");
    });
    expect(Buffer.compare(restored, original)).toBe(0);
  });

  it("lossless-max-dedup: a real prior version produces a delta that reconstructs exactly", async () => {
    // application/octet-stream + .bin deliberately falls outside both
    // MEDIA_CLASSES and SEMANTIC_CLASSES so chooseProfile's default case
    // (lossless-max-dedup, the only delta-capable profile) applies — a
    // text/json/log/metrics content type would route to semantic-archive
    // instead, which never deltas.
    const base = textBuffer(200 * 1024, "version one of the document, unchanged filler text. ");
    // Small edit: prepend and append a bit, keep the middle identical so a
    // rolling-window delta has real copy runs to find.
    const changed = Buffer.concat([
      Buffer.from("PREPENDED HEADER — v2 draft.\n", "utf8"),
      base,
      Buffer.from("\nAPPENDED FOOTER — reviewed.", "utf8"),
    ]);

    const baseResult = await compressionRouter.process(base, "doc.bin", "application/octet-stream", {});
    expect(baseResult.profile).toBe("lossless-max-dedup");
    const baseContainer = compressionRouter.encodeForStorage(baseResult);

    const versionOf = "fake-object-id-for-test";
    const deltaResult = await compressionRouter.process(
      changed,
      "doc.bin",
      "application/octet-stream",
      { versionOf },
      base, // priorVersionData, as PocketStorageService would resolve it
    );

    expect(deltaResult.profile).toBe("lossless-max-dedup");
    expect(deltaResult.isDelta).toBe(true);
    expect(deltaResult.deltaBaseId).toBe(versionOf);

    const deltaContainer = compressionRouter.encodeForStorage(deltaResult);

    const resolveDeltaBase = async (id: string) => {
      expect(id).toBe(versionOf);
      return compressionRouter.decodeFromStorage(baseContainer, async () => {
        throw new Error("base object is not itself a delta");
      });
    };

    const restored = await compressionRouter.decodeFromStorage(deltaContainer, resolveDeltaBase);
    expect(Buffer.compare(restored, changed)).toBe(0);
  }, 20000);

  it("semantic-archive (json): real bytes survive, not just the lossy summary", async () => {
    const payload = {
      users: Array.from({ length: 50 }, (_, i) => ({
        id: i,
        name: `user-${i}`,
        email: `user${i}@example.com`,
      })),
    };
    const original = Buffer.from(JSON.stringify(payload), "utf8");

    const result = await compressionRouter.process(original, "export.json", "application/json", {});
    expect(result.profile).toBe("semantic-archive");
    // The bug being fixed: compressedBytes used to be the size of a lossy
    // summary, unrelated to the real payload. The real data must always be
    // recoverable exactly.
    expect(result.metadata.archiveSummary).toBeDefined();

    const container = compressionRouter.encodeForStorage(result);
    const restored = await compressionRouter.decodeFromStorage(container, async () => {
      throw new Error("no delta expected");
    });
    expect(Buffer.compare(restored, original)).toBe(0);
    expect(JSON.parse(restored.toString("utf8"))).toEqual(payload);
  }, 20000);

  it("semantic-archive (log): real log lines survive exactly", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 500; i++) {
      const level = i % 37 === 0 ? "ERROR" : i % 11 === 0 ? "WARN" : "INFO";
      lines.push(`2026-08-29T12:00:${String(i % 60).padStart(2, "0")} ${level} request ${i} handled`);
    }
    const original = Buffer.from(lines.join("\n"), "utf8");

    const result = await compressionRouter.process(original, "app.log", "text/plain", {
      profile: "semantic-archive",
    });

    const container = compressionRouter.encodeForStorage(result);
    const restored = await compressionRouter.decodeFromStorage(container, async () => {
      throw new Error("no delta expected");
    });
    expect(Buffer.compare(restored, original)).toBe(0);
  }, 20000);

  it("semantic-archive (metrics): real metrics lines survive exactly", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 300; i++) {
      lines.push(`http_request_duration_seconds ${(Math.random() * 2).toFixed(4)}`);
    }
    const original = Buffer.from(lines.join("\n"), "utf8");

    const result = await compressionRouter.process(original, "metrics.prom", "text/plain", {
      profile: "semantic-archive",
    });

    const container = compressionRouter.encodeForStorage(result);
    const restored = await compressionRouter.decodeFromStorage(container, async () => {
      throw new Error("no delta expected");
    });
    expect(Buffer.compare(restored, original)).toBe(0);
  }, 20000);

  it("large object above the block-parallel threshold still round-trips exactly", async () => {
    const original = textBuffer(17 * 1024 * 1024); // > BLOCK_PARALLEL_THRESHOLD (16MB)
    const result = await compressionRouter.process(
      original,
      "bigdoc.txt",
      "text/plain",
      { profile: "lossless-max-dedup" },
    );

    const container = compressionRouter.encodeForStorage(result);
    const restored = await compressionRouter.decodeFromStorage(container, async () => {
      throw new Error("no delta expected");
    });
    expect(Buffer.compare(restored, original)).toBe(0);
  }, 60000);
});
