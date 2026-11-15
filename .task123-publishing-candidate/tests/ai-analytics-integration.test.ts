/**
 * Integration tests for AI analytics, fanbase insights, and advertising CTR prediction.
 * Exercises the newly real-data-backed endpoints introduced in this session.
 * Requires a running server at localhost:5000.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { generateSync } from "otplib";
import { withFixtureDatabase } from "./helpers-http-fixture";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";
let cookies = "";
let csrfToken = "";

const testUser = {
  birthdate: "1990-01-01",
  email: `ai_analytics_test_${Date.now()}@maxbooster-test.invalid`,
  password: "SecurePass123!@#",
  username: `AIAnalyticsTest_${Date.now()}`,
  firstName: "AI",
  lastName: "Tester",
};

async function api(method: string, path: string, body?: unknown) {
  const mutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
  if (mutation && !cookies.split("; ").some(cookie => cookie.startsWith("csrf-token="))) {
    await api("GET", "/api/csrf-token");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookies) headers["Cookie"] = cookies;
  if (mutation && csrfToken) headers["x-csrf-token"] = csrfToken;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    const merged = new Map(cookies.split("; ").filter(Boolean).map(cookie => {
      const separator = cookie.indexOf("=");
      return [cookie.slice(0, separator), cookie.slice(separator + 1)];
    }));
    for (const cookie of setCookie) {
      const pair = cookie.split(";", 1)[0], separator = pair.indexOf("=");
      if (separator > 0) merged.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    cookies = [...merged].map(([name, value]) => `${name}=${value}`).join("; ");
    csrfToken = merged.get("csrf-token") || "";
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

describe("AI Analytics & Fanbase Insights — Real Data Endpoints", () => {
  beforeAll(async () => {
    const reg = await api("POST", "/api/auth/register", testUser);
    expect(reg.status).toBe(200);
    const session = await api("GET", "/api/auth/me");
    expect(session.status).toBe(200);
    expect(session.json).toMatchObject({ email: testUser.email, role: "user" });
  });

  // ── Authentication guard ──────────────────────────────────────────────────

  it("GET /api/analytics/music/fanbase → 401 when unauthenticated", async () => {
    const savedCookies = cookies;
    const savedCsrf = csrfToken;
    cookies = "";
    const res = await api("GET", "/api/analytics/music/fanbase");
    cookies = savedCookies;
    csrfToken = savedCsrf;
    expect(res.status).toBe(401);
  });

  // ── Fanbase insights ──────────────────────────────────────────────────────

  it("GET /api/analytics/music/fanbase → 200 with correct shape", async () => {
    const res = await api("GET", "/api/analytics/music/fanbase");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ totalFans: null, activeListeners: null,
      engagementRate: null, topPlatforms: [],
      demographics: { topLocations: [], peakListeningTimes: [] } });
    expect((res.json as { growthOpportunities: unknown[] }).growthOpportunities).toEqual([expect.any(String)]);
  });

  it("GET /api/analytics/music/fanbase → returns array-safe topPlatforms when available", async () => {
    const res = await api("GET", "/api/analytics/music/fanbase");
    expect(res.status).toBe(200);
    expect(Array.isArray((res.json as { topPlatforms: unknown[] }).topPlatforms)).toBe(true);
  });

  // ── AI analytics predict ──────────────────────────────────────────────────

  it("POST /api/ai/analytics/predict reports missing account history without requiring a trained model", async () => {
    const res = await api("POST", "/api/ai/analytics/predict", { metric: "streams", timeframe: "30d" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ success: true, data: { status: "insufficient_history", predictions: [], accuracy: null,
      method: { name: "ordinary_least_squares", trainedModelRequired: false } } });
  });

  it("capability and personal summaries use the dedicated authenticated MaxCore statistics contract", async () => {
    const capability = await api("GET", "/api/ai/analytics/insights/capability");
    expect(capability.status).toBe(200);
    expect(capability.json).toMatchObject({ available: true, version: 1, trainedModelRequired: false });
    const summary = await api("POST", "/api/ai/analytics/insights", {});
    expect(summary.status).toBe(200);
    expect(summary.json).toMatchObject({ status: "insufficient_history", insight: expect.any(String),
      metrics: { streams: null, revenue: null, listeners: null }, method: { name: "observed_summary" } });
  });

  it("personal insight and capability routes require the real authenticated session", async () => {
    const savedCookies = cookies, savedCsrf = csrfToken;
    try {
      cookies = ""; csrfToken = "";
      expect((await api("GET", "/api/ai/analytics/insights/capability")).status).toBe(401);
      expect((await api("POST", "/api/ai/analytics/insights", {})).status).toBe(401);
    } finally { cookies = savedCookies; csrfToken = savedCsrf; }
  });

  it("personal insights validate the period and engagement does not reinterpret lifetime counters as daily activity", async () => {
    expect((await api("POST", "/api/ai/analytics/insights", { timeframe: "1d" })).status).toBe(400);
    const engagement = await api("POST", "/api/ai/analytics/predict", { metric: "engagement", timeframe: "7d" });
    expect(engagement.status).toBe(200);
    expect(engagement.json).toMatchObject({ success: true, data: { status: "insufficient_history", predictions: [],
      sourceAvailability: { available: false, code: "DAILY_ENGAGEMENT_REPORTS_UNAVAILABLE" } } });
  });

  it("known owned daily values produce exact forecasts and summaries while body identity and foreign rows are ignored", async () => {
    const fixture = await withFixtureDatabase(testUser.email, async client => {
      const owner = await client.query("SELECT id FROM users WHERE email=$1", [testUser.email]);
      const foreign = await client.query("INSERT INTO users(email,password) SELECT $1,password FROM users WHERE email=$2 RETURNING id",
        [`forecast_foreign_${Date.now()}@maxbooster-test.invalid`, testUser.email]);
      for (let day = 0; day < 7; day++) {
        await client.query("INSERT INTO analytics(user_id,date,streams,revenue,total_listeners) VALUES($1,date_trunc('day',now() AT TIME ZONE 'UTC')-interval '7 days'+$2*interval '1 day',$3,$4,$5)",
          [owner.rows[0].id, day, 10 * (day + 1), 0.25 * (day + 1), 3 * (day + 1)]);
        await client.query("INSERT INTO analytics(user_id,date,streams,revenue,total_listeners) VALUES($1,date_trunc('day',now() AT TIME ZONE 'UTC')-interval '7 days'+$2*interval '1 day',999999,999999,999999)",
          [foreign.rows[0].id, day]);
      }
      await client.query("INSERT INTO analytics(user_id,date,streams,revenue,total_listeners) VALUES($1,date_trunc('day',now() AT TIME ZONE 'UTC'),777777,777777,777777)", [owner.rows[0].id]);
      return { owner: owner.rows[0].id, foreign: foreign.rows[0].id };
    });
    try {
      const forecast = await api("POST", "/api/ai/analytics/predict", { metric: "streams", timeframe: "7d",
        userId: fixture.foreign, points: [{ date: "2026-01-01", value: 999999 }] });
      expect(forecast.status).toBe(200);
      expect(forecast.json).toMatchObject({ success: true, data: { status: "ready", trend: "up", accuracy: null,
        dataWindow: { dataPoints: 7, missingDays: 0 } } });
      expect((forecast.json as { data: { predictions: { value: number }[] } }).data.predictions.map(point => point.value))
        .toEqual([80, 90, 100, 110, 120, 130, 140]);
      const summary = await api("POST", "/api/ai/analytics/insights", { timeframe: "7d", userId: fixture.foreign });
      expect(summary.status).toBe(200);
      expect(summary.json).toMatchObject({ status: "ready", metrics: { streams: 280, revenue: 7, listeners: 84 } });
      expect((summary.json as { insight: string }).insight).toContain("not a unique audience count");
    } finally {
      await withFixtureDatabase(testUser.email, async client => {
        await client.query("DELETE FROM analytics WHERE user_id=ANY($1::varchar[])", [[fixture.owner, fixture.foreign]]);
        await client.query("DELETE FROM users WHERE id=$1", [fixture.foreign]);
      });
    }
  });

  it("a controlled MaxCore outage remains a retryable503 rather than an invented local prediction", async () => {
    const origin = process.env.MAXBOOSTER_ANALYTICS_FIXTURE_ORIGIN;
    const token = process.env.MAXBOOSTER_ANALYTICS_FIXTURE_TOKEN;
    expect(origin && token).toBeTruthy();
    const fault = (unavailable: boolean) => fetch(`${origin}/__fixture/outage`, { method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ unavailable }), signal: AbortSignal.timeout(2000) });
    try {
      expect((await fault(true)).status).toBe(200);
      const forecast = await api("POST", "/api/ai/analytics/predict", { metric: "streams", timeframe: "7d" });
      expect(forecast.status).toBe(503);
      expect(forecast.json).toMatchObject({ error: expect.stringContaining("temporarily unavailable") });
      const summary = await api("POST", "/api/ai/analytics/insights", {});
      expect(summary.status).toBe(503);
      const capability = await api("GET", "/api/ai/analytics/insights/capability");
      expect(capability.status).toBe(503); expect(capability.json).toMatchObject({ available: false });
    } finally { expect((await fault(false)).status).toBe(200); }
    expect((await api("GET", "/api/ai/analytics/insights/capability")).status).toBe(200);
  });

  it("POST /api/ai/analytics/predict rejects an invalid metric before generation", async () => {
    const res = await api("POST", "/api/ai/analytics/predict", {
      metric: "INVALID_METRIC",
      timeframe: "30d",
    });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ error: expect.stringContaining("Valid metric is required") });
  });

  // ── Analytics dashboard (real DB queries) ────────────────────────────────

  it("GET /api/analytics/dashboard → 200 with expected overview fields", async () => {
    const res = await api("GET", "/api/analytics/dashboard");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ overview: { totalStreams: 0, totalRevenue: 0, totalListeners: 0 },
      streams: { daily: [], weekly: [], monthly: [] } });
  });

  it("GET /api/analytics/dashboard?timeRange=7d → authenticated 200", async () => {
    const res = await api("GET", "/api/analytics/dashboard?timeRange=7d");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ overview: { totalStreams: 0 }, streams: { daily: [] } });
  });

  it("GET /api/analytics/dashboard?timeRange=90d → authenticated 200", async () => {
    const res = await api("GET", "/api/analytics/dashboard?timeRange=90d");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ overview: { totalStreams: 0 }, streams: { daily: [] } });
  });

  // ── Advertising CTR prediction (real DB historical comparison) ───────────

  it("GET /api/advertising/campaigns → authenticated owned campaign array", async () => {
    const res = await api("GET", "/api/advertising/campaigns");
    expect(res.status).toBe(200);
    expect(res.json).toEqual([]);
  });

  // ── AI anomaly detection ──────────────────────────────────────────────────

  it("GET /api/analytics/anomalies requires an authenticated administrator", async () => {
    const res = await api("GET", "/api/analytics/anomalies");
    expect(res.status).toBe(403);
    expect(res.json).toEqual({ error: "Admin access required" });
    const summary = await api("GET", "/api/analytics/anomalies/summary");
    expect(summary.status).toBe(403);
  });

  it("an administrator with a real verified factor reads only owned persisted anomalies", async () => {
    const setup = await api("POST", "/api/auth/2fa/setup", {});
    expect(setup.status).toBe(200);
    const secret = (setup.json as { secret: string }).secret;
    expect(typeof secret).toBe("string");
    const factor = await api("POST", "/api/auth/2fa/verify", { code: generateSync({ secret, strategy: "totp" }) });
    expect(factor.status).toBe(200);
    const fixture = await withFixtureDatabase(testUser.email, async client => {
      const owner = await client.query("UPDATE users SET role='admin' WHERE email=$1 RETURNING id", [testUser.email]);
      expect(owner.rowCount).toBe(1);
      const foreign = await client.query("INSERT INTO users(email,password) SELECT $1,password FROM users WHERE email=$2 RETURNING id",
        [`anomaly_foreign_${Date.now()}@maxbooster-test.invalid`, testUser.email]);
      expect(foreign.rowCount).toBe(1);
      const streams = [98, 102, 99, 101, 100, 97, 103, 1000];
      for (const [day, value] of streams.entries()) {
        await client.query("INSERT INTO analytics(user_id,date,streams,revenue) VALUES($1,date_trunc('day',now())-interval '7 days'+$2*interval '1 day',$3,10)",
          [owner.rows[0].id, day, value]);
      }
      await client.query("INSERT INTO analytics(user_id,date,streams,revenue) VALUES($1,date_trunc('day',now()),999999,999999)", [foreign.rows[0].id]);
      const date = (await client.query("SELECT to_char(now(),'YYYY-MM-DD') AS day")).rows[0].day;
      return { ownerId: owner.rows[0].id, foreignId: foreign.rows[0].id, date };
    });
    try {
      expect((await api("POST", "/api/auth/update-onboarding", { hasCompletedOnboarding: true })).status).toBe(200);
      const res = await api("GET", "/api/analytics/anomalies");
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ data: [{ id: `streams:${fixture.date}`, metricType: "streams",
        severity: "critical", deviationPercentage: 900, acknowledged: false }] });
      expect((res.json as { data: unknown[] }).data).toHaveLength(1);
      const summary = await api("GET", "/api/analytics/anomalies/summary");
      expect(summary.status).toBe(200);
      expect(summary.json).toEqual({ total: 1, unacknowledged: 1,
        bySeverity: { critical: 1, warning: 0, info: 0 }, byMetric: { streams: 1 } });
    } finally {
      await withFixtureDatabase(testUser.email, async client => {
        await client.query("UPDATE users SET role='user' WHERE id=$1", [fixture.ownerId]);
        await client.query("DELETE FROM analytics WHERE user_id=ANY($1::varchar[])", [[fixture.ownerId, fixture.foreignId]]);
        await client.query("DELETE FROM users WHERE id=$1", [fixture.foreignId]);
      });
      expect((await api("POST", "/api/auth/update-onboarding", { hasCompletedOnboarding: true })).status).toBe(200);
    }
  });

  // ── Release strategy ─────────────────────────────────────────────────────

  it("GET /api/analytics/music/release-strategy → 200 with missing history explicit", async () => {
    const res = await api("GET", "/api/analytics/music/release-strategy");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ bestReleaseDay: null, bestReleaseTime: null,
      optimalFrequency: null, genreTrends: [], competitorAnalysis: [] });
    expect((res.json as { recommendations: unknown[] }).recommendations.length).toBeGreaterThan(0);
  });

  // ── Milestone tracking ────────────────────────────────────────────────────

  it("GET /api/analytics/music/milestones → 200 with owned persisted progress", async () => {
    const res = await api("GET", "/api/analytics/music/milestones");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject([
      { type: "streams", current: 0, nextMilestone: 1000, progress: 0 },
      { type: "followers", current: 0, nextMilestone: 100, progress: 0 },
      { type: "releases", current: 0, nextMilestone: 1, progress: 0 },
    ]);
  });

  // ── Pagination sanity ─────────────────────────────────────────────────────

  it("GET /api/analytics/dashboard?limit=1000 preserves the authorized response", async () => {
    const res = await api("GET", "/api/analytics/dashboard?limit=1000");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ overview: { totalStreams: 0 }, streams: { daily: [] } });
  });
});
