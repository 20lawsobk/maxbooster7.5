import { describe, expect, it } from "vitest";
import {
  assertSafeHybridDeletion,
  HybridStorageReferenceConflictError,
  requireConfirmedHybridPhysicalDeletion,
} from "../../server/services/hybridDeletionSafety.js";

describe("hybrid deletion must preserve live deduplicated bytes", () => {
  it("allows deleting an unshared physical primary", () => {
    expect(() => assertSafeHybridDeletion("primary", false, ["primary"])).not.toThrow();
  });

  it("refuses deleting a physical primary referenced by another file", () => {
    expect(() => assertSafeHybridDeletion("primary", false, ["primary", "other"]))
      .toThrow(HybridStorageReferenceConflictError);
  });

  it("allows deleting a deduplicated secondary without deleting the primary bytes", () => {
    expect(() => assertSafeHybridDeletion("secondary", true, ["primary", "secondary"]))
      .not.toThrow();
  });

  it("rejects missing or inconsistent hash-index membership", () => {
    expect(() => assertSafeHybridDeletion("primary", false, undefined))
      .toThrow(HybridStorageReferenceConflictError);
    expect(() => assertSafeHybridDeletion("primary", false, ["other"]))
      .toThrow(HybridStorageReferenceConflictError);
  });

  it("rejects duplicated hash-index entries instead of mutating an ambiguous index", () => {
    expect(() => assertSafeHybridDeletion("primary", false, ["primary", "primary"]))
      .toThrow(HybridStorageReferenceConflictError);
    expect(() => assertSafeHybridDeletion("secondary", true, ["primary", "secondary", "primary"]))
      .toThrow(HybridStorageReferenceConflictError);
  });

  it("does not mistake an empty index for permission to delete", () => {
    expect(() => assertSafeHybridDeletion("primary", false, []))
      .toThrow(HybridStorageReferenceConflictError);
  });
});

describe("physical PDIM deletion acknowledgement", () => {
  it("accepts only a confirmed true deletion", async () => {
    let calls = 0;
    await expect(requireConfirmedHybridPhysicalDeletion(async () => {
      calls += 1;
      return true;
    })).resolves.toBeUndefined();
    expect(calls).toBe(1);
  });

  it("rejects a false deletion result instead of returning success", async () => {
    await expect(requireConfirmedHybridPhysicalDeletion(async () => false))
      .rejects.toThrow("physical deletion was not confirmed");
  });

  it("propagates PDIM failures instead of suppressing them", async () => {
    await expect(requireConfirmedHybridPhysicalDeletion(async () => {
      throw new Error("PDIM unavailable");
    })).rejects.toThrow("PDIM unavailable");
  });
});
