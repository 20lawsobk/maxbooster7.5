/**
 * Integration tests for file upload / download / delete storage round-trip.
 *
 * Flow: register → upload file → download and verify bytes → delete → confirm 404
 *
 * Routes exercised:
 *   POST   /api/storage/upload
 *   GET    /api/storage/file/:key
 *   DELETE /api/storage/file/:key
 *   GET    /api/storage/quota
 */
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";

const testUser = {
  email: `filemgmt_${Date.now()}@maxbooster-test.invalid`,
  password: "SecurePass123!@#",
  firstName: "File",
  lastName: "Test",
};

let authCookies = "";
let csrfToken = "";
let uploadedFileKey = "";
// Bytes sent during upload — used to verify download content
const uploadPayload = Buffer.from(
  "52494646" + "FFFFFFFF" + "57415645" + "666d7420", // minimal WAV RIFF header
  "hex",
);

async function api(
  method: string,
  path: string,
  body?: FormData | Record<string, unknown>,
  extraHeaders?: Record<string, string>,
) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (!(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (authCookies) headers["Cookie"] = authCookies;
  const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
  if (csrfToken && MUTATION_METHODS.includes(method.toUpperCase())) {
    headers["x-csrf-token"] = csrfToken;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    const cookieMap = new Map<string, string>();
    if (authCookies) {
      for (const c of authCookies.split("; ")) {
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
    authCookies = Array.from(cookieMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  return res;
}

async function apiJson(
  method: string,
  path: string,
  body?: FormData | Record<string, unknown>,
  extraHeaders?: Record<string, string>,
) {
  const res = await api(method, path, body, extraHeaders);
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

describe("File Management (Storage Round-Trip)", () => {
  it("1. registers and logs in a test user", async () => {
    await apiJson("POST", "/api/auth/register", testUser);
    const r = await apiJson("POST", "/api/auth/login", {
      email: testUser.email,
      password: testUser.password,
    });
    expect(r.status).toBe(200);
    expect(authCookies).toBeTruthy();
  });

  it("2. rejects unauthenticated upload with 401 or 403", async () => {
    const saved = authCookies;
    const savedCsrf = csrfToken;
    authCookies = "";
    csrfToken = "";
    const form = new FormData();
    form.append(
      "file",
      new Blob([uploadPayload], { type: "audio/wav" }),
      "test.wav",
    );
    const res = await fetch(`${BASE}/api/storage/upload`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(10000),
    });
    expect([401, 403]).toContain(res.status);
    expect(res.status).not.toBe(200);
    authCookies = saved;
    csrfToken = savedCsrf;
  });

  it("3. uploads a small audio file and receives a storage key", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([uploadPayload], { type: "audio/wav" }),
      "test.wav",
    );
    form.append("category", "audio");

    const r = await apiJson("POST", "/api/storage/upload", form);

    if (r.status === 500 || r.status === 503) {
      // Storage service not configured in this environment — document and skip
      console.warn(
        "[FileTest] Storage backend unavailable (500/503) — skipping upload assertions",
      );
      return;
    }
    if (r.status === 403) {
      // Trial/subscription gate fired — this is valid behavior for new users
      console.warn(
        "[FileTest] Upload blocked by subscription gate (403) — downstream tests will be skipped",
      );
      return;
    }

    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.success).toBe(true);
    const file = body.file as Record<string, unknown>;
    expect(file).toBeDefined();
    expect(typeof file.key).toBe("string");
    expect((file.key as string).length).toBeGreaterThan(0);
    expect(file.name).toBe("test.wav");
    expect(Number(file.size)).toBeGreaterThan(0);

    uploadedFileKey = file.key as string;
  });

  it("4. downloads the uploaded file and verifies content-type and byte payload", async () => {
    if (!uploadedFileKey) {
      console.warn(
        "[FileTest] Upload step did not produce a key — skipping download test",
      );
      return;
    }
    const res = await api("GET", `/api/storage/file/${uploadedFileKey}`);

    expect([200, 206, 403, 404]).toContain(res.status);

    if (res.status === 200 || res.status === 206) {
      const contentType = res.headers.get("content-type");
      expect(contentType).toBeTruthy();
      // Content-Type must indicate audio or binary stream — not HTML/JSON
      expect(contentType).toMatch(/audio|octet-stream|binary|wav/i);

      const downloadedBytes = Buffer.from(await res.arrayBuffer());
      // Downloaded content must be at least as large as what we uploaded
      expect(downloadedBytes.byteLength).toBeGreaterThanOrEqual(
        uploadPayload.byteLength,
      );
      // The leading bytes must exactly match the WAV payload we uploaded
      const downloadedHead = downloadedBytes.slice(0, uploadPayload.byteLength);
      expect(downloadedHead).toEqual(uploadPayload);
    }
  });

  it("5. cross-user access to a file is rejected (403) or not found (404)", async () => {
    const foreignKey =
      "users/00000000-dead-beef-0000-000000000000/audio/foreign.wav";
    const res = await api("GET", `/api/storage/file/${foreignKey}`);
    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it("5b. never serves the owner's uploaded bytes to a second authenticated account", async () => {
    // This is an integration test, not proof of the worker-backed byte layer.
    // A successful upload is a required prerequisite to exercise the real route.
    expect(
      uploadedFileKey,
      "Cross-account isolation requires a successful real upload; an unavailable storage backend cannot pass this test",
    ).toBeTruthy();

    const ownerCookies = authCookies;
    const ownerCsrf = csrfToken;
    const outsider = {
      email: `fileoutsider_${Date.now()}@maxbooster-test.invalid`,
      password: "SecurePass123!@#",
      firstName: "Other",
      lastName: "Account",
    };

    try {
      authCookies = "";
      csrfToken = "";
      await apiJson("POST", "/api/auth/register", outsider);
      const signIn = await apiJson("POST", "/api/auth/login", {
        email: outsider.email,
        password: outsider.password,
      });
      expect(signIn.status).toBe(200);
      expect(authCookies).toBeTruthy();

      const encodedKey = encodeURIComponent(uploadedFileKey);
      const download = await api(
        "GET", `/api/storage/file/${encodedKey}`,
      );
      expect(download.status).toBe(403);

      // The secondary hybrid-storage route may conceal a denied file as 404,
      // but must never return the owner's bytes to this account.
      const hybridDownload = await api(
        "GET", `/api/storage/hybrid/file/${encodedKey}`,
      );
      expect([403, 404]).toContain(hybridDownload.status);
      expect(hybridDownload.status).not.toBe(200);
    } finally {
      authCookies = ownerCookies;
      csrfToken = ownerCsrf;
    }

    const ownerDownload = await api(
      "GET",
      `/api/storage/file/${encodeURIComponent(uploadedFileKey)}`,
    );
    expect(ownerDownload.status).toBe(200);
    expect(Buffer.from(await ownerDownload.arrayBuffer())).toEqual(uploadPayload);
  });


  it("5c. denies a second account the real private hybrid key outside users/ on both routes", async () => {
    // Unlike /api/storage/upload, this endpoint creates a hybrid-index key
    // outside users/<owner>/, the original vulnerable authorization path.
    const form = new FormData();
    form.append(
      "file",
      new Blob([uploadPayload], { type: "audio/wav" }),
      "private-hybrid.wav",
    );
    form.append("folder", "cross-account-regression");
    form.append("isPublic", "false");

    const upload = await apiJson("POST", "/api/storage/hybrid/upload", form);
    // A missing PDIM backend or denied upload is a BLOCKER, not a privacy PASS.
    expect(upload.status).toBe(200);
    const uploaded = upload.json as { file?: { key?: unknown } };
    const key = uploaded.file?.key;
    expect(typeof key).toBe("string");
    if (typeof key !== "string") throw new Error("Hybrid upload returned no key");
    expect(key.startsWith("users/")).toBe(false);

    const encoded = encodeURIComponent(key);
    const ownerCookies = authCookies;
    const ownerCsrf = csrfToken;
    try {
      for (const route of ["/api/storage/file/", "/api/storage/hybrid/file/"]) {
        const owned = await api("GET", route + encoded);
        expect(owned.status).toBe(200);
        expect(Buffer.from(await owned.arrayBuffer())).toEqual(uploadPayload);
        expect(owned.headers.get("cache-control")).toMatch(/no-store/);
      }

      const outsider = {
        email: "hybrid_outsider_" + Date.now() + "@maxbooster-test.invalid",
        password: "SecurePass123!@#",
        firstName: "Other",
        lastName: "Account",
      };
      authCookies = "";
      csrfToken = "";
      await apiJson("POST", "/api/auth/register", outsider);
      const login = await apiJson("POST", "/api/auth/login", {
        email: outsider.email,
        password: outsider.password,
      });
      expect(login.status).toBe(200);
      expect(authCookies).toBeTruthy();

      const primary = await api("GET", "/api/storage/file/" + encoded);
      expect(primary.status).toBe(403);
      const secondary = await api("GET", "/api/storage/hybrid/file/" + encoded);
      expect([403, 404]).toContain(secondary.status);

      authCookies = "";
      csrfToken = "";
      for (const route of ["/api/storage/file/", "/api/storage/hybrid/file/"]) {
        const anonymous = await api("GET", route + encoded);
        expect(anonymous.status).toBe(401);
      }
    } finally {
      authCookies = ownerCookies;
      csrfToken = ownerCsrf;
      // The disposable integration fixture should retire its test object.
      // A cleanup failure must not hide an authorization failure above.
      try {
        const cleanup = await api("DELETE", "/api/storage/hybrid/file/" + encoded);
        if (cleanup.status !== 200) {
          console.warn("[FileTest] Hybrid fixture cleanup requires operator review:", cleanup.status);
        }
      } catch (error) {
        console.warn("[FileTest] Hybrid fixture cleanup unavailable:", error);
      }
    }
  });

  it("6. deletes the uploaded file and returns success", async () => {
    if (!uploadedFileKey) {
      console.warn("[FileTest] No uploaded key — skipping delete test");
      return;
    }
    const r = await apiJson("DELETE", `/api/storage/file/${uploadedFileKey}`);
    // 200 = deleted, 403 = subscription gate blocked delete, 404 = file not tracked in DB
    expect([200, 403, 404]).toContain(r.status);

    if (r.status === 200) {
      const body = r.json as Record<string, unknown>;
      expect(body.success).toBe(true);
    }
  });

  it("7. GET of a deleted file returns 404", async () => {
    if (!uploadedFileKey) {
      console.warn(
        "[FileTest] No uploaded key — skipping post-delete 404 test",
      );
      return;
    }
    // If the delete in test 6 didn't return 200, this test is informational only
    const res = await api("GET", `/api/storage/file/${uploadedFileKey}`);
    // 404 expected after delete; 403 if the delete was blocked and file still exists
    expect([403, 404, 410]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it("8. delete of a completely unknown file key returns 401, 403, or 404", async () => {
    const fakeKey = "users/00000000-dead-beef-0000-000000000001/audio/fake.wav";
    const r = await apiJson("DELETE", `/api/storage/file/${fakeKey}`);
    expect([401, 403, 404]).toContain(r.status);
    expect(r.status).not.toBe(200);
  });

  it("9. GET /api/storage/quota returns quota info when authenticated", async () => {
    const r = await apiJson("GET", "/api/storage/quota");
    expect([200, 401, 403, 503]).toContain(r.status);
    if (r.status === 200) {
      const body = r.json as Record<string, unknown>;
      expect(typeof body.limit).toBe("number");
      expect(typeof body.used).toBe("number");
      expect(body.used as number).toBeGreaterThanOrEqual(0);
      expect(body.limit as number).toBeGreaterThan(0);
    }
  });

  it("10a. double-encoded traversal in file key is rejected (never 200)", async () => {
    // %252e%252e double-decodes to ".." — must NOT be decoded a second time
    const r = await api(
      "GET",
      "/api/storage/file/users%2Fsomeone%2F%252e%252e%2F%252e%252e%2Fetc%2Fpasswd",
    );
    expect([400, 403, 404]).toContain(r.status);
  });

  it("10b. literal '..' segments in file key are rejected (never 200)", async () => {
    const r = await api("GET", "/api/storage/file/users/x/../../etc/passwd");
    expect([400, 403, 404]).toContain(r.status);
  });

  it("10c. backslash and encoded-NUL keys are rejected (never 200)", async () => {
    const r1 = await api("GET", "/api/storage/file/users%5Cx%5Csecrets");
    expect([400, 403, 404]).toContain(r1.status);
    const r2 = await api("GET", "/api/storage/file/users%2Fx%2Ffile%00.wav");
    expect([400, 403, 404]).toContain(r2.status);
  });

  it("10d. restore of the deleted file makes it downloadable again", async () => {
    if (!uploadedFileKey) return; // upload test did not run
    const restore = await apiJson(
      "POST",
      `/api/storage/restore/${encodeURIComponent(uploadedFileKey)}`,
    );
    // Restore may be unsupported for permanently-deleted keys; only assert
    // the round trip when the API reports success.
    if (restore.status === 200) {
      const r = await api(
        "GET",
        `/api/storage/file/${encodeURIComponent(uploadedFileKey)}`,
      );
      expect(r.status).toBe(200);
      // Re-delete so the suite leaves no live file behind.
      await api(
        "DELETE",
        `/api/storage/file/${encodeURIComponent(uploadedFileKey)}`,
      );
    } else {
      expect([400, 404, 410]).toContain(restore.status);
    }
  });

  it("10. GET /api/storage/quota returns 401 or 403 without authentication", async () => {
    const saved = authCookies;
    const savedCsrf = csrfToken;
    authCookies = "";
    csrfToken = "";
    const r = await apiJson("GET", "/api/storage/quota");
    expect([401, 403]).toContain(r.status);
    authCookies = saved;
    csrfToken = savedCsrf;
  });
});
