export interface DashboardAIInsight {
  type: string;
  title: string;
  description: string;
  metric?: string;
  impact?: string;
  actionable?: boolean;
}

export interface DashboardAIInsights {
  insights: DashboardAIInsight[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * /api/ai/insights returns { success, data: { insights } }. Keep the
 * transport envelope out of dashboard rendering and reject unrelated shapes
 * instead of silently interpreting them as scores or predictions.
 */
export function normalizeDashboardAIInsights(
  payload: unknown,
): DashboardAIInsights {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    !isRecord(payload.data) ||
    !Array.isArray(payload.data.insights)
  ) {
    throw new Error("The AI insights response did not match its API contract.");
  }

  return { insights: payload.data.insights as DashboardAIInsight[] };
}

/**
 * Preserve measured zeroes, but never coerce missing, null, or invalid values
 * into zero. Callers can also mark a value unavailable when the source has no
 * observations.
 */
export function metricValueOrUnavailable(
  value: unknown,
  available = true,
): number | string {
  if (!available || value === null || value === undefined || value === "") {
    return "Unavailable";
  }

  if (typeof value !== "number" && typeof value !== "string") {
    return "Unavailable";
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : "Unavailable";
}

/**
 * The analytics route historically returned zero for interaction rates it
 * does not measure. Until those fields are backed by reported observations,
 * treat those legacy zero placeholders as unavailable as well.
 */
export function interactionMetricValueOrUnavailable(
  value: unknown,
): number | string {
  const displayValue = metricValueOrUnavailable(value);
  return displayValue === 0 ? "Unavailable" : displayValue;
}