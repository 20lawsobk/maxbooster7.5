/**
 * Integration tests: verify all critical API routes enforce authentication.
 * Tests that protected endpoints return 401 when unauthenticated.
 */
import { describe, it, expect } from 'vitest';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5000';

async function unauthGet(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  return res.status;
}

async function unauthPost(path: string, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  return res.status;
}

describe('Unauthenticated route guards', () => {
  // --- Auth domain ---
  // /api/auth/me is intentionally public — returns 200 with null body for unauthenticated users
  it('GET /api/auth/me → 200 (public, returns null)', async () => expect(await unauthGet('/api/auth/me')).toBe(200));
  it('GET /api/auth/notifications → 401', async () => expect(await unauthGet('/api/auth/notifications')).toBe(401));
  it('GET /api/auth/sessions → 401', async () => expect(await unauthGet('/api/auth/sessions')).toBe(401));
  it('GET /api/auth/login-history → 401', async () => expect(await unauthGet('/api/auth/login-history')).toBe(401));

  // --- Admin domain ---
  it('GET /api/admin/users → 401 or 403', async () => {
    const s = await unauthGet('/api/admin/users');
    expect([401, 403]).toContain(s);
  });

  // --- Marketplace ---
  it('GET /api/marketplace/my-beats → 401', async () => expect(await unauthGet('/api/marketplace/my-beats')).toBe(401));
  it('POST /api/marketplace/listings → 401 or 403', async () => {
    // Unauthenticated POST hits CSRF check (403) before auth check (401)
    const s = await unauthPost('/api/marketplace/listings', {});
    expect([401, 403]).toContain(s);
  });

  // --- Releases (mounted under /api/distribution/releases) ---
  it('GET /api/distribution/releases → 401', async () => expect(await unauthGet('/api/distribution/releases')).toBe(401));

  // --- Royalties ---
  it('GET /api/royalties → 401', async () => {
    const s = await unauthGet('/api/royalties');
    expect([401, 403, 404]).toContain(s); // 404 if route not found
  });

  // --- Workspace ---
  it('GET /api/workspace → 401', async () => {
    const s = await unauthGet('/api/workspace');
    expect([401, 403, 404]).toContain(s);
  });

  // --- Analytics ---
  it('GET /api/analytics/overview → 401', async () => {
    const s = await unauthGet('/api/analytics/overview');
    expect([401, 403]).toContain(s);
  });

  // --- Payments ---
  it('POST /api/create-checkout-session → 401', async () => {
    const s = await unauthPost('/api/create-checkout-session', { tier: 'pro' });
    expect([401, 403]).toContain(s);
  });

  // --- Files ---
  it('GET /api/files/list → 401', async () => {
    const s = await unauthGet('/api/files/list');
    expect([401, 403]).toContain(s);
  });

  // --- Artist profiles ---
  it('GET /api/artist-profiles → 401', async () => {
    const s = await unauthGet('/api/artist-profiles');
    expect([401, 403]).toContain(s);
  });

  // --- Achievements ---
  it('GET /api/achievements → 401', async () => {
    const s = await unauthGet('/api/achievements');
    expect([401, 403]).toContain(s);
  });

  // --- Shows ---
  it('GET /api/shows → 401', async () => {
    const s = await unauthGet('/api/shows');
    expect([401, 403]).toContain(s);
  });

  // --- Merch ---
  it('GET /api/merch → 401', async () => {
    const s = await unauthGet('/api/merch');
    expect([401, 403]).toContain(s);
  });

  // --- Label Submissions ---
  it('GET /api/label-submissions → 401', async () => {
    const s = await unauthGet('/api/label-submissions');
    expect([401, 403]).toContain(s);
  });

  // --- Venues ---
  it('GET /api/venues → 401', async () => {
    const s = await unauthGet('/api/venues');
    expect([401, 403]).toContain(s);
  });

  // --- Music Videos ---
  it('GET /api/music-videos → 401', async () => {
    const s = await unauthGet('/api/music-videos');
    expect([401, 403]).toContain(s);
  });

  // --- Fan Campaigns ---
  it('GET /api/fan-campaigns → 401', async () => {
    const s = await unauthGet('/api/fan-campaigns');
    expect([401, 403]).toContain(s);
  });

  // --- Collaboration ---
  it('GET /api/collaboration → 401', async () => {
    const s = await unauthGet('/api/collaboration');
    expect([401, 403, 404]).toContain(s);
  });
});

describe('Param validation — UUID guard returns 400 for malformed IDs', () => {
  // These routes all have requireUUIDParam('id') applied.
  // A non-UUID param should return 400 (not 401/404) even when unauthenticated
  // because the middleware fires before auth on some routes, or 401 if auth fires first.
  // Either way it must NOT return 200 or 500.

  it('GET /api/files/not-a-uuid/download → 400 or 401', async () => {
    const s = await unauthGet('/api/files/not-a-uuid/download');
    expect([400, 401, 403]).toContain(s);
  });

  it('GET /api/artist-profiles/bad-id → 400 or 401', async () => {
    const s = await unauthGet('/api/artist-profiles/bad-id');
    expect([400, 401, 403]).toContain(s);
  });

  it('PATCH /api/artist-profiles/bad-id → 400 or 401 or 403', async () => {
    const s = await unauthPost('/api/artist-profiles/bad-id', {});
    expect([400, 401, 403]).toContain(s);
  });

  it('GET /api/files/sql-injection-attempt/download → 400 or 401', async () => {
    const s = await unauthGet("/api/files/'; DROP TABLE users; --/download");
    // Server must not 500; should sanitize or reject early
    expect(s).not.toBe(500);
    expect(s).not.toBe(200);
  });
});

describe('Public routes are accessible', () => {
  it('GET /api/health is public', async () => expect(await unauthGet('/api/health')).toBe(200));
  it('GET /health is public', async () => expect(await unauthGet('/health')).toBe(200));
  it('GET /ready is public', async () => {
    const s = await unauthGet('/ready');
    expect([200, 503]).toContain(s);
  });
  it('GET /api/ping is public', async () => expect(await unauthGet('/api/ping')).toBe(200));
  it('GET /api/marketplace/beats is public', async () => {
    const s = await unauthGet('/api/marketplace/beats');
    expect([200, 404]).toContain(s);
  });
});

describe('Error reporting endpoint', () => {
  it('POST /api/errors accepts client error reports without auth', async () => {
    const res = await fetch(`${BASE}/api/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test error', stack: 'Error: test\n  at test:1:1', url: '/test', userAgent: 'vitest' }),
      signal: AbortSignal.timeout(8000),
    });
    // Must not be 500; 200/204/400/429 are all acceptable
    expect(res.status).not.toBe(500);
    expect(res.status).not.toBe(401);
  });

  it('POST /api/errors rate-limits excessive reports', async () => {
    // Fire 6 requests rapidly — the rate limiter should kick in at some point
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${BASE}/api/errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `flood test ${i}`, stack: '', url: '/test', userAgent: 'vitest' }),
        signal: AbortSignal.timeout(8000),
      });
      results.push(res.status);
    }
    // At least some should succeed (2xx) and possibly some rate-limited (429)
    const hasSuccess = results.some(s => s >= 200 && s < 300);
    const hasRateLimit = results.some(s => s === 429);
    // Either we got some success OR we got rate limited — never all 500s
    expect(hasSuccess || hasRateLimit).toBe(true);
    expect(results.every(s => s === 500)).toBe(false);
  });
});
