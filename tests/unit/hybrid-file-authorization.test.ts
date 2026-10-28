import { describe, expect, it } from "vitest";
import { authorizedHybridReadPrincipal, canReadStoredFile, canFallbackToDirectStorage } from "../../server/services/hybridFileAuthorization.js";

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

describe("direct and hybrid file byte-fetch authorization", () => {
  const unscoped = "opaque-asset/private.wav";
  const cases: Array<[string, string, string, string | null, string | null, boolean, boolean | null, boolean]> = [
    ["reject absent requester even for public metadata", "", unscoped, "owner", "owner", true, null, false],
    ["reject absent requester even with paid-stem flag", "", unscoped, "owner", "owner", false, true, false],
    ["reject unknown untracked unscoped direct key", "other", unscoped, null, null, false, null, false],
    ["allow legacy owner-namespaced untracked key", "owner", "users/owner/audio/a.wav", null, null, false, null, true],
    ["reject legacy foreign namespace", "other", "users/owner/audio/a.wav", null, null, false, null, false],
    ["allow DB-tracked owner with unscoped key", "owner", unscoped, "owner", null, false, null, true],
    ["reject DB-tracked foreign owner despite caller key prefix", "other", "users/other/audio/a.wav", "owner", null, false, null, false],
    ["allow untracked hybrid owner with unscoped key", "owner", unscoped, null, "owner", false, null, true],
    ["reject untracked hybrid foreign owner", "other", unscoped, null, "owner", false, null, false],
    ["reject conflicting durable foreign owner even if hybrid claims caller", "other", unscoped, "owner", "other", false, null, false],
    ["allow explicitly public hybrid metadata without durable row", "other", unscoped, null, "owner", true, null, true],
    ["allow verified paid marketplace stem", "buyer", unscoped, "owner", "owner", false, true, true],
    ["reject unverified marketplace stem", "buyer", unscoped, "owner", "owner", false, false, false],
    ["reject empty object key", "owner", "", "owner", "owner", true, true, false],
  ];
  it.each(cases)("%s", (_label, requester, key, tracked, hybrid, publicMeta, stem, expected) => {
    expect(canReadStoredFile(requester, key, tracked, hybrid, publicMeta, stem)).toBe(expected);
  });
});

describe("durable public visibility overrides stale hybrid metadata", () => {
  const key = "opaque-asset/private.wav";
  const cases: Array<[string, string, string | null, string | null, boolean, boolean | null, boolean | null, boolean]> = [
    ["deny stale hybrid public flag for durable private row", "outsider", "owner", "owner", true, null, false, false],
    ["deny stale hybrid public flag for durable unknown visibility", "outsider", "owner", "owner", true, null, null, false],
    ["allow explicitly public file when durable and hybrid metadata agree", "outsider", "owner", "owner", true, null, true, true],
    ["owner may read their durable private file", "owner", "owner", "owner", true, null, false, true],
    ["completed-order stem entitlement remains valid", "buyer", "owner", "owner", true, true, false, true],
    ["hybrid-only public metadata remains readable", "outsider", null, "owner", true, null, null, true],
    ["durable private owner wins over conflicting hybrid owner", "outsider", "owner", "outsider", true, null, false, false],
    ["hybrid-only private metadata remains protected", "outsider", null, "owner", false, null, null, false],
  ];
  it.each(cases)("%s", (_label, requester, tracked, hybrid, hybridPublic, stem, trackedPublic, expected) => {
    expect(canReadStoredFile(requester, key, tracked, hybrid, hybridPublic, stem, trackedPublic)).toBe(expected);
  });
});

// This decision is checked after the independent ownership gate and before
// direct PDIM byte access; it must not depend on the reason a hybrid read failed.
describe("hybrid storage read failure cannot bypass metadata authorization", () => {
  it("denies direct fallback for a hybrid-indexed private object", () => {
    expect(canFallbackToDirectStorage(true)).toBe(false);
  });

  it("denies direct fallback for a hybrid-indexed public object whose visibility changed", () => {
    expect(canFallbackToDirectStorage(true)).toBe(false);
  });

  it("preserves the legacy direct fallback only when no hybrid metadata exists", () => {
    expect(canFallbackToDirectStorage(false)).toBe(true);
  });
});
