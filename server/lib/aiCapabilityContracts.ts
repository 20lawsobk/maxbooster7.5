/** Dedicated MaxCore account-analytics contract; availability is probed remotely. */
export const AI_ANALYTICS_INSIGHTS_PATH = "/api/ai/analytics/insights";

export interface AccountAnalyticsCapability {
  available: true;
  capability: "account-analytics";
  version: 1;
  trainedModelRequired: false;
  privateDataRetention: "none";
  methods: string[];
  timeframes: string[];
  [key: string]: unknown;
}

export function isAccountAnalyticsCapability(value: unknown): value is AccountAnalyticsCapability {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>, methods = data.methods, timeframes = data.timeframes;
  return data.available === true && data.version === 1 && data.capability === "account-analytics" &&
    data.trainedModelRequired === false && data.privateDataRetention === "none" && Array.isArray(methods) &&
    ["observed_summary", "ordinary_least_squares"].every(method => methods.includes(method)) &&
    Array.isArray(timeframes) && ["7d", "30d", "90d"].every(timeframe => timeframes.includes(timeframe));
}
