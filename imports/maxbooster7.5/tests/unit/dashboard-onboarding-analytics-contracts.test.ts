import { describe, expect, it } from "vitest";
import {
  interactionMetricValueOrUnavailable,
  metricValueOrUnavailable,
  normalizeDashboardAIInsights,
} from "../../client/src/components/dashboard/dashboardDataContracts";

describe("dashboard response contracts", () => {
  it("unwraps the AI insights route envelope and preserves the actual insights shape", () => {
    const insight = {
      type: "opportunity",
      title: "Audience growing",
      description: "Recent audience activity increased.",
      metric: "audience",
      impact: "medium",
      actionable: true,
    };

    expect(
      normalizeDashboardAIInsights({
        success: true,
        data: { insights: [insight] },
      }),
    ).toEqual({ insights: [insight] });
  });

  it("rejects the unrelated score-and-predictions shape instead of fabricating values", () => {
    expect(() =>
      normalizeDashboardAIInsights({
        success: true,
        data: {
          performanceScore: 0,
          predictions: { nextMonthStreams: 0 },
        },
      }),
    ).toThrow("did not match its API contract");
  });

  it("distinguishes a measured zero from unavailable analytics", () => {
    expect(metricValueOrUnavailable(0)).toBe(0);
    expect(metricValueOrUnavailable(null)).toBe("Unavailable");
    expect(metricValueOrUnavailable(0, false)).toBe("Unavailable");
  });

  it("hides legacy zero placeholders for unsupported interaction rates", () => {
    expect(interactionMetricValueOrUnavailable(0)).toBe("Unavailable");
    expect(interactionMetricValueOrUnavailable(null)).toBe("Unavailable");
    expect(interactionMetricValueOrUnavailable(12.5)).toBe(12.5);
  });
});