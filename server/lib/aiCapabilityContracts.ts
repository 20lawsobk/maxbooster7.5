export const AI_ANALYTICS_INSIGHTS_PATH = "/api/ai/analytics/insights";

export interface UnsupportedAICapabilityPayload {
  available: false;
  code: "AI_CAPABILITY_UNSUPPORTED";
  capability: "analytics-insights";
  message: string;
  alternativeUrl: "/analytics";
}

export function isUnsupportedAICapabilityRequest(
  method: string,
  path: string,
): boolean {
  return method.toUpperCase() === "POST" && path === AI_ANALYTICS_INSIGHTS_PATH;
}

export function unsupportedAICapabilityPayload(): UnsupportedAICapabilityPayload {
  return {
    available: false,
    code: "AI_CAPABILITY_UNSUPPORTED",
    capability: "analytics-insights",
    message:
      "MaxCore does not currently expose a contract for interpreting arbitrary account analytics data.",
    alternativeUrl: "/analytics",
  };
}
