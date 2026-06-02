/**
 * Integration tests for two-factor authentication (TOTP/2FA).
 * Covers: setup → verify → login-with-2FA → disable → login-without-2FA.
 *
 * Note: otplib v12 uses functional API: generateSync({ secret, strategy: 'totp' })
 * and verifySync({ token, secret, strategy: 'totp' }) returns { valid: boolean }.
 */
import { describe, it, expect } from "vitest";
import { generateSecret, generateSync, verifySync } from "otplib";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";

const testUser = {
  email: `twofa_${Date.now()}@maxbooster-test.invalid`,
  password: "SecurePass123!@#",
  firstName: "2FA",
  lastName: "Test",
};

let authCookies = "";
let csrfToken = "";
let totpSecret = "";

async function api(
  method: string,
  path: string,
  body?: Record<string, unknown>,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authCookies) headers["Cookie"] = authCookies;
  const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
  if (csrfToken && MUTATION_METHODS.includes(method.toUpperCase())) {
    headers["x-csrf-token"] = csrfToken;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
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
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

/** Generate a TOTP code using the otplib v12 functional API. */
function genCode(secret: string): string {
  return generateSync({ secret, strategy: "totp" }) as string;
}

/** Verify a TOTP code using the otplib v12 functional API. */
function checkCode(token: string, secret: string): boolean {
  const result = verifySync({ token, secret, strategy: "totp" }) as {
    valid: boolean;
  };
  return result?.valid ?? false;
}

describe("2FA Flow (TOTP)", () => {
  it("1. registers a new user", async () => {
    const r = await api("POST", "/api/auth/register", testUser);
    expect(r.status).toBe(200);
  });

  it("2. logs in with password only (no 2FA yet)", async () => {
    const r = await api("POST", "/api/auth/login", {
      email: testUser.email,
      password: testUser.password,
    });
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.requiresTwoFactor).toBeUndefined();
    expect(authCookies).toBeTruthy();
  });

  it("3. GET /api/auth/2fa/status shows 2FA is disabled", async () => {
    const r = await api("GET", "/api/auth/2fa/status");
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.enabled).toBe(false);
  });

  it("4. POST /api/auth/2fa/setup returns secret and QR code", async () => {
    const r = await api("POST", "/api/auth/2fa/setup");
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(typeof body.secret).toBe("string");
    expect((body.secret as string).length).toBeGreaterThan(0);
    expect(typeof body.qrCode).toBe("string");
    expect(body.qrCode as string).toMatch(/^data:image\//);
    expect(typeof body.otpauthUrl).toBe("string");
    totpSecret = body.secret as string;
    // Verify our local TOTP library can generate valid codes for this secret
    const code = genCode(totpSecret);
    expect(code).toMatch(/^\d{6}$/);
    expect(checkCode(code, totpSecret)).toBe(true);
  });

  it("5. POST /api/auth/2fa/verify with a valid TOTP code enables 2FA", async () => {
    if (!totpSecret) throw new Error("No TOTP secret from setup step");
    const code = genCode(totpSecret);
    const r = await api("POST", "/api/auth/2fa/verify", { code });
    // Server accepts the code and enables 2FA
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.success).toBe(true);
  });

  it("6. POST /api/auth/2fa/verify rejects missing code (400)", async () => {
    const r = await api("POST", "/api/auth/2fa/verify", {});
    expect(r.status).toBe(400);
  });

  it("7. GET /api/auth/2fa/status shows 2FA is now enabled", async () => {
    const r = await api("GET", "/api/auth/2fa/status");
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.enabled).toBe(true);
  });

  it("8. logout succeeds", async () => {
    const r = await api("POST", "/api/auth/logout");
    expect([200, 204]).toContain(r.status);
    authCookies = "";
    csrfToken = "";
  });

  it("9. login with password alone returns requiresTwoFactor:true when 2FA is enabled", async () => {
    const r = await api("POST", "/api/auth/login", {
      email: testUser.email,
      password: testUser.password,
    });
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.requiresTwoFactor).toBe(true);
    // The full user object (with id) should NOT be returned yet
    expect(body.id).toBeUndefined();
  });

  it("10. login with password + valid TOTP code fully authenticates", async () => {
    if (!totpSecret) throw new Error("No TOTP secret from setup step");
    const code = genCode(totpSecret);
    const r = await api("POST", "/api/auth/login", {
      email: testUser.email,
      password: testUser.password,
      twoFactorCode: code,
    });
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.requiresTwoFactor).toBeUndefined();
    expect(body.id).toBeDefined();
    expect(body.email).toBe(testUser.email);
    expect(authCookies).toBeTruthy();
  });

  it("11. GET /api/auth/me confirms full session is active after 2FA login", async () => {
    const r = await api("GET", "/api/auth/me");
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body).not.toBeNull();
    expect(body.email).toBe(testUser.email);
    // Sensitive fields must be stripped
    expect(body.password).toBeUndefined();
    expect(body.twoFactorSecret).toBeUndefined();
  });

  it("16. POST /api/auth/2fa/validate with a valid TOTP code returns { valid: true }", async () => {
    if (!totpSecret) throw new Error("No TOTP secret from setup step");
    const code = genCode(totpSecret);
    const r = await api("POST", "/api/auth/2fa/validate", { code });
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.valid).toBe(true);
  });

  it("12. POST /api/auth/2fa/disable with wrong password returns 400", async () => {
    const r = await api("POST", "/api/auth/2fa/disable", {
      password: "WrongPassword!",
      code: genCode(totpSecret || "FALLBACK"),
    });
    expect(r.status).toBe(400);
    const body = r.json as Record<string, unknown>;
    expect(body.message).toMatch(/password/i);
  });

  it("13. POST /api/auth/2fa/disable with correct password + valid TOTP disables 2FA", async () => {
    if (!totpSecret) throw new Error("No TOTP secret from setup step");
    const code = genCode(totpSecret);
    const r = await api("POST", "/api/auth/2fa/disable", {
      password: testUser.password,
      code,
    });
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.success).toBe(true);
  });

  it("14. GET /api/auth/2fa/status confirms 2FA is disabled", async () => {
    const r = await api("GET", "/api/auth/2fa/status");
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.enabled).toBe(false);
  });

  it("15. logout and re-login works without 2FA code after disable", async () => {
    await api("POST", "/api/auth/logout");
    authCookies = "";
    csrfToken = "";

    const r = await api("POST", "/api/auth/login", {
      email: testUser.email,
      password: testUser.password,
    });
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    // Should NOT prompt for 2FA
    expect(body.requiresTwoFactor).toBeUndefined();
    expect(body.id).toBeDefined();
  });
});
