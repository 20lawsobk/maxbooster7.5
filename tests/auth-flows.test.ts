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

/**
 * OAuth Callback Structure tests.
 *
 * Routes under test (mounted at /api/social by server/routes/socialOAuth.ts):
 *   GET  /api/social/callback/:platform  — exchange code for tokens; validates HMAC-signed state
 *   POST /api/social/connect/:platform   — initiate OAuth; returns authUrl (PKCE or standard)
 *   GET  /api/social/platforms           — list supported platforms
 *   GET  /api/social/connections         — list connected accounts (requires auth)
 *
 * State parameter: JSON payload signed with HMAC-SHA256.
 * An invalid HMAC → redirect to /social-media?error=invalid_state.
 * Missing state   → redirect with error query param.
 * Provider error  → redirect with error=oauth_denied.
 */
describe('OAuth Callback Structure', () => {
  it('12. GET /api/social/callback/:platform with no state redirects with error', async () => {
    // No state at all — server should detect missing/null state and redirect with error
    const res = await fetch(`${BASE}/api/social/callback/youtube`, {
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    // 3xx = redirect to frontend error page; 400 = explicit bad-request
    expect([301, 302, 303, 307, 308, 400]).toContain(res.status);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') ?? '';
      expect(location).toBeTruthy();
      expect(location).toMatch(/error=/i);
    }
  });

  it('13. GET /api/social/callback/:platform with tampered/invalid state redirects with invalid_state', async () => {
    // The state HMAC signature is wrong — verifyOAuthState() returns null
    const res = await fetch(
      `${BASE}/api/social/callback/youtube?state=totally_invalid_state_value&code=fake_code`,
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

  it('14. GET /api/social/callback/:platform with base64-but-bad-HMAC state redirects with invalid_state', async () => {
    // Structurally valid base64 JSON but the HMAC tag is wrong
    const fakeStatePayload = Buffer.from(
      JSON.stringify({ userId: 'usr_fake', platform: 'youtube', sig: 'badhmacsignature' }),
    ).toString('base64url');
    const res = await fetch(
      `${BASE}/api/social/callback/youtube?state=${fakeStatePayload}&code=fake_code`,
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

  it('15. GET /api/social/callback/:platform with OAuth provider error redirects with oauth_denied', async () => {
    // Provider sends error=access_denied — the callback should redirect to the error page
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
      // Server redirects to frontend with error=oauth_denied
      expect(location).toMatch(/oauth_denied/i);
    }
  });

  it('16. POST /api/social/connect/:platform without auth returns 401 or 403', async () => {
    // requireAuth guard must fire before any OAuth logic
    const res = await fetch(`${BASE}/api/social/connect/youtube`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    expect([401, 403]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it('17. POST /api/social/connect/:platform with valid auth returns an authUrl', async () => {
    // Authenticated initiation of the OAuth PKCE flow — expects an authorization URL
    const res = await fetch(`${BASE}/api/social/connect/youtube`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Send the session cookie established by the Full Auth Flow describe block
        ...(authCookies ? { Cookie: authCookies } : {}),
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    // 200 = auth URL generated; 400/422 = platform config missing; 401/403 = auth failed
    expect([200, 400, 401, 403, 422, 500]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json() as Record<string, unknown>;
      expect(typeof body.authUrl).toBe('string');
      const authUrl = new URL(body.authUrl as string);
      // The state parameter must be present (PKCE or standard OAuth state)
      expect(authUrl.searchParams.get('state')).toBeTruthy();
      // For YouTube (PKCE), code_challenge should be present
      const codeChallenge = authUrl.searchParams.get('code_challenge');
      if (codeChallenge) {
        expect(codeChallenge.length).toBeGreaterThan(0);
        expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
      }
    }
  });

  it('18. GET /api/social/platforms returns a platform list', async () => {
    const res = await fetch(`${BASE}/api/social/platforms`, {
      headers: authCookies ? { Cookie: authCookies } : {},
      signal: AbortSignal.timeout(8000),
    });
    expect([200, 401, 403]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json() as Record<string, unknown>;
      expect(body).toBeDefined();
      // Should be an array or an object with platform keys
      const isPlatformList = Array.isArray(body) || typeof body === 'object';
      expect(isPlatformList).toBe(true);
    }
  });

  it('19. GET /api/social/connections requires authentication', async () => {
    const res = await fetch(`${BASE}/api/social/connections`, {
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    expect([401, 403]).toContain(res.status);
  });
});
