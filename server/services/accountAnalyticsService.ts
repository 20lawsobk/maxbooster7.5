import { sql, type SQL } from "drizzle-orm";
import { db } from "../db.js";
import { AIUnavailableError } from "../lib/aiSource.js";
import { AppError } from "../lib/AppError.js";
import { isAccountAnalyticsCapability } from "../lib/aiCapabilityContracts.js";
import { maxCoreControlTransport, type MaxCoreControlTransport } from "./maxcoreControlTransport.js";

export type AnalyticsTimeframe = "7d" | "30d" | "90d";
export type AnalyticsMetric = "streams" | "engagement" | "revenue";
type Database = { execute(query: SQL): Promise<unknown> };
type Dependencies = { database: Database; transport: MaxCoreControlTransport; now: () => Date };
const DAY = 86_400_000;
const limits = { "7d": 7, "30d": 30, "90d": 90 } as const;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function rows(result: unknown): Record<string, unknown>[] {
  const values = Array.isArray(result) ? result : isRecord(result) ? result.rows : undefined;
  if (!Array.isArray(values) || !values.every(isRecord)) throw new AIUnavailableError("analytics storage response invalid");
  return values;
}

function checkedValue(value: unknown): number {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > 1e12) {
    throw new AIUnavailableError("analytics observations are outside supported numeric bounds");
  }
  return number;
}

function windowFor(timeframe: unknown, now: Date) {
  if (typeof timeframe !== "string" || !Object.hasOwn(limits, timeframe)) {
    throw new AppError("Valid timeframe is required (7d, 30d, 90d)", 400);
  }
  if (!Number.isFinite(now.getTime())) throw new AIUnavailableError("analytics clock unavailable");
  const days = limits[timeframe as AnalyticsTimeframe];
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - days * DAY);
  return { timeframe: timeframe as AnalyticsTimeframe, start, end,
    dataWindow: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) } };
}

function requireUser(userId: unknown): asserts userId is string {
  if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(userId)) {
    throw new AppError("Authentication required", 401);
  }
}

type Observation = { date: string; value?: number; streams?: number; revenue?: number; listeners?: number };
function observedTotal(points: Observation[], key: "streams" | "revenue" | "listeners") {
  let total = 0, correction = 0;
  for (const point of points) {
    const value = point[key]!, next = total + value;
    correction += Math.abs(total) >= Math.abs(value) ? (total - next) + value : (value - next) + total;
    total = next;
  }
  return total + correction;
}
function validateResponse(value: unknown, dataWindow: { start: string; end: string }, mode: "predict" | "insights", points: Observation[]) {
  const days = (Date.parse(dataWindow.end) - Date.parse(dataWindow.start)) / DAY;
  const span = points.length ? (Date.parse(points.at(-1)!.date) - Date.parse(points[0].date)) / DAY : 0;
  const hasHistory = mode === "insights" ? points.length > 0 : points.length >= 7 && span >= 6 && points.length / days >= 0.5;
  if (!isRecord(value) || value.status !== (hasHistory ? "ready" : "insufficient_history") ||
      !isRecord(value.dataWindow) || value.dataWindow.start !== dataWindow.start || value.dataWindow.end !== dataWindow.end ||
      value.dataWindow.dataPoints !== points.length || value.dataWindow.missingDays !== days - points.length ||
      !isRecord(value.method) || value.method.name !== (mode === "predict" ? "ordinary_least_squares" : "observed_summary") ||
      value.method.version !== 1 || value.method.trainedModelRequired !== false ||
      value.method.missingDays !== "unobserved_not_zero" || !isRecord(value.publicContext) ||
      !["ready", "unavailable"].includes(String(value.publicContext.status)) || value.publicContext.usedForForecast !== false) {
    throw new AIUnavailableError("MaxCore returned an invalid account analytics contract");
  }
  if (mode === "insights") {
    const metrics = value.metrics;
    if (typeof value.insight !== "string" || !value.insight.trim() || typeof value.generatedAt !== "string" ||
        !Number.isFinite(Date.parse(value.generatedAt)) || !isRecord(metrics) ||
        !(["streams", "revenue", "listeners"] as const).every(key => {
          if (!points.length) return metrics[key] === null;
          const expected = observedTotal(points, key);
          const actual = metrics[key];
          return typeof actual === "number" && Number.isFinite(actual) && actual >= 0 &&
            Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * Number.EPSILON * 8;
        })) {
      throw new AIUnavailableError("MaxCore returned empty or invalid account insights");
    }
  } else if (!Array.isArray(value.predictions) || value.accuracy !== null ||
      value.method.uncertainty !== "residual_prediction_interval_95" || value.method.accuracyCalibrated !== false ||
      !["up", "down", "stable"].includes(String(value.trend)) ||
      value.predictions.length !== (hasHistory ? Math.min(days, 30) : 0) ||
      value.predictions.some((point, index) => !isRecord(point) ||
        point.date !== new Date(Date.parse(dataWindow.end) + index * DAY).toISOString().slice(0, 10) || point.confidence !== null ||
        !["value", "lower95", "upper95"].every(key => typeof point[key] === "number" && Number.isFinite(point[key]) && point[key] >= 0) ||
        Number(point.lower95) > Number(point.value) || Number(point.upper95) < Number(point.value))) {
    throw new AIUnavailableError("MaxCore returned empty or invalid metric predictions");
  }
  return value;
}

/** Private account aggregates are sent transiently to MaxCore's dedicated
 * analysis contract. They never enter public-awareness ingestion or training.
 * Missing calendar days remain absent; current/incomplete UTC days are excluded.
 */
export function createAccountAnalyticsService(dependencies: Dependencies) {
  const { database, transport, now } = dependencies;
  async function remote(endpoint: string, options: Parameters<MaxCoreControlTransport["request"]>[1]) {
    try { return await transport.request<unknown>(endpoint, options); }
    catch { throw new AIUnavailableError("MaxCore account analytics upstream unavailable"); }
  }

  async function dailyMetric(userId: string, metric: "streams" | "revenue", start: Date, end: Date) {
    const column = sql.identifier(metric);
    return rows(await database.execute(sql`
      SELECT to_char(date_trunc('day', date), 'YYYY-MM-DD') AS date, SUM(${column}::numeric) AS value,
        COUNT(*) FILTER (WHERE ${column} IS NULL OR NOT (${column} >= 0 AND ${column} <= 1e12)) AS invalid
      FROM analytics WHERE user_id = ${userId} AND date >= ${start.toISOString()}::timestamp
        AND date < ${end.toISOString()}::timestamp GROUP BY date_trunc('day', date) ORDER BY date_trunc('day', date)
    `)).map(row => {
      if (Number(row.invalid) !== 0) throw new AIUnavailableError("account analytics contains invalid observations");
      return { date: String(row.date), value: checkedValue(row.value) };
    });
  }

  async function dailyAccount(userId: string, start: Date, end: Date) {
    return rows(await database.execute(sql`
      SELECT to_char(date_trunc('day', date), 'YYYY-MM-DD') AS date,
        SUM(streams::numeric) AS streams, SUM(revenue::numeric) AS revenue,
        SUM(total_listeners::numeric) AS listeners,
        COUNT(*) FILTER (WHERE streams IS NULL OR streams < 0 OR revenue IS NULL OR
          NOT (revenue >= 0 AND revenue <= 1e12) OR total_listeners IS NULL OR total_listeners < 0) AS invalid
      FROM analytics WHERE user_id = ${userId} AND date >= ${start.toISOString()}::timestamp
        AND date < ${end.toISOString()}::timestamp GROUP BY date_trunc('day', date) ORDER BY date_trunc('day', date)
    `)).map(row => {
      if (Number(row.invalid) !== 0) throw new AIUnavailableError("account analytics contains invalid observations");
      return { date: String(row.date), streams: checkedValue(row.streams), revenue: checkedValue(row.revenue), listeners: checkedValue(row.listeners) };
    });
  }


  return {
    async capability() {
      const result = await remote("/api/analytics/capability", { authScope: "generation", timeoutMs: 5_000 });
      if (!isAccountAnalyticsCapability(result)) {
        throw new AIUnavailableError("MaxCore account analytics capability unavailable");
      }
      return result;
    },
    async predict(userId: unknown, params: { metric: unknown; timeframe: unknown }) {
      requireUser(userId);
      if (!["streams", "engagement", "revenue"].includes(String(params.metric))) {
        throw new AppError("Valid metric is required (streams, engagement, revenue)", 400);
      }
      const window = windowFor(params.timeframe, now());
      // Current social counters lack a reporting period and collection history.
      // They cannot legitimately become daily acquisition observations.
      const points = params.metric === "engagement" ? [] :
        await dailyMetric(userId, params.metric as "streams" | "revenue", window.start, window.end);
      const result = await remote("/api/analytics/predict", { method: "POST", authScope: "generation", timeoutMs: 10_000,
        body: { version: 1, metric: params.metric, timeframe: window.timeframe, dataWindow: window.dataWindow, points } });
      const validated = validateResponse(result, window.dataWindow, "predict", points);
      if (points.length === 0 && validated.status !== "insufficient_history") {
        throw new AIUnavailableError("MaxCore forecast requires observed account history");
      }
      return params.metric === "engagement" ? { ...validated,
        sourceAvailability: { available: false, code: "DAILY_ENGAGEMENT_REPORTS_UNAVAILABLE",
          message: "Current post counters are lifetime snapshots, not timestamped daily engagement reports; no daily observations were inferred." } } : validated;
    },
    async insights(userId: unknown, timeframe: unknown = "30d") {
      requireUser(userId);
      const window = windowFor(timeframe, now());
      const points = await dailyAccount(userId, window.start, window.end);
      const result = await remote("/api/analytics/insights", { method: "POST", authScope: "generation", timeoutMs: 10_000,
        body: { version: 1, timeframe: window.timeframe, dataWindow: window.dataWindow, points } });
      return validateResponse(result, window.dataWindow, "insights", points);
    },
  };
}

export const accountAnalyticsService = createAccountAnalyticsService({ database: db, transport: maxCoreControlTransport, now: () => new Date() });
