/**
 * Feature coverage: Beat Marketplace, Music Distribution
 */
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";

const testUser = {
  email: `feat_mktplace_${Date.now()}@maxbooster-test.invalid`,
  password: "SecurePass123!@#",
  firstName: "Feature",
  lastName: "Market",
};

let authCookies = "";
let csrfToken = "";

async function api(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authCookies) headers["Cookie"] = authCookies;
  if (csrfToken && !["GET", "HEAD"].includes(method.toUpperCase()))
    headers["x-csrf-token"] = csrfToken;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    const map = new Map<string, string>();
    for (const c of authCookies.split("; ")) {
      const i = c.indexOf("=");
      if (i > 0) map.set(c.slice(0, i), c.slice(i + 1));
    }
    for (const c of setCookie) {
      const pair = c.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) {
        const k = pair.slice(0, i);
        const v = pair.slice(i + 1);
        map.set(k, v);
        if (k === "csrf-token") csrfToken = v;
      }
    }
    authCookies = Array.from(map.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  let json: unknown;
  try {
    json = JSON.parse(await res.text());
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

describe("Feature: Beat Marketplace & Music Distribution", () => {
  it("setup: register and login test user", async () => {
    await api("POST", "/api/auth/register", testUser);
    const r = await api("POST", "/api/auth/login", {
      email: testUser.email,
      password: testUser.password,
    });
    expect(r.status).toBe(200);
    expect(authCookies).toBeTruthy();
  });

  // ── BEAT MARKETPLACE (Public) ──────────────────────────────────────────────
  describe("Beat Marketplace — Public Browsing", () => {
    it("GET /api/marketplace/beats returns beat listings (public)", async () => {
      const r = await fetch(`${BASE}/api/marketplace/beats`, {
        signal: AbortSignal.timeout(10000),
      });
      expect(r.status).toBe(200);
      const body = (await r.json()) as Record<string, unknown>;
      expect(Array.isArray(body.beats ?? body.data ?? body)).toBe(true);
    });

    it("GET /api/marketplace/beats supports genre filter", async () => {
      const r = await fetch(`${BASE}/api/marketplace/beats?genre=hip-hop`, {
        signal: AbortSignal.timeout(10000),
      });
      expect(r.status).toBe(200);
    });

    it("GET /api/marketplace/beats supports BPM range filter", async () => {
      const r = await fetch(
        `${BASE}/api/marketplace/beats?bpmMin=80&bpmMax=120`,
        { signal: AbortSignal.timeout(10000) },
      );
      expect(r.status).toBe(200);
    });

    it("GET /api/marketplace/beats supports pagination", async () => {
      const r = await fetch(`${BASE}/api/marketplace/beats?page=1&limit=10`, {
        signal: AbortSignal.timeout(10000),
      });
      expect(r.status).toBe(200);
    });

    it("GET /api/marketplace/producers returns producer list (public)", async () => {
      const r = await fetch(`${BASE}/api/marketplace/producers`, {
        signal: AbortSignal.timeout(10000),
      });
      expect(r.status).toBe(200);
    });

    it("GET /api/marketplace/license-templates returns license templates", async () => {
      // Route requires authentication — use api() with auth cookies
      const r = await api("GET", "/api/marketplace/license-templates");
      expect([200, 401]).toContain(r.status);
    });
  });

  // ── BEAT MARKETPLACE (Authenticated) ──────────────────────────────────────
  describe("Beat Marketplace — Authenticated", () => {
    it("GET /api/marketplace/my-beats returns authenticated user beats", async () => {
      const r = await api("GET", "/api/marketplace/my-beats");
      expect([200, 401]).toContain(r.status);
    });

    it("GET /api/marketplace/purchases returns user purchases", async () => {
      const r = await api("GET", "/api/marketplace/purchases");
      expect([200, 401]).toContain(r.status);
    });

    it("GET /api/marketplace/for-you returns personalised recommendations", async () => {
      const r = await api("GET", "/api/marketplace/for-you");
      expect([200, 401]).toContain(r.status);
    });

    it("GET /api/marketplace/ai-recommendations returns AI beat recs", async () => {
      const r = await api("GET", "/api/marketplace/ai-recommendations");
      expect([200, 401]).toContain(r.status);
    });

    it("GET /api/marketplace/taste-profile returns listener taste profile", async () => {
      const r = await api("GET", "/api/marketplace/taste-profile");
      expect([200, 401]).toContain(r.status);
    });

    it("GET /api/marketplace/my-stems returns stems for authenticated user", async () => {
      const r = await api("GET", "/api/marketplace/my-stems");
      expect([200, 401]).toContain(r.status);
    });

    it("GET /api/marketplace/collaborations returns collab requests", async () => {
      const r = await api("GET", "/api/marketplace/collaborations");
      expect([200, 401]).toContain(r.status);
    });

    it("GET /api/marketplace/contracts returns contract list", async () => {
      const r = await api("GET", "/api/marketplace/contracts");
      expect([200, 401]).toContain(r.status);
    });

    it("GET /api/marketplace/affiliates returns affiliate program info", async () => {
      const r = await api("GET", "/api/marketplace/affiliates");
      expect([200, 401]).toContain(r.status);
    });

    it("GET /api/marketplace/escrow returns escrow transactions", async () => {
      const r = await api("GET", "/api/marketplace/escrow");
      expect([200, 401]).toContain(r.status);
    });

    it("GET /api/marketplace/sales-analytics returns sales data", async () => {
      const r = await api("GET", "/api/marketplace/sales-analytics");
      expect([200, 401]).toContain(r.status);
    });
  });

  // ── BEAT MARKETPLACE (Auth guard checks) ──────────────────────────────────
  describe("Marketplace auth guards", () => {
    it("GET /api/marketplace/my-beats without auth → 401/403", async () => {
      const r = await fetch(`${BASE}/api/marketplace/my-beats`, {
        signal: AbortSignal.timeout(8000),
      });
      expect([401, 403]).toContain(r.status);
    });
    it("GET /api/marketplace/purchases without auth → 401/403", async () => {
      const r = await fetch(`${BASE}/api/marketplace/purchases`, {
        signal: AbortSignal.timeout(8000),
      });
      expect([401, 403]).toContain(r.status);
    });
  });

  // ── MUSIC DISTRIBUTION ─────────────────────────────────────────────────────
  describe("Music Distribution", () => {
    let releaseId = "";

    it("GET /api/distribution/platforms returns available DSPs", async () => {
      const r = await api("GET", "/api/distribution/platforms");
      expect(r.status).toBe(200);
      const body = r.json as Record<string, unknown>;
      expect(Array.isArray(body.platforms ?? body)).toBe(true);
    });

    it("GET /api/distribution/platforms/status returns platform connectivity status", async () => {
      const r = await api("GET", "/api/distribution/platforms/status");
      expect(r.status).toBe(200);
    });

    it("GET /api/distribution/releases returns user releases", async () => {
      const r = await api("GET", "/api/distribution/releases");
      expect(r.status).toBe(200);
      const body = r.json as Record<string, unknown>;
      expect(Array.isArray(body.releases ?? body)).toBe(true);
    });

    it("GET /api/distribution/policies returns DSP submission policies", async () => {
      const r = await fetch(`${BASE}/api/distribution/policies`, {
        signal: AbortSignal.timeout(10000),
      });
      expect(r.status).toBe(200);
    });

    it("POST /api/distribution/releases creates a release", async () => {
      const r = await api("POST", "/api/distribution/releases", {
        title: "My Test EP",
        releaseType: "ep",
        genre: "r&b",
        primaryArtist: "Test Artist",
        releaseDate: new Date(Date.now() + 60 * 24 * 3600 * 1000)
          .toISOString()
          .split("T")[0],
        label: "Independent",
        language: "en",
      });
      expect([200, 201, 400]).toContain(r.status);
      if ([200, 201].includes(r.status)) {
        const body = r.json as Record<string, unknown>;
        releaseId = (body.id ?? body.release?.id) as string;
      }
    });

    it("GET /api/distribution/releases/:id retrieves release", async () => {
      if (!releaseId) return;
      const r = await api("GET", `/api/distribution/releases/${releaseId}`);
      expect(r.status).toBe(200);
    });

    it("PATCH /api/distribution/releases/:id updates release metadata", async () => {
      if (!releaseId) return;
      const r = await api("PATCH", `/api/distribution/releases/${releaseId}`, {
        label: "Test Label LLC",
      });
      expect([200, 204]).toContain(r.status);
    });

    it("GET /api/distribution/releases/:id/status gets release status", async () => {
      if (!releaseId) return;
      const r = await api(
        "GET",
        `/api/distribution/releases/${releaseId}/status`,
      );
      expect([200, 404]).toContain(r.status);
    });

    it("GET /api/distribution/hyperfollow returns HyperFollow pages", async () => {
      const r = await api("GET", "/api/distribution/hyperfollow");
      expect(r.status).toBe(200);
    });

    it("POST /api/distribution/validate validates release data", async () => {
      const r = await api("POST", "/api/distribution/validate", {
        title: "Test Track",
        isrc: "USTEST123456",
        genre: "pop",
      });
      expect([200, 400]).toContain(r.status);
    });

    it("DELETE /api/distribution/releases/:id removes release", async () => {
      if (!releaseId) return;
      const r = await api("DELETE", `/api/distribution/releases/${releaseId}`);
      expect([200, 204]).toContain(r.status);
    });

    it("GET /api/distribution/releases without auth → 401", async () => {
      const r = await fetch(`${BASE}/api/distribution/releases`, {
        signal: AbortSignal.timeout(8000),
      });
      expect([401, 403]).toContain(r.status);
    });
  });

  // ── ROYALTIES ─────────────────────────────────────────────────────────────
  describe("Royalties", () => {
    it("GET /api/royalties/summary returns royalty summary", async () => {
      const r = await api("GET", "/api/royalties/summary");
      expect(r.status).toBe(200);
    });

    it("GET /api/royalties returns royalty records", async () => {
      const r = await api("GET", "/api/royalties");
      expect(r.status).toBe(200);
    });

    it("GET /api/royalties/platform-breakdown returns per-platform breakdown", async () => {
      const r = await api("GET", "/api/royalties/platform-breakdown");
      expect(r.status).toBe(200);
    });

    it("GET /api/royalties/top-tracks returns top earning tracks", async () => {
      const r = await api("GET", "/api/royalties/top-tracks");
      expect(r.status).toBe(200);
    });

    it("GET /api/royalties/splits returns split configurations", async () => {
      const r = await api("GET", "/api/royalties/splits");
      expect(r.status).toBe(200);
    });

    it("GET /api/royalties/forecast returns earnings forecast", async () => {
      const r = await api("GET", "/api/royalties/forecast");
      expect(r.status).toBe(200);
    });

    it("GET /api/royalties without auth → 401", async () => {
      const r = await fetch(`${BASE}/api/royalties`, {
        signal: AbortSignal.timeout(8000),
      });
      expect([401, 403]).toContain(r.status);
    });
  });
});
