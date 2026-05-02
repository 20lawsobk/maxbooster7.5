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
