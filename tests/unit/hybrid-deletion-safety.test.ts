import { describe, expect, it } from "vitest";
import {
  assertSafeHybridDeletion,
  HybridStorageReferenceConflictError,
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
