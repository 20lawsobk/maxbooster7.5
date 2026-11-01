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

export interface DashboardCountdownProgress {
  completed: number;
  total: number;
  percentage: number;
}

export interface DashboardCountdownItem {
  id: string | number;
  title?: string;
  releaseDate: string;
  artworkUrl?: string | null;
  status?: string;
  progress?: DashboardCountdownProgress;
  presaveCount?: number;
}

export interface DashboardSocialPost {
  id: string | number;
  status?: string;
  approvalStatus?: string;
  content?: string;
  platform?: string;
}

export interface DashboardOptimizedDraft {
  id: string | number;
  content: string;
  platform: string;
  updatedExisting?: boolean;
}

const DASHBOARD_BODY_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readDashboardJson(
  response: Pick<Response, "json">,
  timeoutMs: number = DASHBOARD_BODY_TIMEOUT_MS,
): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.json(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("The dashboard response took too long to finish loading."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * /api/ai/insights returns { success, data: { insights } }. Keep the
 * transport envelope out of dashboard rendering and reject unrelated shapes.
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

  const insights = payload.data.insights.filter((item): item is Record<string, unknown> =>
    isRecord(item),
  );
  for (const insight of insights) {
    if (
      typeof insight.type !== "string" ||
      typeof insight.title !== "string" ||
      typeof insight.description !== "string"
    ) {
      throw new Error("The AI insights response contained an invalid insight.");
    }
  }

  return { insights: insights as unknown as DashboardAIInsight[] };
}

/** `/api/countdowns` returns `{ success, data }`, not `{ countdowns }`. */
export function normalizeDashboardCountdowns(
  payload: unknown,
): DashboardCountdownItem[] {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.data)) {
    throw new Error("The release countdown response did not match its API contract.");
  }

  return payload.data.filter((item): item is DashboardCountdownItem => {
    if (!isRecord(item)) return false;
    if (typeof item.id !== "string" && typeof item.id !== "number") return false;
    if (typeof item.releaseDate !== "string") return false;
    return Number.isFinite(new Date(item.releaseDate).getTime());
  });
}

export function normalizeDashboardSocialPosts(payload: unknown): DashboardSocialPost[] {
  if (!Array.isArray(payload)) {
    throw new Error("The social drafts response did not match its API contract.");
  }

  return payload.filter((post): post is DashboardSocialPost => {
    if (!isRecord(post)) return false;
    return typeof post.id === "string" || typeof post.id === "number";
  });
}

export function normalizeDashboardOptimization(payload: unknown): {
  draft: DashboardOptimizedDraft;
  updatedExisting: boolean;
} {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.draft)) {
    throw new Error("The optimizer response did not include a persisted draft.");
  }

  const draft = payload.draft;
  if (
    (typeof draft.id !== "string" && typeof draft.id !== "number") ||
    typeof draft.content !== "string" ||
    !draft.content.trim() ||
    typeof draft.platform !== "string" ||
    !draft.platform.trim()
  ) {
    throw new Error("The optimizer response contained an invalid persisted draft.");
  }

  return {
    draft: draft as unknown as DashboardOptimizedDraft,
    updatedExisting: payload.updatedExisting === true,
  };
}

export function hasDashboardPaidAccess(user: {
  role?: string | null;
  email?: string | null;
  subscriptionStatus?: string | null;
  subscriptionTier?: string | null;
  isDemo?: boolean | null;
}): boolean {
  if (user.role === "admin" || user.isDemo || user.email === "demo@maxbooster.ai") {
    return true;
  }

  return (
    (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing") &&
    Boolean(user.subscriptionTier && user.subscriptionTier !== "free")
  );
}

export function formatDashboardTimestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Time unavailable";
}

/** Preserve measured zeroes, but never coerce missing/invalid values into zero. */
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

/** Legacy interaction-rate zero placeholders are not measured observations. */
export function interactionMetricValueOrUnavailable(
  value: unknown,
): number | string {
  const displayValue = metricValueOrUnavailable(value);
  return displayValue === 0 ? "Unavailable" : displayValue;
}
