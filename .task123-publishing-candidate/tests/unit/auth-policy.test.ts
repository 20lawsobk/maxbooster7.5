import { describe, expect, it } from "vitest";
import { isPublicRegistrationEnabled } from "../../client/src/lib/authPolicy";

describe("public registration presentation policy", () => {
  it("fails closed for missing or malformed policy responses", () => {
    expect(isPublicRegistrationEnabled(null)).toBe(false);
    expect(isPublicRegistrationEnabled({ registrationEnabled: true })).toBe(
      false,
    );
    expect(isPublicRegistrationEnabled("enabled")).toBe(false);
    expect(
      isPublicRegistrationEnabled({
        adminOnlyMode: false,
        registrationEnabled: true,
      }),
    ).toBe(true);
  });

  it("keeps registration links closed whenever admin-only mode is active", () => {
    expect(
      isPublicRegistrationEnabled({
        adminOnlyMode: true,
        registrationEnabled: true,
      }),
    ).toBe(false);
  });
});
