import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/pocket-dimension/index.js", () => ({
  pocketManager: { openPocket: vi.fn() },
}));
vi.mock("../../server/lib/pdimClient.js", () => ({ getPdimClient: vi.fn() }));
vi.mock("../../server/services/hybridImmutableByteStore.js", () => ({
  HybridImmutableByteStore: class {},
}));

import {
  HybridStorageService, parseLegacyHybridIndex,
} from "../../server/services/hybridStorageService.js";
import type { HybridStorageRepository } from "../../server/services/hybridStorageRepository.js";

const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");

function fixture(options: { owner?: string; isPublic?: boolean } = {}) {
  const data = Buffer.from("verified SQL-backed hybrid bytes");
  const entry = {
    key: "alice/private", userId: options.owner ?? "alice",
    isPublic: options.isPublic ?? false, contentHash: sha(data),
    sizeBytes: data.length, compressedSize: data.length,
  };
  const events: string[] = [];
  const repository = {
    importLegacy: vi.fn(async () => { events.push("import"); }),
    get: vi.fn(async () => ({ entry, blobKey: "hybrid:v2:fixture", state: "active" })),
    touch: vi.fn(async () => { events.push("touch"); }),
    beginUpload: vi.fn(async () => {
      events.push("intent");
      return { blobKey: "hybrid:v2:fixture", deduplicated: false, compressedSize: 0 };
    }),
    activate: vi.fn(async () => { events.push("activate"); }),
  };
  const byteStore = {
    read: vi.fn(async () => { events.push("read"); return Buffer.from(data); }),
    write: vi.fn(async () => { events.push("write"); return { compressedSize: data.length }; }),
    delete: vi.fn(async () => true),
  };
  const service = new HybridStorageService({
    repository: repository as unknown as HybridStorageRepository,
    byteStore, openPocket: async () => byteStore, loadLegacy: async () => null,
  });
  return { data, entry, repository, byteStore, service, events };
}

describe("SQL-backed hybrid service authorization and publication", () => {
  it("denies cross-account private reads before accessing immutable bytes", async () => {
    const f = fixture();
    await expect(f.service.read("bob", "alice/private")).rejects.toThrow(/Access denied/);
    expect(f.byteStore.read).not.toHaveBeenCalled();
    expect(f.repository.touch).not.toHaveBeenCalled();
  });

  it("permits owner and explicitly public reads only with matching bytes", async () => {
    const own = fixture();
    expect(await own.service.read("alice", "alice/private")).toEqual(own.data);
    const publicFile = fixture({ isPublic: true });
    expect(await publicFile.service.read("bob", "alice/private")).toEqual(publicFile.data);
  });

  it("rejects corrupt bytes even when the owner is authorized", async () => {
    const f = fixture();
    f.byteStore.read.mockResolvedValueOnce(Buffer.from("wrong"));
    await expect(f.service.read("alice", "alice/private")).rejects.toThrow(/integrity check failed/);
    expect(f.repository.touch).not.toHaveBeenCalled();
  });

  it("records an upload intent before immutable bytes and activates only afterward", async () => {
    const f = fixture();
    const result = await f.service.upload("alice", "file.wav", f.data, "audio/wav");
    expect(result.contentHash).toBe(sha(f.data));
    expect(f.events).toEqual(["import", "intent", "write", "activate"]);
  });

  it("never acknowledges a write when SQL activation fails", async () => {
    const f = fixture();
    f.repository.activate.mockRejectedValueOnce(new Error("SQL unavailable"));
    await expect(f.service.upload("alice", "file.wav", f.data, "audio/wav"))
      .rejects.toThrow(/SQL unavailable/);
    expect(f.events).toContain("write");
    expect(f.byteStore.delete).not.toHaveBeenCalled();
  });

  it("fails closed on SQL metadata initialization failure", async () => {
    const f = fixture();
    f.repository.importLegacy.mockRejectedValueOnce(new Error("SQL unavailable"));
    await expect(f.service.read("alice", "alice/private"))
      .rejects.toThrow(/ownership index/);
    expect(f.byteStore.read).not.toHaveBeenCalled();
  });
});

describe("legacy import metadata isolation", () => {
  const base = {
    originalName: "private.wav", mimeType: "audio/wav",
    sizeBytes: 4, compressedSize: 4, tier: "cold", location: "pocket-dimension",
    contentHash: "a".repeat(64), accessCount: 0,
    lastAccessed: "2026-10-26T00:00:00.000Z",
    createdAt: "2026-10-26T00:00:00.000Z",
    isPublic: false,
  };

  it("preserves physical legacy aliases but redacts another owner's key", () => {
    const source = { ...base, key: "alice/private", userId: "alice", isDeduplicated: false };
    const alias = { ...base, key: "bob/private", userId: "bob", isDeduplicated: true,
      deduplicationRef: "alice/private" };
    const index = { files: { [source.key]: source, [alias.key]: alias },
      contentHashes: { [base.contentHash]: [source.key, alias.key] }, publicHashes: {} };
    const rows = parseLegacyHybridIndex(JSON.stringify(index));
    const bob = rows.find(row => row.entry.userId === "bob")!;
    expect(bob.blobKey).toBe("storage/alice/private");
    expect(bob.entry.deduplicationRef).toBeUndefined();
  });

  it("rejects broken legacy deduplication references", () => {
    const alias = { ...base, key: "bob/private", userId: "bob", isDeduplicated: true,
      deduplicationRef: "missing" };
    const index = { files: { [alias.key]: alias },
      contentHashes: { [base.contentHash]: [alias.key] }, publicHashes: {} };
    expect(() => parseLegacyHybridIndex(JSON.stringify(index)))
      .toThrow(/unresolved hybrid deduplication ownership reference/);
  });
});
