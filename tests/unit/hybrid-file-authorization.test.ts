import { describe, expect, it } from "vitest";
import { authorizedDirectStorageRead, authorizedHybridReadPrincipal } from "../../server/services/hybridFileAuthorization.js";

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


describe("direct PDIM fallback authorization", () => {
  const privateFile = { userId: "owner", isPublic: false };

  it("permits the tracked owner without hybrid metadata", () => {
    expect(authorizedDirectStorageRead("owner", "owner", null, null)).toBe(true);
  });

  it("denies a second account when the tracking row belongs to another user", () => {
    expect(authorizedDirectStorageRead("other", "owner", null, null)).toBe(false);
  });

  it("denies an untracked key with no hybrid metadata or entitlement", () => {
    expect(authorizedDirectStorageRead("other", null, null, null)).toBe(false);
  });

  it("allows an explicitly public hybrid object", () => {
    expect(authorizedDirectStorageRead("other", null, { ...privateFile, isPublic: true }, null)).toBe(true);
  });

  it("allows the hybrid metadata owner without a tracking row", () => {
    expect(authorizedDirectStorageRead("owner", null, privateFile, null)).toBe(true);
  });

  it("denies a different user for private hybrid metadata", () => {
    expect(authorizedDirectStorageRead("other", null, privateFile, null)).toBe(false);
  });

  it("preserves separately verified purchased-stem access", () => {
    expect(authorizedDirectStorageRead("buyer", "owner", privateFile, true)).toBe(true);
    expect(authorizedDirectStorageRead("buyer", "owner", privateFile, false)).toBe(false);
  });

  it("rejects conflicting tracking ownership rather than trusting metadata alone", () => {
    expect(authorizedDirectStorageRead("other", "owner", { userId: "other" }, null)).toBe(false);
  });

  it("denies an absent authenticated requester even for public/entitled assets", () => {
    expect(authorizedDirectStorageRead("", null, { ...privateFile, isPublic: true }, true)).toBe(false);
  });
});
