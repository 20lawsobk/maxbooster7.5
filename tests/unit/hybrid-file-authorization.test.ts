import { describe, expect, it } from "vitest";
import { authorizedDirectFallback, authorizedHybridReadPrincipal, hasConflictingStorageOwnership, trackedHybridReadDenial } from "../../server/services/hybridFileAuthorization.js";

describe("authenticated hybrid-file read principal", () => {
  const privateFile = { userId: "owner", isPublic: false };

  it("uses the requesting user's identity for their own private file", () => {
    expect(authorizedHybridReadPrincipal("owner", privateFile, null)).toBe("owner");
  });

  it("rejects another user rather than reading as the file owner", () => {
    expect(authorizedHybridReadPrincipal("other", privateFile, null)).toBeNull();
    expect(authorizedHybridReadPrincipal("other", privateFile, false)).toBeNull();
  });

  it("uses the caller identity for explicitly public hybrid metadata", () => {
    expect(authorizedHybridReadPrincipal("other", { userId: "owner", isPublic: true }, null))
      .toBe("other");
  });

  it("permits a separately verified marketplace stem entitlement", () => {
    expect(authorizedHybridReadPrincipal("buyer", privateFile, true)).toBe("owner");
  });

  it("never permits an absent authenticated principal", () => {
    expect(authorizedHybridReadPrincipal("", privateFile, true)).toBeNull();
  });
});

describe("direct-storage fallback must fail closed", () => {
  const privateOwner = { userId: "owner", isPublic: false };

  it("denies untracked keys with no hybrid metadata, even to signed-in users", () => {
    expect(authorizedDirectFallback("owner", null, null, null)).toBe(false);
    expect(authorizedDirectFallback("other", null, null, false)).toBe(false);
  });

  it("requires the SQL-tracked owner when hybrid metadata is missing", () => {
    expect(authorizedDirectFallback("owner", "owner", null, null)).toBe(true);
    expect(authorizedDirectFallback("other", "owner", null, null)).toBe(false);
  });

  it("honors private hybrid metadata but rejects cross-account reads", () => {
    expect(authorizedDirectFallback("owner", null, privateOwner, null)).toBe(true);
    expect(authorizedDirectFallback("other", null, privateOwner, null)).toBe(false);
  });

  it("rejects contradictory private SQL and hybrid ownership", () => {
    expect(authorizedDirectFallback("owner", "other", privateOwner, null)).toBe(false);
    expect(authorizedDirectFallback("owner", "owner", { userId: "other" }, null)).toBe(false);
  });

  it("allows explicitly public hybrid metadata", () => {
    expect(authorizedDirectFallback("other", null, { userId: "owner", isPublic: true }, null)).toBe(true);
  });

  it("allows only a separately verified paid-stem entitlement", () => {
    expect(authorizedDirectFallback("buyer", "owner", privateOwner, true)).toBe(true);
    expect(authorizedDirectFallback("buyer", "owner", privateOwner, false)).toBe(false);
  });

  it("rejects unauthenticated fallback even with public or paid metadata", () => {
    expect(authorizedDirectFallback("", "owner", { userId: "owner", isPublic: true }, true)).toBe(false);
  });

  it("denies contradictory SQL and hybrid owners even for public files or paid stems", () => {
    const contradictory = { userId: "hybrid-owner", isPublic: false };
    expect(hasConflictingStorageOwnership("sql-owner", contradictory)).toBe(true);
    expect(hasConflictingStorageOwnership("sql-owner", { userId: "sql-owner" })).toBe(false);
    expect(hasConflictingStorageOwnership(null, contradictory)).toBe(false);
    expect(authorizedDirectFallback("buyer", "sql-owner", contradictory, true)).toBe(false);
    expect(authorizedDirectFallback("buyer", "sql-owner", { ...contradictory, isPublic: true }, null)).toBe(false);
    expect(authorizedDirectFallback("buyer", "sql-owner", { userId: "sql-owner" }, true)).toBe(true);
  });
});


describe("alternate hybrid-file route SQL tombstone guard", () => {
  const metadata = { userId: "owner", isPublic: false };

  it("denies retained private bytes after SQL soft delete", () => {
    expect(trackedHybridReadDenial({ userId: "owner", deletedAt: new Date("2026-10-26") }, metadata)).toBe(404);
  });

  it("denies retained public bytes after SQL soft delete", () => {
    expect(trackedHybridReadDenial({ userId: "owner", deletedAt: new Date("2026-10-26") }, { ...metadata, isPublic: true })).toBe(404);
  });

  it("denies SQL/hybrid owner conflicts even for public metadata", () => {
    expect(trackedHybridReadDenial({ userId: "sql-owner", deletedAt: null }, { userId: "hybrid-owner", isPublic: true })).toBe(403);
  });

  it("preserves consistent active owner access for downstream hybrid authorization", () => {
    expect(trackedHybridReadDenial({ userId: "owner", deletedAt: null }, metadata)).toBeNull();
  });

  it("leaves untracked metadata to the hybrid service's caller-based authorization", () => {
    expect(trackedHybridReadDenial(null, metadata)).toBeNull();
  });
});
