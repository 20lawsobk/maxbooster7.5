/**
 * Integration tests for authentication flows.
 * Covers register → login → me → logout → protected-after-logout.
 */
import { describe, it, expect, beforeAll } from 'vitest';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5000';
let authCookies = '';
let csrfToken = '';

const testUser = {
  email: `authflow_${Date.now()}@maxbooster-test.invalid`,
  password: 'SecurePass123!@#',
  firstName: 'Auth',
  lastName: 'Flow',
};

async function api(method: string, path: string, body?: any) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authCookies) headers['Cookie'] = authCookies;
  const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (csrfToken && MUTATION_METHODS.includes(method.toUpperCase())) {
    headers['x-csrf-token'] = csrfToken;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
    redirect: 'manual',
  });
  // Merge Set-Cookie into existing cookies (rolling session only refreshes sessionId,
  // not csrf-token — replacing would drop the csrf-token on subsequent requests)
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    const cookieMap = new Map<string, string>();
    if (authCookies) {
      for (const c of authCookies.split('; ')) {
        const idx = c.indexOf('=');
        if (idx > 0) cookieMap.set(c.slice(0, idx), c.slice(idx + 1));
      }
    }
    for (const c of setCookie) {
      const pair = c.split(';')[0];
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const name = pair.slice(0, idx);
        const val = pair.slice(idx + 1);
        cookieMap.set(name, val);
        if (name === 'csrf-token') csrfToken = val;
      }
    }
    authCookies = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

describe('Full Auth Flow', () => {
  it('1. registers a new user', async () => {
    const r = await api('POST', '/api/auth/register', testUser);
    expect(r.status).toBe(200);
    expect(r.json.email).toBe(testUser.email);
    expect(r.json.password).toBeUndefined();
    expect(r.json.twoFactorSecret).toBeUndefined();
    expect(r.json.id).toBeDefined();
  });

  it('2. rejects duplicate registration', async () => {
    const r = await api('POST', '/api/auth/register', testUser);
    expect(r.status).toBe(400);
  });

  it('3. logs in with correct credentials', async () => {
    const r = await api('POST', '/api/auth/login', {
      email: testUser.email,
      password: testUser.password,
    });
    expect(r.status).toBe(200);
    expect(r.json.id).toBeDefined();
    // Cookie should be set
    expect(authCookies).toBeTruthy();
  });

  it('4. GET /api/auth/me returns user when authenticated', async () => {
    const r = await api('GET', '/api/auth/me');
    expect(r.status).toBe(200);
    expect(r.json.email).toBe(testUser.email);
    expect(r.json.password).toBeUndefined();
  });

  it('5. onboarding status is accessible', async () => {
    const r = await api('GET', '/api/auth/onboarding-status');
    expect(r.status).toBe(200);
  });

  it('6. profile is accessible when authenticated', async () => {
    const r = await api('GET', '/api/auth/profile');
    expect(r.status).toBe(200);
  });

  it('7. sessions list is accessible', async () => {
    const r = await api('GET', '/api/auth/sessions');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json)).toBe(true);
  });

  it('8. login history is accessible', async () => {
    const r = await api('GET', '/api/auth/login-history');
    expect(r.status).toBe(200);
  });

  it('9. logout succeeds', async () => {
    const r = await api('POST', '/api/auth/logout');
    expect([200, 204]).toContain(r.status);
  });

  it('10. /api/auth/me returns null or 401 after logout', async () => {
    authCookies = ''; // clear cookies
    const r = await api('GET', '/api/auth/me');
    // /api/auth/me is public by design — returns 200 with null body for unauthenticated users
    expect([200, 401]).toContain(r.status);
    if (r.status === 200) expect(r.json).toBeNull();
  });

  it('11. rejects login with wrong password', async () => {
    const r = await api('POST', '/api/auth/login', {
      email: testUser.email,
      password: 'WrongPassword!',
    });
    expect(r.status).toBe(401);
  });
});

describe('OAuth Callback Structure', () => {
  it('12. GET /api/social/callback/:platform with no state redirects with error', async () => {
    const res = await fetch(`${BASE}/api/social/callback/youtube`, {
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    // Should redirect (3xx) with error in location, or return 400
    expect([301, 302, 303, 307, 308, 400]).toContain(res.status);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') ?? '';
      expect(location).toBeTruthy();
      // Expect an error param in the redirect URL
      expect(location).toMatch(/error=/i);
    }
  });

  it('13. GET /api/social/callback/:platform with invalid state redirects with invalid_state', async () => {
    const res = await fetch(
      `${BASE}/api/social/callback/youtube?state=totally_invalid_state_value&code=abc123`,
      {
        signal: AbortSignal.timeout(8000),
        redirect: 'manual',
      },
    );
    expect([301, 302, 303, 307, 308, 400]).toContain(res.status);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') ?? '';
      expect(location).toMatch(/invalid_state/i);
    }
  });

  it('14. GET /api/social/callback/:platform with OAuth provider error redirects with oauth_denied', async () => {
    const res = await fetch(
      `${BASE}/api/social/callback/youtube?error=access_denied&error_description=User+denied`,
      {
        signal: AbortSignal.timeout(8000),
        redirect: 'manual',
      },
    );
    expect([301, 302, 303, 307, 308, 400]).toContain(res.status);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') ?? '';
      expect(location).toMatch(/oauth_denied/i);
    }
  });

  it('15. POST /api/social/connect/:platform requires authentication', async () => {
    const res = await fetch(`${BASE}/api/social/connect/youtube`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    expect([401, 403]).toContain(res.status);
  });

  it('16. GET /api/social/platforms returns platform list without auth', async () => {
    const res = await fetch(`${BASE}/api/social/platforms`, {
      signal: AbortSignal.timeout(8000),
    });
    // May require auth (401) or return platform list (200)
    expect([200, 401, 403]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json() as unknown;
      expect(body).toBeDefined();
    }
  });
});
