import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";

const testUser = {
  email: `directupload_${Date.now()}@maxbooster-test.invalid`,
  password: "SecurePass123!@#",
  firstName: "Direct",
  lastName: "Upload",
};

let authCookies = "";
let csrfToken = "";
let uploadedFileKey = "";
const uploadPayload = Buffer.from("direct-upload-smoke");

async function api(
  method: string,
  path: string,
  body?: FormData | Record<string, unknown> | Buffer,
  extraHeaders?: Record<string, string>,
) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (
    body &&
    !(body instanceof FormData) &&
    !Buffer.isBuffer(body) &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] = "application/json";
  }
  if (authCookies) headers["Cookie"] = authCookies;
  const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
  if (csrfToken && MUTATION_METHODS.includes(method.toUpperCase()) && !headers["x-csrf-token"]) {
    headers["x-csrf-token"] = csrfToken;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body:
      body instanceof FormData
        ? body
        : Buffer.isBuffer(body)
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
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
  body?: FormData | Record<string, unknown> | Buffer,
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

describe("Direct upload URL flow", () => {
  it("1. registers and logs in a test user", async () => {
    await apiJson("POST", "/api/auth/register", testUser);
    const r = await apiJson("POST", "/api/auth/login", {
      email: testUser.email,
      password: testUser.password,
    });
    expect(r.status).toBe(200);
    expect(authCookies).toBeTruthy();
  });

  it("2. issues a reserved direct upload URL", async () => {
    const r = await apiJson("POST", "/api/uploads/request-url", {
      name: "direct-test.wav",
      size: uploadPayload.length,
      contentType: "audio/wav",
      category: "audio",
    });

    if (r.status === 403) {
      console.warn("[DirectUploadTest] Upload reservation blocked by subscription gate");
      return;
    }

    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(typeof body.uploadURL).toBe("string");
    expect(typeof body.objectPath).toBe("string");
    uploadedFileKey = body.objectPath as string;
  });

  it("3. uploads the reserved bytes and persists the file", async () => {
    if (!uploadedFileKey) {
      console.warn("[DirectUploadTest] No reserved key — skipping upload test");
      return;
    }

    const reservation = await apiJson("POST", "/api/uploads/request-url", {
      name: "direct-test.wav",
      size: uploadPayload.length,
      contentType: "audio/wav",
      category: "audio",
    });

    expect(reservation.status).toBe(200);
    const reserved = reservation.json as Record<string, unknown>;
    const uploadPath = reserved.uploadURL as string;
    uploadedFileKey = reserved.objectPath as string;

    const putRes = await api(
      "PUT",
      uploadPath,
      uploadPayload,
      { "Content-Type": "audio/wav" },
    );
    expect(putRes.status).toBe(200);

    const downloadRes = await api("GET", `/api/storage/file/${uploadedFileKey}`);
    expect([200, 206]).toContain(downloadRes.status);
    const bytes = Buffer.from(await downloadRes.arrayBuffer());
    expect(bytes).toEqual(uploadPayload);
  });

  it("4. rejects reusing the same upload URL", async () => {
    const reservation = await apiJson("POST", "/api/uploads/request-url", {
      name: "single-use.wav",
      size: uploadPayload.length,
      contentType: "audio/wav",
      category: "audio",
    });

    expect(reservation.status).toBe(200);
    const reserved = reservation.json as Record<string, unknown>;
    const uploadPath = reserved.uploadURL as string;

    const first = await api("PUT", uploadPath, uploadPayload, {
      "Content-Type": "audio/wav",
    });
    expect(first.status).toBe(200);

    const second = await api("PUT", uploadPath, uploadPayload, {
      "Content-Type": "audio/wav",
    });
    expect(second.status).toBe(409);
  });
});
