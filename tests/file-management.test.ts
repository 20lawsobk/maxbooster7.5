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

import { provisionFixtureEntitlement } from "./helpers-http-fixture";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";

const testUser = {
  birthdate: "1990-01-01",
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
    const registered = await apiJson("POST", "/api/auth/register", testUser);
    expect(registered.status).toBe(200);
    await provisionFixtureEntitlement(testUser.email);
    const r = await apiJson("POST", "/api/auth/login", {
      email: testUser.email,
      password: testUser.password,
    });
    expect(r.status).toBe(200);
    expect(authCookies).toContain("sessionId=");
    const session = await apiJson("GET", "/api/auth/me");
    expect(session.status).toBe(200);
    expect(session.json).toMatchObject({ email: testUser.email });
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

  it("isolates private hybrid bytes on both download routes", async () => {
    const form = new FormData();
    form.append("file", new Blob([uploadPayload], { type: "audio/wav" }), "private-hybrid.wav");
    const uploaded = await apiJson("POST", "/api/hybrid-storage/upload", form);
    expect(uploaded.status).toBe(200);
    const key = (uploaded.json as { key: string }).key;
    expect(key).toBeTruthy();
    const canonicalPath = "/api/storage/file/" + key.split("/").map(encodeURIComponent).join("/");
    const own = await api("GET", canonicalPath);
    expect(own.status).toBe(200);
    expect(Buffer.from(await own.arrayBuffer())).toEqual(uploadPayload);
    const ownerCookies = authCookies, ownerCsrf = csrfToken;
    try {
      authCookies = "";
      csrfToken = "";
      const stranger = { ...testUser, email: `hybrid_other_${Date.now()}@maxbooster-test.invalid` };
      const strangerHeaders = { "x-maxbooster-fixture-client": "foreign-hybrid-owner" };
      expect((await apiJson("POST", "/api/auth/register", stranger, strangerHeaders)).status).toBe(200);
      await provisionFixtureEntitlement(stranger.email);
      expect((await api("GET", "/api/auth/me", undefined, strangerHeaders)).status).toBe(200);
      const denied = await api("GET", canonicalPath, undefined, strangerHeaders);
      expect(denied.status).toBe(403);
      expect(await denied.text()).not.toContain(uploadPayload.toString());
      expect((await api("GET", "/api/hybrid-storage/file/" + encodeURIComponent(key), undefined, strangerHeaders)).status).toBe(403);
    } finally {
      authCookies = ownerCookies;
      csrfToken = ownerCsrf;
      expect((await api("DELETE", "/api/hybrid-storage/file/" + encodeURIComponent(key))).status).toBe(200);
    }
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
    expect(uploadedFileKey, "The upload must succeed before file lifecycle checks").toBeTruthy();
    const res = await api("GET", `/api/storage/file/${uploadedFileKey}`);

    expect(res.status).toBe(200);

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

  it("6. deletes the uploaded file and returns success", async () => {
    expect(uploadedFileKey, "The upload must succeed before file lifecycle checks").toBeTruthy();
    const r = await apiJson("DELETE", `/api/storage/file/${uploadedFileKey}`);
    // 200 = deleted, 403 = subscription gate blocked delete, 404 = file not tracked in DB
    expect(r.status).toBe(200);

    if (r.status === 200) {
      const body = r.json as Record<string, unknown>;
      expect(body.success).toBe(true);
    }
  });

  it("7. GET of a deleted file returns 404", async () => {
    expect(uploadedFileKey, "The upload must succeed before file lifecycle checks").toBeTruthy();
    // If the delete in test 6 didn't return 200, this test is informational only
    const res = await api("GET", `/api/storage/file/${uploadedFileKey}`);
    // 404 expected after delete; 403 if the delete was blocked and file still exists
    expect(res.status).toBe(404);
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
    expect(r.status).toBe(200);
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
      undefined, { "x-maxbooster-fixture-client": "hostile-double-encoding" },
    );
    expect([400, 403, 404]).toContain(r.status);
  });

  it("10b. literal '..' segments in file key are rejected (never 200)", async () => {
    const r = await api("GET", "/api/storage/file/users/x/../../etc/passwd", undefined,
      { "x-maxbooster-fixture-client": "hostile-traversal" });
    expect([400, 403, 404]).toContain(r.status);
  });

  it("10c. backslash and encoded-NUL keys are rejected (never 200)", async () => {
    const r1 = await api("GET", "/api/storage/file/users%5Cx%5Csecrets", undefined,
      { "x-maxbooster-fixture-client": "hostile-backslash" });
    expect([400, 403, 404]).toContain(r1.status);
    const r2 = await api("GET", "/api/storage/file/users%2Fx%2Ffile%00.wav", undefined,
      { "x-maxbooster-fixture-client": "hostile-nul" });
    expect([400, 403, 404]).toContain(r2.status);
  });

  it("10d. restore of the deleted file makes it downloadable again", async () => {
    expect(uploadedFileKey, "A prior create/upload step must have succeeded").toBeTruthy();
    const restore = await apiJson(
      "POST",
      `/api/storage/restore/${encodeURIComponent(uploadedFileKey)}`,
    );
    expect(restore.status).toBe(200);
    const r = await api("GET", `/api/storage/file/${encodeURIComponent(uploadedFileKey)}`);
    expect(r.status).toBe(200);
    expect(Buffer.from(await r.arrayBuffer())).toEqual(uploadPayload);
    const removed = await api("DELETE", `/api/storage/file/${encodeURIComponent(uploadedFileKey)}`);
    expect(removed.status).toBe(200);
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
