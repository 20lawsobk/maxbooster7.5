import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ failedKey: "", retries: new Map<string, ReturnType<typeof vi.fn>>(), retryClick: undefined as undefined | (() => void) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = String(queryKey[0]);
    if (!state.retries.has(key)) state.retries.set(key, vi.fn().mockResolvedValue({}));
    return { data: undefined, isLoading: false, error: key === state.failedKey ? new Error("Data provider failed") : null, refetch: state.retries.get(key) };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/useRequireAuth", () => ({ useRequireSubscription: () => ({ user: { id: "test-user" }, isLoading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useAnalyticsInvalidation", () => ({ useAnalyticsInvalidation: () => ({ invalidateOnRevenueChange: vi.fn() }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@/components/layout/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/merch/MerchCheckout", () => ({ default: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => {
  state.retryClick = onClick;
  return React.createElement("button", { onClick }, children);
} }));
vi.mock("@/components/royalties", () => ({
  SplitVisualizationPieChart: () => null, PayoutHistoryTimeline: () => null, TaxFormWizard: () => null,
  StatementDateRangePicker: () => null, DisputeTracker: () => null,
  useRoyaltyOutcome: () => ({ showOutcome: vi.fn() }),
}));

import Royalties from "../../client/src/pages/Royalties";
import Shows from "../../client/src/pages/Shows";
import SyncLicensing from "../../client/src/pages/SyncLicensing";
import MerchStore from "../../client/src/pages/MerchStore";

describe("page read failures remain distinct from empty data", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    state.retries.clear(); state.retryClick = undefined;
    vi.stubGlobal("window", { location: { search: "" } });
  });
  it.each([
    [Royalties, "/api/royalties", "royalties"],
    [Royalties, "/api/royalties/payment-methods", "royalties"],
    [Shows, "/api/shows", "shows"],
    [Shows, "/api/shows/stats", "shows"],
    [SyncLicensing, "/api/sync-licensing", "sync licensing"],
    [SyncLicensing, "/api/sync-licensing/stats", "sync licensing"],
    [MerchStore, "/api/merch", "merchandise"],
    [MerchStore, "/api/merch/stats", "merchandise"],
  ] as const)("renders an unavailable state and retries failed data (case %#)", async (Component, failedKey, label) => {
    state.failedKey = failedKey;
    const html = renderToStaticMarkup(React.createElement(Component));
    expect(html).toContain('role="alert"');
    expect(html).toContain(`Unable to load ${label}`);
    expect(html).toContain("Retry");
    expect(html).not.toContain("$0");
    expect(html).not.toContain("No upcoming shows");
    expect(state.retryClick).toBeTypeOf("function");
    state.retryClick!();
    await Promise.resolve();
    expect(state.retries.get(failedKey)).toHaveBeenCalledOnce();
  });
});
