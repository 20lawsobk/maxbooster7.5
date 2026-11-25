import { describe, expect, it } from "vitest";
import { onboardingUpdateSchema } from "../../server/lib/onboardingUpdate";

describe("onboarding update contract", () => {
  it("rejects wrong completion, step and preference types", () => {
    for (const body of [
      { completed: "false" }, { hasCompletedOnboarding: 1 },
      { step: -1 }, { step: 1.5 }, { onboardingData: [] }, { onboardingData: null },
    ]) expect(onboardingUpdateSchema.safeParse(body).success).toBe(false);
  });
  it("accepts legacy and current preference patches without dropping unrelated preference keys", () => {
    expect(onboardingUpdateSchema.parse({ step: 2, completed: false })).toEqual({ step: 2, completed: false });
    const data = { preferSimplifiedView: false, genres: ["jazz"], goals: { release: true } };
    expect(onboardingUpdateSchema.parse({ onboardingData: data }).onboardingData).toEqual(data);
  });
});
