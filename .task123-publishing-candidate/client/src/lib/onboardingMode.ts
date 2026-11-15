export type OnboardingUserLevel = "beginner" | "intermediate" | "advanced";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getOnboardingData(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function getOnboardingUserLevel(value: unknown): OnboardingUserLevel {
  const data = getOnboardingData(value);
  const level = data.experienceLevel ?? data.userLevel;
  return level === "intermediate" || level === "advanced" ? level : "beginner";
}

export function prefersSimplifiedDashboard(value: unknown): boolean {
  const data = getOnboardingData(value);
  if (typeof data.preferSimplifiedView === "boolean") {
    return data.preferSimplifiedView;
  }
  return getOnboardingUserLevel(data) === "beginner";
}

export function buildFullModeUpgradePayload(value: unknown) {
  const existing = getOnboardingData(value);
  return {
    hasCompletedOnboarding: true,
    onboardingData: {
      ...existing,
      experienceLevel: "intermediate" as const,
      userLevel: "intermediate" as const,
      preferSimplifiedView: false,
    },
  };
}

export function parseOnboardingUpdateResponse(payload: unknown): { success: true } {
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error("The onboarding update did not complete successfully.");
  }
  return { success: true };
}
