import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE = "http://localhost:5000";
let cookies = "";
let csrfToken = "";
let testUserId = "";
const testUser = {
  email: `test_${Date.now()}@maxbooster-test.com`,
  password: "SecurePass123!",
  username: `TestUser_${Date.now()}`,
  firstName: "Test",
  lastName: "User",
};

async function api(
  method: string,
  path: string,
  body?: any,
  useCookies = true,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (useCookies && cookies) {
    headers["Cookie"] = cookies;
  }
  const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
  if (csrfToken && MUTATION_METHODS.includes(method.toUpperCase())) {
    headers["x-csrf-token"] = csrfToken;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  if (setCookie.length) {
    // Merge: don't replace — rolling session may only refresh sessionId without
    // re-sending csrf-token (generateCsrfToken skips if cookie already present)
    const cookieMap = new Map<string, string>();
    if (cookies) {
      for (const c of cookies.split("; ")) {
        const idx = c.indexOf("=");
        if (idx > 0) cookieMap.set(c.slice(0, idx), c.slice(idx + 1));
      }
    }
    for (const c of setCookie) {
      const pair = c.split(";")[0];
      const idx = pair.indexOf("=");
      if (idx > 0) {
        const name = pair.slice(0, idx);
        const val = pair.slice(idx + 1);
        cookieMap.set(name, val);
        if (name === "csrf-token") csrfToken = val;
      }
    }
    cookies = Array.from(cookieMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

describe("Critical Path Tests - Production Readiness", () => {
  describe("1. User Registration & Authentication", () => {
    it("should register a new user", async () => {
      const res = await api("POST", "/api/auth/register", testUser);
      expect(res.status).toBe(200);
      expect(res.json.id).toBeDefined();
      expect(res.json.email).toBe(testUser.email);
      expect(res.json.password).toBeUndefined();
      testUserId = res.json.id;
    });

    it("should reject duplicate email registration", async () => {
      const res = await api("POST", "/api/auth/register", testUser);
      expect(res.status).toBe(400);
      expect(res.json.message).toContain("already");
    });

    it("should reject invalid email format", async () => {
      const res = await api("POST", "/api/auth/register", {
        ...testUser,
        email: "bademail",
      });
      expect(res.status).toBe(400);
    });

    it("should reject short password", async () => {
      const res = await api("POST", "/api/auth/register", {
        ...testUser,
        email: "short@test.com",
        password: "12345",
      });
      expect(res.status).toBe(400);
    });

    it("should login with correct credentials", async () => {
      const res = await api("POST", "/api/auth/login", {
        username: testUser.username,
        password: testUser.password,
      });
      expect(res.status).toBe(200);
      expect(res.json.id).toBe(testUserId);
    });

    it("should reject login with wrong password", async () => {
      const res = await api("POST", "/api/auth/login", {
        username: testUser.username,
        password: "WrongPassword!",
      });
      expect(res.status).toBe(401);
    });

    it("should return user from /api/auth/me when authenticated", async () => {
      const res = await api("GET", "/api/auth/me");
      expect(res.status).toBe(200);
      expect(res.json.id).toBe(testUserId);
      expect(res.json.password).toBeUndefined();
      expect(res.json.twoFactorSecret).toBeUndefined();
    });

    it("should return null from /api/auth/me when unauthenticated", async () => {
      const res = await api("GET", "/api/auth/me", undefined, false);
      expect(res.status).toBe(200);
      expect(res.json).toBeNull();
    });
  });

  describe("2. Profile Management", () => {
    it("should get user profile", async () => {
      const res = await api("GET", "/api/auth/profile");
      expect(res.status).toBe(200);
      expect(res.json.firstName).toBeDefined();
    });

    it("should update profile", async () => {
      const res = await api("PUT", "/api/auth/profile", {
        firstName: "Updated",
        lastName: "Name",
        bio: "Test artist bio",
      });
      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
    });

    it("should strip XSS from profile fields", async () => {
      await api("PUT", "/api/auth/profile", {
        firstName: '<script>alert("xss")</script>Legit',
        bio: '<img onerror="hack()" src="x">Clean bio',
      });
      const profile = await api("GET", "/api/auth/profile");
      if (profile.json.firstName != null)
        expect(profile.json.firstName).not.toContain("<script>");
      if (profile.json.bio != null)
        expect(profile.json.bio).not.toContain("<img");
    });
  });

  describe("3. Distribution - Core Paid Feature", () => {
    let releaseId: string;

    it("should list distribution platforms", async () => {
      const res = await api("GET", "/api/distribution/platforms");
      expect(res.status).toBe(200);
      expect(res.json.platforms).toBeDefined();
      expect(Array.isArray(res.json.platforms)).toBe(true);
      expect(res.json.platforms.length).toBeGreaterThan(0);
    });

    it("should create a release", async () => {
      const res = await api("POST", "/api/distribution/releases", {
        title: "Test Single",
        artistName: "Test Artist",
        releaseType: "single",
        primaryGenre: "Hip Hop",
        language: "en",
        copyrightYear: 2026,
        copyrightOwner: "Test Artist",
      });
      expect(res.status).toBe(200);
      expect(res.json.id).toBeDefined();
      expect(res.json.title).toBe("Test Single");
      releaseId = res.json.id;
    });

    it("should reject release with missing required fields", async () => {
      const res = await api("POST", "/api/distribution/releases", {
        title: "Incomplete",
      });
      expect(res.status).toBe(400);
    });

    it("should list user releases", async () => {
      const res = await api("GET", "/api/distribution/releases");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json)).toBe(true);
      const found = res.json.find((r: any) => r.id === releaseId);
      expect(found).toBeDefined();
    });

    it("should get earnings summary", async () => {
      const res = await api("GET", "/api/distribution/earnings/summary");
      expect(res.status).toBe(200);
    });

    it("should get HyperFollow links", async () => {
      const res = await api("GET", "/api/distribution/hyperfollow");
      expect(res.status).toBe(200);
    });
  });

  describe("4. Social Media Management", () => {
    let postId: string;

    it("should schedule a post", async () => {
      const res = await api("POST", "/api/social/schedule-post", {
        platform: "instagram",
        content: "Test post content #newmusic",
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      });
      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
      expect(res.json.post.status).toBe("scheduled");
      postId = res.json.post.id;
    });

    it("should reject post without required fields", async () => {
      const res = await api("POST", "/api/social/schedule-post", {
        platform: "instagram",
      });
      expect(res.status).toBe(400);
    });

    it("should list user posts", async () => {
      const res = await api("GET", "/api/social/posts");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json)).toBe(true);
    });

    it("should publish a scheduled post", async () => {
      const res = await api("POST", `/api/social/calendar/${postId}/publish`);
      expect(res.status).toBe(200);
      expect(res.json.post.status).toBe("published");
    });

    it("should reject publishing non-existent post", async () => {
      const res = await api(
        "POST",
        "/api/social/calendar/nonexistent-id/publish",
      );
      expect(res.status).toBe(404);
    });

    it("should get social metrics", async () => {
      const res = await api("GET", "/api/social/metrics");
      expect(res.status).toBe(200);
      expect(res.json.totalFollowers).toBeDefined();
    });

    it("should get trending hashtags", async () => {
      const res = await api("GET", "/api/social/hashtags/trending");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json)).toBe(true);
      // May be empty for a fresh test user with no social data
      if (res.json.length > 0) {
        expect(res.json[0].hashtag).toBeDefined();
        expect(res.json[0].trend).toBeDefined();
      }
    });

    it("should get inbox messages", async () => {
      const res = await api("GET", "/api/social/inbox");
      expect(res.status).toBe(200);
    });

    it("should generate AI content", async () => {
      const res = await api("POST", "/api/social/generate-content", {
        platforms: ["instagram"],
        topic: "new single release",
      });
      // 200 with content when MaxCore generates; 503 AI_UNAVAILABLE when all
      // platform generations fail (fail-explicit contract — no silent 200).
      expect([200, 503]).toContain(res.status);
      if (res.status === 503) {
        expect(res.json?.error).toBe("AI_UNAVAILABLE");
      }
    });
  });

  describe("5. Billing & Payments", () => {
    it("should get subscription status", async () => {
      const res = await api("GET", "/api/billing/subscription");
      expect(res.status).toBe(200);
    });

    it("should list billing plans", async () => {
      const res = await api("GET", "/api/billing/plans");
      expect(res.status).toBe(200);
    });

    it("should get billing history", async () => {
      const res = await api("GET", "/api/billing/history");
      expect(res.status).toBe(200);
    });

    it("should get invoices", async () => {
      const res = await api("GET", "/api/billing/invoices");
      expect(res.status).toBe(200);
    });
  });

  describe("6. Studio - DAW Features", () => {
    it("should list projects", async () => {
      const res = await api("GET", "/api/studio/projects");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json)).toBe(true);
    });

    it("should get sample library", async () => {
      const res = await api("GET", "/api/studio/samples");
      expect(res.status).toBe(200);
      expect(res.json.samples).toBeDefined();
      expect(res.json.samples.length).toBeGreaterThan(0);
    });

    it("should get project templates", async () => {
      const res = await api("GET", "/api/studio/templates");
      expect(res.status).toBe(200);
      expect(res.json.templates).toBeDefined();
    });
  });

  describe("7. Search & Discovery", () => {
    it("should perform unified search", async () => {
      const res = await api("GET", "/api/search/unified?q=music");
      expect(res.status).toBe(200);
      expect(res.json.query).toBe("music");
      expect(res.json.categories).toBeDefined();
    });

    it("should handle empty search gracefully", async () => {
      const res = await api("GET", "/api/search/unified?q=");
      expect(res.status).toBe(200);
    });
  });

  describe("8. Career Coach", () => {
    it("should get recommendations", async () => {
      const res = await api("GET", "/api/career-coach/recommendations");
      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
      expect(res.json.data.recommendations).toBeDefined();
    });

    it("should get goals", async () => {
      const res = await api("GET", "/api/career-coach/goals");
      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
    });
  });

  describe("9. Contracts & Collaborations", () => {
    it("should list contract templates", async () => {
      const res = await api("GET", "/api/contracts/templates");
      expect(res.status).toBe(200);
      expect(res.json.templates).toBeDefined();
      expect(res.json.templates.length).toBeGreaterThan(0);
    });

    it("should list collaboration connections", async () => {
      const res = await api("GET", "/api/collaborations/connections");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json)).toBe(true);
    });
  });

  describe("10. Analytics", () => {
    it("should get analytics dashboard", async () => {
      const res = await api("GET", "/api/analytics/dashboard");
      expect(res.status).toBe(200);
      expect(res.json.overview).toBeDefined();
      expect(res.json.streams).toBeDefined();
      expect(res.json.revenue).toBeDefined();
    });
  });

  describe("11. Security", () => {
    it("should provide CSRF token", async () => {
      const res = await api("GET", "/api/csrf-token");
      expect(res.status).toBe(200);
      expect(res.json.csrfToken).toBeDefined();
    });

    it("should reject malformed JSON", async () => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad json",
      });
      expect(res.status).toBe(400);
    });

    it("should handle SQL injection attempt safely", async () => {
      const res = await api(
        "GET",
        "/api/search/unified?q='; DROP TABLE users; --",
      );
      expect([200, 400]).toContain(res.status);
    });

    it("should return 404 for non-existent API routes", async () => {
      const res = await api("GET", "/api/nonexistent-endpoint");
      expect(res.status).toBe(404);
    });
  });

  describe("12. OAuth Connection Graceful Failures", () => {
    it("should return error for unsupported platform", async () => {
      const res = await api("POST", "/api/social/connect/nonexistent");
      expect(res.status).toBe(400);
      expect(res.json.message || res.json.error).toBeDefined();
    });
  });

  describe("13. Logout", () => {
    it("should logout successfully", async () => {
      const res = await api("POST", "/api/auth/logout");
      expect(res.status).toBe(200);
    });

    it("should not access protected routes after logout", async () => {
      cookies = "";
      const res = await api("GET", "/api/auth/notifications");
      expect(res.status).toBe(401);
    });
  });
});
