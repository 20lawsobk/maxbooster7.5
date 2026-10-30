import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatDashboardTimestamp,
  hasDashboardPaidAccess,
  normalizeDashboardAIInsights,
  normalizeDashboardCountdowns,
  normalizeDashboardOptimization,
  normalizeDashboardSocialPosts,
  readDashboardJson,
} from "../../client/src/components/dashboard/dashboardDataContracts";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Dashboard response contracts", () => {
  it("reads the canonical countdown envelope and drops malformed countdowns", () => {
    expect(
      normalizeDashboardCountdowns({
        success: true,
        data: [
          {
            id: "countdown-1",
            title: "Release",
            releaseDate: "2026-12-01T00:00:00.000Z",
          },
          {
            id: "bad-date",
            releaseDate: "not-a-date",
          },
          {
            releaseDate: "2026-12-01T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual([
      {
        id: "countdown-1",
        title: "Release",
        releaseDate: "2026-12-01T00:00:00.000Z",
      },
    ]);
  });

  it("rejects the obsolete countdown envelope that previously hid real releases", () => {
    expect(() => normalizeDashboardCountdowns({ countdowns: [] })).toThrow(
      /release countdown response/i,
    );
  });

  it("validates AI insight transport and item shapes", () => {
    expect(
      normalizeDashboardAIInsights({
        success: true,
        data: {
          insights: [
            {
              type: "opportunity",
              title: "Release momentum",
              description: "Measured activity is increasing.",
            },
          ],
        },
      }),
    ).toEqual({
      insights: [
        {
          type: "opportunity",
          title: "Release momentum",
          description: "Measured activity is increasing.",
        },
      ],
    });

    expect(() =>
      normalizeDashboardAIInsights({
        success: true,
        data: { insights: [{ title: "Missing fields" }] },
      }),
    ).toThrow(/invalid insight/i);
  });

  it("requires social-post arrays and valid persisted optimizer drafts", () => {
    expect(
      normalizeDashboardSocialPosts([
        { id: "post-1", status: "draft", content: "hello" },
        { status: "draft" },
      ]),
    ).toEqual([{ id: "post-1", status: "draft", content: "hello" }]);

    expect(() => normalizeDashboardSocialPosts({ data: [] })).toThrow(
      /social drafts response/i,
    );

    expect(
      normalizeDashboardOptimization({
        success: true,
        updatedExisting: true,
        draft: {
          id: "draft-1",
          content: "Improved copy",
          platform: "instagram",
        },
      }),
    ).toEqual({
      updatedExisting: true,
      draft: {
        id: "draft-1",
        content: "Improved copy",
        platform: "instagram",
      },
    });

    expect(() =>
      normalizeDashboardOptimization({
        success: true,
        draft: { id: "draft-1", content: "", platform: "instagram" },
      }),
    ).toThrow(/invalid persisted draft/i);
  });

  it("bounds stalled response bodies instead of leaving Dashboard requests pending", async () => {
    vi.useFakeTimers();
    try {
      const pending = readDashboardJson(
        { json: () => new Promise<never>(() => {}) },
        25,
      );
      const timedOut = expect(pending).rejects.toThrow(/too long/i);
      await vi.advanceTimersByTimeAsync(25);
      await timedOut;
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders invalid activity timestamps as unavailable", () => {
    expect(formatDashboardTimestamp("not-a-date")).toBe("Time unavailable");
  });
});

describe("Dashboard paid entitlement contract", () => {
  it.each([
    [{ subscriptionStatus: "active", subscriptionTier: "monthly" }, true],
    [{ subscriptionStatus: "trialing", subscriptionTier: "yearly" }, true],
    [{ subscriptionStatus: "active", subscriptionTier: "lifetime" }, true],
    [{ role: "admin" }, true],
    [{ isDemo: true }, true],
    [{ email: "demo@maxbooster.ai" }, true],
    [{ subscriptionStatus: "canceled", subscriptionTier: "monthly" }, false],
    [{ subscriptionStatus: "active", subscriptionTier: "free" }, false],
    [{ subscriptionStatus: "incomplete", subscriptionTier: "monthly" }, false],
    [{ subscriptionStatus: null, subscriptionTier: "monthly" }, false],
  ] as const)("maps %o to paid access = %s", (user, expected) => {
    expect(hasDashboardPaidAccess(user)).toBe(expected);
  });

  it("keeps the client and server paid-only Dashboard AI endpoints aligned", () => {
    const dashboard = read("client/src/pages/Dashboard.tsx");
    const auth = read("server/middleware/auth.ts");
    const apiRoutes = read("server/routes.ts");
    const aiRoutes = read("server/routes/ai.ts");

    expect(dashboard).not.toContain('queryKey: ["/api/analytics/dashboard"]');

    for (const endpoint of [
      "/api/ai/insights",
      "/api/ai/optimize-content",
    ]) {
      expect(dashboard).toContain(endpoint);
      expect(auth).toContain(`"${endpoint}"`);
    }

    const optimizeStart = apiRoutes.indexOf('"/api/ai/optimize-content"');
    const optimizeEnd = apiRoutes.indexOf("\n  app.", optimizeStart + 1);
    const optimizeRoute = apiRoutes.slice(
      optimizeStart,
      optimizeEnd === -1 ? undefined : optimizeEnd,
    );
    expect(optimizeRoute).toContain("requireAuth");
    expect(optimizeRoute).toContain("aiRateLimiter");

    expect(aiRoutes).toContain(
      'router.get("/insights", requireAuth, async',
    );
    expect(auth).toContain('code: "PAID_SUBSCRIPTION_REQUIRED"');
    expect(auth).toContain('upgradeUrl: "/pricing"');
  });
});
