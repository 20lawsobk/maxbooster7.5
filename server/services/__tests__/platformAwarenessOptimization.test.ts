import { describe, expect, it } from "vitest";
import {
  getPlatformOptimization,
  normalizeSocialAwarenessPlatform,
  platformAwarenessOptimization,
  SOCIAL_AWARENESS_PLATFORMS,
} from "../platformAwarenessOptimization.js";

describe("social awareness platform optimization", () => {
  it("keeps the suite allowlist closed to exactly eight platforms", () => {
    expect([...SOCIAL_AWARENESS_PLATFORMS]).toEqual([
      "facebook",
      "instagram",
      "youtube",
      "tiktok",
      "threads",
      "google_business",
      "x",
      "linkedin",
    ]);
  });

  it("normalizes suite labels without creating a Twitter platform", () => {
    expect(normalizeSocialAwarenessPlatform("Google Business")).toBe("google_business");
    expect(normalizeSocialAwarenessPlatform("googlebusiness")).toBe("google_business");
    expect(normalizeSocialAwarenessPlatform("X")).toBe("x");
    expect(normalizeSocialAwarenessPlatform("twitter")).toBe("x");
  });

  it("rejects unsupported platforms instead of applying a generic profile", () => {
    expect(() => normalizeSocialAwarenessPlatform("spotify")).toThrow(
      "Unsupported social awareness platform",
    );
  });

  it("serializes optimization signals into the model conditioning string", () => {
    const profile = getPlatformOptimization("TikTok");
    const conditioning = platformAwarenessOptimization("TikTok");
    expect(profile.platform).toBe("tiktok");
    expect(conditioning).toContain("[PLATFORM_OPTIMIZATION platform=tiktok");
    expect(conditioning).toContain("watch_completion");
    expect(conditioning).toContain("first_seconds");
  });
});