import { describe, expect, it } from "vitest";
import { getToolostRedirectUri } from "../../server/services/toolostRuntimeConfig";

describe("Too Lost runtime configuration", () => {
  it("selects the callback by provider environment, not Node deployment mode", () => {
    expect(
      getToolostRedirectUri({
        TOOLOST_ENVIRONMENT: "sandbox",
        TOOLOST_SANDBOX_REDIRECT_URI: "https://shared.example/callback?env=sandbox",
        TOOLOST_REDIRECT_URI: undefined,
      }),
    ).toBe("https://shared.example/callback?env=sandbox");
  });

  it("fails clearly when the selected provider environment has no callback", () => {
    expect(() =>
      getToolostRedirectUri({
        TOOLOST_ENVIRONMENT: "sandbox",
        TOOLOST_SANDBOX_REDIRECT_URI: undefined,
        TOOLOST_REDIRECT_URI: "https://production.example/callback",
      }),
    ).toThrow("TOOLOST_SANDBOX_REDIRECT_URI");
  });
});