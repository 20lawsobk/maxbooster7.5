import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({ data: undefined, isLoading: false, isError: false, error: undefined as Error | undefined, refetch: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => query,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useRequireAuth", () => ({ useRequireSubscription: () => ({ user: { id: "isolated-user" }, isLoading: false }) }));
vi.mock("@/hooks/useWebSocket", () => ({ useWebSocket: () => ({ isConnected: false, sendMessage: vi.fn() }) }));
vi.mock("@/hooks/useOnboardingProgress", () => ({ useOnboardingProgress: () => ({ trackAnalyticsExplored: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/components/layout/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/ErrorBoundary", () => ({ ErrorBoundary: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../client/src/pages/analytics/StreamingAnalytics", () => ({ StreamingAnalytics: () => null }));
vi.mock("../../client/src/pages/analytics/RevenueAnalytics", () => ({ RevenueAnalytics: () => null }));
vi.mock("../../client/src/pages/analytics/AudienceInsights", () => ({ AudienceInsights: () => null }));
vi.mock("../../client/src/pages/analytics/ExportAnalytics", () => ({ ExportAnalytics: () => null }));
vi.mock("../../client/src/pages/analytics/ARDiscoveryPanel", () => ({ default: () => null }));
vi.mock("../../client/src/pages/analytics/GlobalRankingDashboard", () => ({ default: () => null }));
vi.mock("../../client/src/pages/analytics/HistoricalAnalyticsView", () => ({ default: () => null }));
vi.mock("../../client/src/pages/analytics/NaturalLanguageQuery", () => ({ default: () => null }));
vi.mock("../../client/src/pages/analytics/PlaylistJourneysVisualization", () => ({ default: () => null }));
vi.mock("../../client/src/pages/analytics/PlaylistTracking", () => ({ PlaylistTracking: () => null }));

import Analytics from "../../client/src/pages/Analytics";

describe("Analytics absent query data", () => {
  beforeEach(() => { query.isLoading = false; query.isError = false; query.error = undefined; });

  it("renders unavailable and empty states before the query has data", () => {
    const html = renderToStaticMarkup(React.createElement(Analytics));
    expect(html).toContain("Analytics Dashboard");
    expect(html).toContain("No follower data yet");
    expect(html).toContain("Unavailable");
  });

  it("renders a retryable query error without reading missing analytics", () => {
    query.isError = true;
    query.error = new Error("Analytics request failed");
    const html = renderToStaticMarkup(React.createElement(Analytics));
    expect(html).toContain("Could not load analytics");
    expect(html).toContain("Analytics request failed");
    expect(html).toContain("Retry");
  });
});
