import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({
  data: undefined as Record<string, unknown> | undefined,
  isLoading: true,
  isError: false,
  error: undefined as Error | undefined,
  refetch: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => query }));

import { RevenueAnalytics } from "../../client/src/pages/analytics/RevenueAnalytics";
import { AudienceInsights } from "../../client/src/pages/analytics/AudienceInsights";

beforeEach(() => {
  query.data = undefined;
  query.isLoading = true;
  query.isError = false;
  query.error = undefined;
  query.refetch.mockReset();
});

for (const [name, Component] of [["revenue", RevenueAnalytics], ["audience", AudienceInsights]] as const) {
  describe(`${name} analytics tab`, () => {
    it("renders the real loading component before query data exists", () => {
      expect(() => renderToStaticMarkup(React.createElement(Component))).not.toThrow();
    });

    it("renders a retryable failure instead of a false empty dataset", () => {
      query.isLoading = false;
      query.isError = true;
      query.error = new Error("Fixture analytics service unavailable");
      const html = renderToStaticMarkup(React.createElement(Component));
      expect(html).toContain('role="alert"');
      expect(html).toContain(`Could not load ${name} analytics`);
      expect(html).toContain("Fixture analytics service unavailable");
      expect(html).toContain("Retry");
    });

    it("renders successful empty analytics without accessing missing optional sections", () => {
      query.isLoading = false;
      query.data = {};
      const html = renderToStaticMarkup(React.createElement(Component));
      expect(html).not.toContain('role="alert"');
      expect(html).toContain(name === "revenue" ? "Revenue" : "Audience");
    });
  });
}

it("distinguishes unavailable listener counts from measured zero and positive counts", () => {
  query.isLoading = false;
  query.data = { overview: { totalStreams: 100 }, audience: { totalListeners: 50, newListeners: null, returningListeners: null } };
  let html = renderToStaticMarkup(React.createElement(AudienceInsights));
  expect(html).toMatch(/New Listeners<\/p><p[^>]*>Unavailable<\/p>/);
  expect(html).toMatch(/Returning Listeners<\/p><p[^>]*>Unavailable<\/p>/);
  expect(html).toMatch(/Countries<\/p><p[^>]*>Unavailable<\/p>/);
  query.data = { overview: { totalStreams: 100 }, audience: { totalListeners: 50, newListeners: 0, returningListeners: 7 } };
  html = renderToStaticMarkup(React.createElement(AudienceInsights));
  expect(html).toMatch(/New Listeners<\/p><p[^>]*>0<\/p>/);
  expect(html).toMatch(/Returning Listeners<\/p><p[^>]*>7<\/p>/);
});

it("keeps unsupported payout amounts unavailable while preserving measured zero", () => {
  query.isLoading = false;
  const revenue = { revenueByPlatform: [{ platform: "Spotify", revenue: 100, streams: 4000 }] };
  query.data = { revenue };
  let html = renderToStaticMarkup(React.createElement(RevenueAnalytics));
  expect(html).toMatch(/Pending<\/p><p[^>]*>Unavailable<\/p>/);
  expect(html).toMatch(/Paid Out<\/p><p[^>]*>Unavailable<\/p>/);
  expect(html).toContain("4,000 streams");
  expect(html).toContain("$0.0250/stream");
  query.data = { revenue: { ...revenue, pendingEarnings: 0, paidEarnings: 12.5 } };
  html = renderToStaticMarkup(React.createElement(RevenueAnalytics));
  expect(html).toMatch(/Pending<\/p><p[^>]*>\$0.00<\/p>/);
  expect(html).toMatch(/Paid Out<\/p><p[^>]*>\$12.50<\/p>/);
});
