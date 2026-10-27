import { describe, expect, it } from "vitest";
import { authorizedHybridReadPrincipal } from "../../server/services/hybridFileAuthorization.js";

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
