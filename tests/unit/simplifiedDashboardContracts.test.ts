import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFullModeUpgradePayload,
  getOnboardingUserLevel,
  parseOnboardingUpdateResponse,
  prefersSimplifiedDashboard,
} from "../../client/src/lib/onboardingMode";
import { normalizeOnboardingUpdateBody } from "../../server/middleware/requestValidation";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("simplified dashboard onboarding mode", () => {
  it("prefers experienceLevel and falls back safely", () => {
    expect(
      getOnboardingUserLevel({
        experienceLevel: "advanced",
        userLevel: "beginner",
      }),
    ).toBe("advanced");
    expect(getOnboardingUserLevel({ userLevel: "intermediate" })).toBe(
      "intermediate",
    );
    expect(getOnboardingUserLevel({ userLevel: "unexpected" })).toBe(
      "beginner",
    );
  });

  it("preserves existing onboarding data while switching both level fields", () => {
    expect(
      buildFullModeUpgradePayload({
        persona: "artist",
        goals: ["distribute", "social"],
        experienceLevel: "beginner",
        userLevel: "beginner",
        preferSimplifiedView: true,
      }),
    ).toEqual({
      hasCompletedOnboarding: true,
      onboardingData: {
        persona: "artist",
        goals: ["distribute", "social"],
        experienceLevel: "intermediate",
        userLevel: "intermediate",
        preferSimplifiedView: false,
      },
    });
  });

  it("honors an explicit simplified preference before level fallback", () => {
    expect(
      prefersSimplifiedDashboard({
        experienceLevel: "beginner",
        preferSimplifiedView: false,
      }),
    ).toBe(false);
    expect(prefersSimplifiedDashboard({ experienceLevel: "beginner" })).toBe(
      true,
    );
  });

  it("rejects unsuccessful onboarding update responses", () => {
    expect(parseOnboardingUpdateResponse({ success: true })).toEqual({
      success: true,
    });
    expect(() => parseOnboardingUpdateResponse({ success: false })).toThrow(
      /did not complete successfully/i,
    );
  });
});

describe("onboarding update server boundary", () => {
  it("accepts the canonical full-mode payload", () => {
    expect(
      normalizeOnboardingUpdateBody({
        hasCompletedOnboarding: true,
        onboardingData: {
          persona: "artist",
          goals: ["social"],
          experienceLevel: "intermediate",
          userLevel: "intermediate",
          preferSimplifiedView: false,
        },
      }),
    ).toEqual({
      ok: true,
      value: {
        hasCompletedOnboarding: true,
        onboardingData: {
          persona: "artist",
          goals: ["social"],
          experienceLevel: "intermediate",
          userLevel: "intermediate",
          preferSimplifiedView: false,
        },
      },
    });
  });

  it.each([
    null,
    [],
    { step: -1 },
    { step: 1.5 },
    { completed: "yes" },
    { completed: true, hasCompletedOnboarding: false },
    { unexpected: true },
    { onboardingData: { experienceLevel: "expert" } },
    { onboardingData: { preferSimplifiedView: "yes" } },
    { onboardingData: { goals: [123] } },
  ])("rejects malformed onboarding input %o", (payload) => {
    expect(normalizeOnboardingUpdateBody(payload).ok).toBe(false);
  });

  it("rejects oversized onboarding blobs", () => {
    const result = normalizeOnboardingUpdateBody({
      onboardingData: { notes: "x".repeat(20 * 1024) },
    });
    expect(result).toEqual({ ok: false, message: "Onboarding data is too large" });
  });
});

describe("simplified dashboard route contract", () => {
  it("requires subscription access and protects its data endpoint server-side", () => {
    const page = read("client/src/pages/SimplifiedDashboard.tsx");
    const component = read(
      "client/src/components/onboarding/SimplifiedDashboard.tsx",
    );
    const serverGuard = read("server/auth.ts");

    expect(page).not.toContain("@ts-nocheck");
    expect(page).toContain("useRequireSubscription");
    expect(page).toContain("hasDashboardPaidAccess");
    expect(page).toContain("buildFullModeUpgradePayload");
    expect(page).toContain('queryKey: ["/api/auth/me"]');

    expect(serverGuard).toContain('"/api/dashboard/comprehensive"');
    expect(serverGuard).toContain('code: "PAID_SUBSCRIPTION_REQUIRED"');

    expect(component).toContain("disabled={upgrading}");
    expect(component).toContain("formatDashboardTimestamp");
  });
});
