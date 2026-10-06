import { describe, expect, it } from "vitest";
import {
  getToolostRedirectUri,
} from "../../server/services/toolostRuntimeConfig";
import { getToolostApiEnvironment } from "../../server/services/toolostEnvironment";

describe("Too Lost runtime configuration", () => {
  it("selects the callback by provider environment, not Node deployment mode", () => {
    expect(
      getToolostRedirectUri({
        TOOLOST_ENVIRONMENT: "sandbox",
        TOOLOST_SANDBOX_REDIRECT_URL:
          "https://dev.example/api/distribution/toolost/callback",
        TOOLOST_REDIRECT_URI: undefined,
      }),
    ).toBe("https://dev.example/api/distribution/toolost/callback");
  });

  it("fails clearly when the selected provider environment has no callback", () => {
    expect(() =>
      getToolostRedirectUri({
        TOOLOST_ENVIRONMENT: "sandbox",
        TOOLOST_SANDBOX_REDIRECT_URL: undefined,
        TOOLOST_REDIRECT_URI: "https://production.example/callback",
      }),
    ).toThrow("TOOLOST_SANDBOX_REDIRECT_URL");
  });

  it("rejects a sandbox callback that does not reach the registered Too Lost callback route", () => {
    expect(() =>
      getToolostRedirectUri({
        TOOLOST_ENVIRONMENT: "sandbox",
        TOOLOST_SANDBOX_REDIRECT_URL: "https://dev.example/",
      }),
    ).toThrow("/api/distribution/toolost/callback");
  });

  it("preserves fixed callback query parameters while validating the route", () => {
    expect(
      getToolostRedirectUri({
        TOOLOST_ENVIRONMENT: "sandbox",
        TOOLOST_SANDBOX_REDIRECT_URL:
          "https://dev.example/api/distribution/toolost/callback?env=sandbox",
      }),
    ).toBe(
      "https://dev.example/api/distribution/toolost/callback?env=sandbox",
    );
  });

  it("keeps the API environment independent of Node's development mode", () => {
    expect(getToolostApiEnvironment({ TOOLOST_ENVIRONMENT: "sandbox" })).toBe(
      "sandbox",
    );
    expect(getToolostApiEnvironment({ TOOLOST_ENVIRONMENT: "production" })).toBe(
      "production",
    );
    expect(getToolostApiEnvironment({})).toBe("production");
    expect(() =>
      getToolostApiEnvironment({ TOOLOST_ENVIRONMENT: "sandbxo" }),
    ).toThrow("TOOLOST_ENVIRONMENT");
  });
});