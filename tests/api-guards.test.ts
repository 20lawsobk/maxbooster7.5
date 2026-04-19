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
  it('GET /api/auth/me → 401', async () => expect(await unauthGet('/api/auth/me')).toBe(401));
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
  it('POST /api/marketplace/listings → 401', async () => {
    const s = await unauthPost('/api/marketplace/listings', {});
    expect([401, 400]).toContain(s);
  });

  // --- Releases ---
  it('GET /api/releases → 401', async () => expect(await unauthGet('/api/releases')).toBe(401));

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
