/**
 * Feature coverage: Press Kit, Venues/Booking CRM, Playlist Pitching,
 * Radio Pitches, Label Submissions, Shows
 */
import { describe, it, expect } from "vitest";

import { provisionFixtureEntitlement } from "./helpers-http-fixture";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";

const testUser = {
  birthdate: "1990-01-01",
  email: `feat_pitch_${Date.now()}@maxbooster-test.invalid`,
  password: "SecurePass123!@#",
  firstName: "Feature",
  lastName: "Pitch",
};

let authCookies = "";
let csrfToken = "";

async function api(
  method: string,
  path: string,
  body?: unknown,
  extra?: Record<string, string>,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  if (authCookies) headers["Cookie"] = authCookies;
  if (csrfToken && !["GET", "HEAD"].includes(method.toUpperCase()))
    headers["x-csrf-token"] = csrfToken;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
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

describe("Feature: Press Kit, Venues, Pitching, Radio, Label Submissions", () => {
  it("setup: register and login test user", async () => {
    const registered = await api("POST", "/api/auth/register", testUser);
    expect(registered.status).toBe(200);
    await provisionFixtureEntitlement(testUser.email);
    const r = await api("POST", "/api/auth/login", {
      email: testUser.email,
      password: testUser.password,
    });
    expect(r.status).toBe(200);
    expect(authCookies).toContain("sessionId=");
    const session = await api("GET", "/api/auth/me");
    expect(session.status).toBe(200);
    expect(session.json).toMatchObject({ email: testUser.email });
    // Ensure CSRF token is populated for subsequent POST/PUT/DELETE calls
    await api("GET", "/api/csrf-token");
  });

  // ── PRESS KIT ──────────────────────────────────────────────────────────────
  describe("Press Kit", () => {
    it("GET /api/press-kit returns press kit (empty on new account)", async () => {
      const r = await api("GET", "/api/press-kit");
      expect([200, 404]).toContain(r.status);
    });

    it("PUT /api/press-kit creates or updates press kit", async () => {
      const r = await api("PUT", "/api/press-kit", {
        artistName: "Test Artist",
        genre: "Hip-Hop",
        bio: "A short bio for testing",
        location: "New York, NY",
        yearsActive: 3,
      });
      expect([200, 201]).toContain(r.status);
      const body = r.json as Record<string, unknown>;
      expect(body).toBeTruthy();
    });

    it("GET /api/press-kit returns updated press kit", async () => {
      const r = await api("GET", "/api/press-kit");
      expect(r.status).toBe(200);
      const body = r.json as Record<string, unknown>;
      expect(body).toBeTruthy();
    });

    it("POST /api/press-kit/publish publishes the press kit", async () => {
      const r = await api("POST", "/api/press-kit/publish");
      expect([200, 201, 400]).toContain(r.status);
    });

    it("GET /api/press-kit without auth returns 401", async () => {
      const r = await fetch(`${BASE}/api/press-kit`, {
        signal: AbortSignal.timeout(8000),
      });
      expect([401, 403]).toContain(r.status);
    });
  });

  // ── VENUES / BOOKING CRM ───────────────────────────────────────────────────
  describe("Venues / Booking CRM", () => {
    let venueId = "";

    it("GET /api/venues returns empty list for new user", async () => {
      const r = await api("GET", "/api/venues");
      expect(r.status).toBe(200);
      const body = r.json as Record<string, unknown>;
      expect(Array.isArray(body.venues ?? body)).toBe(true);
    });

    it("GET /api/venues/stats returns venue statistics", async () => {
      const r = await api("GET", "/api/venues/stats");
      expect(r.status).toBe(200);
    });

    it("POST /api/venues creates a venue", async () => {
      // Schema requires `venueName` (not `name`) as the primary identifier field
      const r = await api("POST", "/api/venues", {
        venueName: "The Test Venue",
        city: "Chicago",
        state: "IL",
        country: "US",
        capacity: 500,
        venueType: "club",
        contactName: "John Booker",
        contactEmail: "booker@venue-test.invalid",
      });
      expect([200, 201]).toContain(r.status);
      const body = r.json as Record<string, unknown>;
      venueId = (body.id ?? body.venue?.id) as string;
      expect(typeof venueId).toBe("string");
    });

    it("GET /api/venues/:id retrieves the created venue", async () => {
      expect(venueId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api("GET", `/api/venues/${venueId}`);
      expect(r.status).toBe(200);
      const body = r.json as Record<string, unknown>;
      // Venue schema uses `venueName` field (not `name`)
      const name =
        body.venueName ??
        body.name ??
        (body.venue as Record<string, unknown>)?.venueName;
      expect(name).toBe("The Test Venue");
    });

    it("PUT /api/venues/:id updates the venue", async () => {
      expect(venueId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api("PUT", `/api/venues/${venueId}`, {
        venueName: "The Updated Venue",
        capacity: 750,
      });
      expect(r.status).toBe(200);
      const saved = await api("GET", `/api/venues/${venueId}`);
      expect(saved.status).toBe(200);
      expect(saved.json).toMatchObject({ venueName: "The Updated Venue", capacity: 750 });
    });

    it("DELETE /api/venues/:id removes the venue", async () => {
      expect(venueId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api("DELETE", `/api/venues/${venueId}`);
      expect([200, 204]).toContain(r.status);
      expect((await api("GET", `/api/venues/${venueId}`)).status).toBe(404);
    });
  });

  // ── PLAYLIST PITCHING ──────────────────────────────────────────────────────
  describe("Playlist Pitching", () => {
    let pitchId = "";

    it("GET /api/playlist-pitching/curators requires authentication", async () => {
      const r = await fetch(`${BASE}/api/playlist-pitching/curators`, {
        signal: AbortSignal.timeout(8000),
      });
      expect(r.status).toBe(401);
      const json = (await r.json()) as unknown;
      expect(json).toBeTruthy();
    });

    it("GET /api/playlist-pitching/curators returns curators for a paid account", async () => {
      const response = await api("GET", "/api/playlist-pitching/curators");
      expect(response.status).toBe(200);
      const body = response.json as Record<string, unknown>;
      expect(Array.isArray(body.curators ?? body)).toBe(true);
    });

    it("GET /api/playlist-pitching returns list", async () => {
      const r = await api("GET", "/api/playlist-pitching");
      expect(r.status).toBe(200);
      const body = r.json as Record<string, unknown>;
      expect(Array.isArray(body.pitches ?? body)).toBe(true);
    });

    it("GET /api/playlist-pitching/stats returns statistics", async () => {
      const r = await api("GET", "/api/playlist-pitching/stats");
      expect(r.status).toBe(200);
    });

    it("POST /api/playlist-pitching creates a pitch", async () => {
      const r = await api("POST", "/api/playlist-pitching", {
        trackTitle: "Test Track",
        artistName: "Test Artist",
        genre: "hip-hop",
        curatorName: "Top Curator",
        playlistName: "Hot Tracks 2025",
        pitchNote: "This track fits your vibe perfectly.",
      });
      expect([200, 201]).toContain(r.status);
      const body = r.json as Record<string, unknown>;
      pitchId = (body.id ?? body.pitch?.id) as string;
    });

    it("GET /api/playlist-pitching/:id retrieves pitch", async () => {
      expect(pitchId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api("GET", `/api/playlist-pitching/${pitchId}`);
      expect(r.status).toBe(200);
    });

    it("PATCH /api/playlist-pitching/:id/status updates status", async () => {
      expect(pitchId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api("PATCH", `/api/playlist-pitching/${pitchId}/status`, {
        status: "submitted",
      });
      expect([200, 400]).toContain(r.status);
    });

    it("DELETE /api/playlist-pitching/:id removes pitch", async () => {
      expect(pitchId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api("DELETE", `/api/playlist-pitching/${pitchId}`);
      expect([200, 204]).toContain(r.status);
    });
  });

  // ── RADIO PITCHES ─────────────────────────────────────────────────────────
  describe("Radio Pitches", () => {
    let radioId = "";

    it("GET /api/radio-pitches returns list", async () => {
      const r = await api("GET", "/api/radio-pitches");
      expect(r.status).toBe(200);
    });

    it("GET /api/radio-pitches/stats returns statistics", async () => {
      const r = await api("GET", "/api/radio-pitches/stats");
      expect(r.status).toBe(200);
    });

    it("POST /api/radio-pitches creates a pitch", async () => {
      // Schema requires `targetName` (the station/DJ name) instead of separate stationName/djName
      const r = await api("POST", "/api/radio-pitches", {
        trackTitle: "Radio Ready Hit",
        targetName: "WKTU FM — DJ Tester",
        targetType: "radio",
        genre: "pop",
        pitchNote: "Perfect for morning drive.",
      });
      expect([200, 201]).toContain(r.status);
      const body = r.json as Record<string, unknown>;
      radioId = (body.id ?? body.pitch?.id) as string;
    });

    it("GET /api/radio-pitches/:id retrieves pitch", async () => {
      expect(radioId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api("GET", `/api/radio-pitches/${radioId}`);
      expect(r.status).toBe(200);
    });

    it("DELETE /api/radio-pitches/:id removes pitch", async () => {
      expect(radioId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api("DELETE", `/api/radio-pitches/${radioId}`);
      expect([200, 204]).toContain(r.status);
    });
  });

  // ── LABEL SUBMISSIONS (A&R) ────────────────────────────────────────────────
  describe("Label Submissions (A&R)", () => {
    let submissionId = "";

    it("GET /api/label-submissions returns list", async () => {
      const r = await api("GET", "/api/label-submissions");
      expect(r.status).toBe(200);
    });

    it("GET /api/label-submissions/stats returns statistics", async () => {
      const r = await api("GET", "/api/label-submissions/stats");
      expect(r.status).toBe(200);
    });

    it("POST /api/label-submissions creates a submission", async () => {
      // Schema requires `trackTitle` and `labelName` as primary fields
      const r = await api("POST", "/api/label-submissions", {
        trackTitle: "Breakthrough Single",
        labelName: "Interscope Test",
        artistName: "Test Artist",
        contactName: "A&R Rep",
        contactEmail: "anr@label-test.invalid",
        notes: "Chart-ready single with 500k streams.",
      });
      expect([200, 201]).toContain(r.status);
      const body = r.json as Record<string, unknown>;
      submissionId = (body.id ?? body.submission?.id) as string;
    });

    it("GET /api/label-submissions/:id retrieves submission", async () => {
      expect(submissionId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api("GET", `/api/label-submissions/${submissionId}`);
      expect(r.status).toBe(200);
    });

    it("PATCH /api/label-submissions/:id/status updates status", async () => {
      expect(submissionId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api(
        "PATCH",
        `/api/label-submissions/${submissionId}/status`,
        { status: "under_review" },
      );
      expect([200, 400]).toContain(r.status);
    });

    it("POST /api/label-submissions/:id/followup logs a followup", async () => {
      expect(submissionId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api(
        "POST",
        `/api/label-submissions/${submissionId}/followup`,
        { note: "Following up after 2 weeks." },
      );
      expect([200, 201]).toContain(r.status);
    });

    it("DELETE /api/label-submissions/:id removes submission", async () => {
      expect(submissionId, "A prior create/upload step must have succeeded").toBeTruthy();
      const r = await api("DELETE", `/api/label-submissions/${submissionId}`);
      expect([200, 204]).toContain(r.status);
    });
  });

  // ── AUTH GUARDS ────────────────────────────────────────────────────────────
  describe("Auth guards (unauthenticated)", () => {
    it("GET /api/venues without auth → 401", async () => {
      const r = await fetch(`${BASE}/api/venues`, {
        signal: AbortSignal.timeout(8000),
      });
      expect([401, 403]).toContain(r.status);
    });
    it("GET /api/radio-pitches without auth → 401", async () => {
      const r = await fetch(`${BASE}/api/radio-pitches`, {
        signal: AbortSignal.timeout(8000),
      });
      expect([401, 403]).toContain(r.status);
    });
    it("GET /api/label-submissions without auth → 401", async () => {
      const r = await fetch(`${BASE}/api/label-submissions`, {
        signal: AbortSignal.timeout(8000),
      });
      expect([401, 403]).toContain(r.status);
    });
  });
});
