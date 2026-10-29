import { describe, expect, it, vi } from "vitest";
import { HybridStorageRepository, type HybridMetadataPool } from "../../server/services/hybridStorageRepository.js";
import type { HybridFileMetadata } from "../../server/services/hybridStorageService.js";

const blob = "hybrid:v2:11111111-1111-4111-8111-111111111111";
const proposed = "hybrid:v2:22222222-2222-4222-8222-222222222222";
function entry(ownerId: string): HybridFileMetadata {
  return {
    key: `${ownerId}/private.wav`,
    userId: ownerId,
    contentHash: "sha256-of-identical-bytes",
    sizeBytes: 4,
    compressedSize: 4,
  } as HybridFileMetadata;
}
function fixture(existingOwner: string, existingKey: string) {
  const inserts: unknown[][] = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT blob_key,metadata FROM hybrid_storage_files")) {
        // The authorization predicate is enforced by SQL, not a post-query
        // filter that can accidentally return another tenant's metadata.
        expect(sql).toContain("AND user_id=$3");
        expect(values).toHaveLength(3);
        return { rows: values[2] === existingOwner
          ? [{ blob_key: blob, metadata: { key: existingKey, compressedSize: 3 } }]
          : [] };
      }
      if (sql.includes("INSERT INTO hybrid_storage_files")) inserts.push(values);
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client), query: vi.fn() } as unknown as HybridMetadataPool;
  return { repository: new HybridStorageRepository(pool), client, inserts };
}

describe("SQL hybrid metadata ownership and publication", () => {
  it("does not disclose a foreign owner's file key or reuse foreign private bytes", async () => {
    const { repository, client, inserts } = fixture("owner-a", "owner-a/secret.wav");
    const result = await repository.beginUpload(entry("owner-b"), proposed);
    expect(result).toEqual({ blobKey: proposed, deduplicated: false, compressedSize: 4 });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("AND user_id=$3"),
      ["sha256-of-identical-bytes", 4, "owner-b"]);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][2]).toBe(proposed);
    expect(inserts[0][4]).not.toContain("owner-a/secret.wav");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("retains same-owner immutable-byte deduplication", async () => {
    const { repository, inserts } = fixture("owner-a", "owner-a/original.wav");
    const result = await repository.beginUpload(entry("owner-a"), proposed);
    expect(result).toEqual({ blobKey: blob, deduplicated: true, compressedSize: 3 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0][2]).toBe(blob);
    expect(JSON.parse(String(inserts[0][4]))).toMatchObject({
      userId: "owner-a", isDeduplicated: true,
      deduplicationRef: "owner-a/original.wav",
    });
  });

  it("rolls back an unauthorized deletion without issuing a mutation", async () => {
    const mutations: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT user_id,blob_key")) return { rows: [{
          user_id: "owner-a", blob_key: blob, content_hash: "hash",
        }] };
        if (/^(DELETE|UPDATE)/.test(sql)) mutations.push(sql);
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) } as unknown as HybridMetadataPool;
    await expect(new HybridStorageRepository(pool).beginDelete("owner-a/private.wav", "owner-b"))
      .rejects.toThrow(/Access denied/);
    expect(mutations).toEqual([]);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
