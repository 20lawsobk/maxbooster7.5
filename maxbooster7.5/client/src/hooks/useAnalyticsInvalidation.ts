import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

const ANALYTICS_PREFIXES = [
  "/api/analytics/",
  "/api/analytics-alerts/",
  "/api/dashboard/",
  "/api/artist-progress/",
  "/api/revenue-forecast/",
  "/api/admin/analytics",
];

const DASHBOARD_KEYS = [
  "/api/dashboard/comprehensive",
  "/api/analytics/dashboard",
  "/api/ai/insights",
  "/api/dashboard/next-action",
  "/api/artist-progress/dashboard",
];

const REVENUE_KEYS = ["/api/marketplace/sales-analytics", "/api/royalties"];

const DISTRIBUTION_KEYS = [
  "/api/distribution/analytics/growth",
  "/api/distribution/hyperfollow/analytics",
  "/api/distribution/streaming-trends",
];

const ADVERTISING_KEYS = [
  "/api/advertising/audience-segments",
  "/api/advertising/lookalike-audiences",
  "/api/advertising/roas/audience-segments",
  "/api/advertising/dashboard/attribution",
  "/api/advertising/dashboard/paths",
];

export function useAnalyticsInvalidation() {
  const queryClient = useQueryClient();

  const invalidateByPrefixes = useCallback(
    (prefixes: string[]) => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          if (typeof key !== "string") return false;
          return prefixes.some((prefix) => key.startsWith(prefix));
        },
      });
    },
    [queryClient],
  );

  const invalidateKeys = useCallback(
    (keys: string[]) => {
      keys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [key], exact: false });
      });
    },
    [queryClient],
  );

  const invalidateDashboard = useCallback(() => {
    invalidateKeys(DASHBOARD_KEYS);
    invalidateByPrefixes(["/api/analytics/dashboard", "/api/dashboard/"]);
  }, [invalidateKeys, invalidateByPrefixes]);

  const invalidateOnProjectChange = useCallback(() => {
    invalidateByPrefixes([...ANALYTICS_PREFIXES]);
  }, [invalidateByPrefixes]);

  const invalidateOnDistributionChange = useCallback(() => {
    invalidateByPrefixes([...ANALYTICS_PREFIXES]);
    invalidateKeys(DISTRIBUTION_KEYS);
  }, [invalidateByPrefixes, invalidateKeys]);

  const invalidateOnSocialChange = useCallback(() => {
    invalidateByPrefixes([...ANALYTICS_PREFIXES]);
  }, [invalidateByPrefixes]);

  const invalidateOnMarketplaceChange = useCallback(() => {
    invalidateByPrefixes([...ANALYTICS_PREFIXES]);
    invalidateKeys(REVENUE_KEYS);
  }, [invalidateByPrefixes, invalidateKeys]);

  const invalidateOnRevenueChange = useCallback(() => {
    invalidateByPrefixes([...ANALYTICS_PREFIXES]);
    invalidateKeys(REVENUE_KEYS);
  }, [invalidateByPrefixes, invalidateKeys]);

  const invalidateOnCampaignChange = useCallback(() => {
    invalidateByPrefixes([...ANALYTICS_PREFIXES]);
    invalidateKeys(ADVERTISING_KEYS);
  }, [invalidateByPrefixes, invalidateKeys]);

  const invalidateAll = useCallback(() => {
    invalidateByPrefixes([...ANALYTICS_PREFIXES]);
    invalidateKeys([
      ...REVENUE_KEYS,
      ...DISTRIBUTION_KEYS,
      ...ADVERTISING_KEYS,
    ]);
  }, [invalidateByPrefixes, invalidateKeys]);

  return {
    invalidateDashboard,
    invalidateOnProjectChange,
    invalidateOnDistributionChange,
    invalidateOnSocialChange,
    invalidateOnMarketplaceChange,
    invalidateOnRevenueChange,
    invalidateOnCampaignChange,
    invalidateAll,
  };
}
