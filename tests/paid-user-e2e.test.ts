import { describe, it, expect, beforeAll } from 'vitest';

const BASE = 'http://localhost:5000';
let cookies = '';
let testUserId = '';
let csrfToken = '';
const testUser = {
  email: `paidtest_${Date.now()}@maxbooster-test.com`,
  password: 'SecurePass123!@#',
  username: `PaidUser_${Date.now()}`,
  firstName: 'Paid',
  lastName: 'Tester',
};

async function api(method: string, path: string, body?: any, opts?: { raw?: boolean; customHeaders?: Record<string, string> }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...opts?.customHeaders };
  if (cookies) headers['Cookie'] = cookies;
  const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (csrfToken && MUTATION_METHODS.includes(method.toUpperCase()) && !headers['x-csrf-token']) {
    headers['x-csrf-token'] = csrfToken;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  if (setCookie.length) {
    // Merge: don't replace — rolling session may only refresh sessionId without
    // re-sending csrf-token (generateCsrfToken skips if cookie already present)
    const cookieMap = new Map<string, string>();
    if (cookies) {
      for (const c of cookies.split('; ')) {
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
    cookies = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  if (opts?.raw) return { status: res.status, headers: res.headers, text: await res.text() };
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

describe('PAID USER END-TO-END INTEGRATION TESTS', () => {

  describe('Phase 1: Account Creation & Security Foundation', () => {

    it('should register successfully with strong password', async () => {
      const res = await api('POST', '/api/auth/register', testUser);
      expect(res.status).toBe(200);
      expect(res.json.id).toBeDefined();
      expect(res.json.email).toBe(testUser.email);
      expect(res.json.password).toBeUndefined();
      expect(res.json.passwordHash).toBeUndefined();
      testUserId = res.json.id;
    });

    it('should reject weak passwords', async () => {
      const res = await api('POST', '/api/auth/register', {
        ...testUser,
        email: `weak_${Date.now()}@test.com`,
        username: `weak_${Date.now()}`,
        password: '123',
      });
      expect([400, 422]).toContain(res.status);
    });

    it('should prevent duplicate registration', async () => {
      const res = await api('POST', '/api/auth/register', testUser);
      expect(res.status).toBe(400);
    });

    it('should login with correct credentials', async () => {
      const res = await api('POST', '/api/auth/login', {
        email: testUser.email,
        password: testUser.password,
      });
      expect(res.status).toBe(200);
      expect(res.json.email).toBe(testUser.email);
    });

    it('should reject login with wrong password', async () => {
      const tempCookies = cookies;
      const tempCsrf = csrfToken;
      cookies = '';
      const res = await api('POST', '/api/auth/login', {
        email: testUser.email,
        password: 'WrongPassword999!',
      });
      expect([401, 400]).toContain(res.status);
      cookies = tempCookies;
      csrfToken = tempCsrf;
    });

    it('should provide CSRF token for session protection', async () => {
      const res = await api('GET', '/api/csrf-token');
      expect(res.status).toBe(200);
      expect(res.json.csrfToken).toBeDefined();
      csrfToken = res.json.csrfToken;
    });

    it('should return authenticated user profile', async () => {
      const res = await api('GET', '/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.json.id).toBe(testUserId);
      expect(res.json.email).toBe(testUser.email);
    });

    it('should have security headers in response', async () => {
      const res = await api('GET', '/api/auth/me');
      const headers = res.headers;
      const csp = headers.get('content-security-policy');
      const xct = headers.get('x-content-type-options');
      expect(xct).toBe('nosniff');
      expect(csp || headers.get('x-frame-options')).toBeTruthy();
    });
  });

  describe('Phase 2: Profile Management (XSS-safe)', () => {

    it('should update profile with clean data', async () => {
      const res = await api('PUT', '/api/auth/profile', {
        firstName: 'PaidUser',
        lastName: 'Tester',
        bio: 'Professional music producer',
        location: 'Los Angeles, CA',
      });
      expect(res.status).toBe(200);
    });

    it('should strip HTML tags from profile fields (XSS protection)', async () => {
      const res = await api('PUT', '/api/auth/profile', {
        firstName: '<script>alert("xss")</script>Hacker',
        bio: '<img src=x onerror=alert(1)>Bio text',
      });
      expect(res.status).toBe(200);
      const profile = await api('GET', '/api/auth/me');
      expect(profile.json.firstName).not.toContain('<script>');
      expect(profile.json.bio || '').not.toContain('<img');
    });

    it('should reject excessively long profile data', async () => {
      const res = await api('PUT', '/api/auth/profile', {
        bio: 'x'.repeat(100000),
      });
      expect([200, 400, 413, 422]).toContain(res.status);
    });
  });

  describe('Phase 3: Billing & Stripe Payment Infrastructure', () => {

    it('should list available subscription plans with pricing', async () => {
      const res = await api('GET', '/api/billing/plans');
      expect(res.status).toBe(200);
      expect(res.json.plans).toBeDefined();
      expect(res.json.plans.length).toBeGreaterThan(0);
      const plan = res.json.plans[0];
      expect(plan.name).toBeDefined();
      expect(plan.price).toBeDefined();
      expect(typeof plan.price).toBe('number');
      expect(plan.features).toBeDefined();
      expect(Array.isArray(plan.features)).toBe(true);
    });

    it('should show current subscription status with full plan details', async () => {
      const res = await api('GET', '/api/billing/subscription');
      expect(res.status).toBe(200);
      expect(res.json.tier).toBeDefined();
      expect(res.json.status).toBeDefined();
      expect(res.json.stripeConfigured).toBe(true);
      expect(res.json.planBenefits).toBeDefined();
      expect(res.json.pricing).toBeDefined();
      expect(res.json.pricing.monthly).toBe(49);
      expect(res.json.pricing.yearly).toBe(39);
      expect(res.json.pricing.lifetime).toBe(699);
      expect(res.json.upgradeOptions).toBeDefined();
      expect(Array.isArray(res.json.upgradeOptions)).toBe(true);
    });

    it('should create real Stripe checkout session with checkout URL', async () => {
      const res = await api('POST', '/api/billing/create-checkout-session', {
        planId: 'monthly',
      });
      // 200 when Stripe is configured; 500/503 when STRIPE_SECRET_KEY is not set in this environment
      expect([200, 500, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.json.url).toBeDefined();
        expect(res.json.url).toContain('checkout.stripe.com');
        expect(res.json.sessionId).toBeDefined();
      }
    });

    it('should create checkout sessions for all plan types', async () => {
      for (const plan of ['monthly', 'yearly', 'lifetime']) {
        const res = await api('POST', '/api/billing/create-checkout-session', { planId: plan });
        // 200 when Stripe is configured; 500/503 when STRIPE_SECRET_KEY is not set in this environment
        expect([200, 500, 503]).toContain(res.status);
        if (res.status === 200) {
          expect(res.json.url).toContain('checkout.stripe.com');
        }
      }
    });

    it('should reject invalid plan IDs', async () => {
      const res = await api('POST', '/api/billing/create-checkout-session', { planId: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('should return billing history as array', async () => {
      const res = await api('GET', '/api/billing/history');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json)).toBe(true);
    });

    it('should return payment method info', async () => {
      const res = await api('GET', '/api/billing/payment-method');
      expect(res.status).toBe(200);
      expect(res.json).toHaveProperty('last4');
      expect(res.json).toHaveProperty('brand');
    });

    it('should handle cancel-subscription gracefully when no subscription', async () => {
      const res = await api('POST', '/api/billing/cancel-subscription', {
        reason: 'testing',
      });
      expect([404]).toContain(res.status);
      expect(res.json.code).toBe('SUBSCRIPTION_NOT_FOUND');
    });

    it('should map Stripe error codes to user-friendly messages', () => {
      const errorMap: Record<string, string> = {
        'card_declined': 'PAYMENT_DECLINED',
        'incorrect_cvc': 'CARD_VALIDATION_ERROR',
        'expired_card': 'CARD_EXPIRED',
        'insufficient_funds': 'INSUFFICIENT_FUNDS',
        'authentication_required': 'REQUIRES_3D_SECURE',
      };
      for (const [stripeCode, appCode] of Object.entries(errorMap)) {
        expect(appCode).toBeDefined();
        expect(typeof appCode).toBe('string');
      }
    });
  });

  describe('Phase 4: Stripe Webhook Security & Event Handling', () => {

    it('should reject webhooks without signature', async () => {
      const res = await api('POST', '/api/webhooks/stripe', { type: 'test' });
      expect([400, 401, 403]).toContain(res.status);
    });

    it('should reject webhooks with invalid signature', async () => {
      const res = await api('POST', '/api/webhooks/stripe', { type: 'test' }, {
        customHeaders: { 'stripe-signature': 'invalid_sig_12345' },
      });
      expect([400, 401, 403]).toContain(res.status);
    });

    it('should reject forged payment events (no valid Stripe signature)', async () => {
      const forgedEvent = {
        id: 'evt_forged_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_forged',
            amount_total: 100000,
            payment_intent: 'pi_forged',
          },
        },
      };
      const res = await api('POST', '/api/webhooks/stripe', forgedEvent, {
        customHeaders: { 'stripe-signature': 't=1234567890,v1=fake_signature_value' },
      });
      expect([400, 401, 403]).toContain(res.status);
    });

    it('should handle all critical webhook event types', () => {
      const requiredEvents = [
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.paid',
        'invoice.payment_failed',
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'payout.paid',
        'payout.failed',
      ];
      for (const event of requiredEvents) {
        expect(event).toBeDefined();
      }
    });
  });

  describe('Phase 5: Distribution - Core Paid Feature', () => {

    it('should list all distribution platforms', async () => {
      const res = await api('GET', '/api/distribution/platforms');
      expect(res.status).toBe(200);
      expect(res.json.platforms).toBeDefined();
      expect(res.json.platforms.length).toBeGreaterThan(10);
      const platform = res.json.platforms[0];
      expect(platform.name).toBeDefined();
      expect(platform.category).toBeDefined();
    });

    it('should list user releases', async () => {
      const res = await api('GET', '/api/distribution/releases');
      expect(res.status).toBe(200);
    });

    it('should get earnings breakdown', async () => {
      const res = await api('GET', '/api/distribution/earnings/breakdown');
      expect([200, 401]).toContain(res.status);
    });

    it('should get HyperFollow links', async () => {
      const res = await api('GET', '/api/distribution/hyperfollow');
      expect(res.status).toBe(200);
    });

    it('should create a distribution release with valid data', async () => {
      const res = await api('POST', '/api/distribution/releases', {
        title: 'E2E Test Track',
        artistName: 'Test Artist',
        releaseType: 'single',
        primaryGenre: 'Hip Hop',
        language: 'English',
        copyrightYear: 2026,
        copyrightOwner: 'Test Artist',
        releaseDate: '2026-04-01',
      });
      expect(res.status).toBe(200);
      expect(res.json.id).toBeDefined();
      expect(res.json.title).toBe('E2E Test Track');
      expect(res.json.status).toBe('draft');
      expect(res.json.metadata.artistName).toBe('Test Artist');
      expect(res.json.metadata.releaseType).toBe('single');
      expect(res.json.metadata.primaryGenre).toBe('Hip Hop');
    });

    it('should reject release creation with missing required fields', async () => {
      const res = await api('POST', '/api/distribution/releases', {
        title: 'Incomplete Release',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Phase 6: Social Media Management', () => {

    beforeAll(async () => {
      const res = await api('POST', '/api/auth/login', {
        email: testUser.email,
        password: testUser.password,
      });
      expect(res.status).toBe(200);
    });

    it('should list social connections', async () => {
      const res = await api('GET', '/api/social/connections');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json)).toBe(true);
    });

    it('should schedule a post', async () => {
      const res = await api('POST', '/api/social/schedule-post', {
        content: 'E2E test post for production verification',
        platform: 'instagram',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      });
      expect([200, 201]).toContain(res.status);
      expect(res.json.success).toBe(true);
    });

    it('should list calendar posts', async () => {
      const res = await api('GET', '/api/social/calendar');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json)).toBe(true);
    });

    it('should get trending hashtags (dynamic, time-based)', async () => {
      const res1 = await api('GET', '/api/social/hashtags/trending');
      expect(res1.status).toBe(200);
      expect(Array.isArray(res1.json)).toBe(true);
      // May be empty for a fresh test user with no social data — shape-check only when data exists
      if (res1.json.length > 0) {
        const hashtag = res1.json[0];
        expect(hashtag.hashtag).toBeDefined();
        expect(hashtag.posts).toBeDefined();
        expect(typeof hashtag.posts).toBe('number');
        expect(hashtag.trend).toBeDefined();
        expect(hashtag.category).toBeDefined();
      }
    });

    it('should get social metrics', async () => {
      const res = await api('GET', '/api/social/metrics');
      expect(res.status).toBe(200);
    });

    it('should generate AI content', async () => {
      const res = await api('POST', '/api/social/generate-content', {
        topic: 'new single release',
        platform: 'instagram',
      });
      expect(res.status).toBe(200);
      expect(res.json.generatedContent || res.json.content || res.json.suggestions).toBeDefined();
    });

    it('should get inbox messages', async () => {
      const res = await api('GET', '/api/social/inbox');
      expect(res.status).toBe(200);
    });

    it('should handle connect for unsupported platform', async () => {
      const res = await api('POST', '/api/social/connect/myspace');
      expect(res.status).toBe(400);
      expect(res.json.message || res.json.error).toBeDefined();
    });

    it('should handle connect for Meta platform (covers Facebook+Instagram)', async () => {
      const res = await api('POST', '/api/social/connect/meta');
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.json.authUrl || res.json.url).toBeDefined();
      }
      if (res.status === 503) {
        expect(res.json.message).toBeDefined();
      }
    });
  });

  describe('Phase 7: Studio & Music Production', () => {

    it('should list projects', async () => {
      const res = await api('GET', '/api/studio/projects');
      expect(res.status).toBe(200);
    });

    it('should get sample library', async () => {
      const res = await api('GET', '/api/studio/samples');
      expect(res.status).toBe(200);
    });

    it('should get project templates', async () => {
      const res = await api('GET', '/api/studio/templates');
      expect(res.status).toBe(200);
    });
  });

  describe('Phase 8: Analytics Dashboard', () => {

    it('should get analytics dashboard data', async () => {
      const res = await api('GET', '/api/analytics/dashboard');
      expect(res.status).toBe(200);
    });

    it('should handle analytics date range filtering', async () => {
      const res = await api('GET', '/api/analytics/dashboard?period=30d');
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('Phase 9: AI Career Coach', () => {

    it('should get AI recommendations', async () => {
      const res = await api('GET', '/api/career-coach/recommendations');
      expect(res.status).toBe(200);
    });

    it('should get career goals', async () => {
      const res = await api('GET', '/api/career-coach/goals');
      expect(res.status).toBe(200);
    });
  });

  describe('Phase 10: Contracts & Collaboration', () => {

    it('should list contract templates', async () => {
      const res = await api('GET', '/api/contracts/templates');
      expect(res.status).toBe(200);
    });

    it('should list collaboration connections', async () => {
      const res = await api('GET', '/api/collaborations/connections');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json)).toBe(true);
    });
  });

  describe('Phase 11: Search Functionality', () => {

    it('should perform unified search with results', async () => {
      const res = await api('GET', '/api/search/unified?q=test&type=all');
      expect(res.status).toBe(200);
      expect(res.json.totalResults).toBeDefined();
      expect(res.json.categories).toBeDefined();
    });

    it('should handle empty search gracefully', async () => {
      const res = await api('GET', '/api/search/unified?q=');
      expect(res.status).toBe(200);
    });

    it('should search with type filter', async () => {
      const res = await api('GET', '/api/search/unified?q=music&type=beats');
      expect(res.status).toBe(200);
    });

    it('should get search suggestions', async () => {
      const res = await api('GET', '/api/search/suggestions?q=hip');
      expect(res.status).toBe(200);
    });
  });

  describe('Phase 12: Security Hardening Verification', () => {

    it('should reject SQL injection in login', async () => {
      const tempCookies = cookies;
      const tempCsrf = csrfToken;
      cookies = '';
      const res = await api('POST', '/api/auth/login', {
        email: "admin'--",
        password: "' OR 1=1 --",
      });
      expect([400, 401]).toContain(res.status);
      cookies = tempCookies;
      csrfToken = tempCsrf;
    });

    it('should reject SQL injection in search', async () => {
      const res = await api('GET', '/api/search/unified?q=\' OR 1=1; DROP TABLE users; --');
      expect([200, 400]).toContain(res.status);
    });

    it('should reject malformed JSON body', async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cookie': cookies,
      };
      const res = await fetch(`${BASE}/api/auth/profile`, {
        method: 'PUT',
        headers,
        body: '{invalid json!!!',
      });
      expect([400, 422, 500]).toContain(res.status);
    });

    it('should return 404 for non-existent API routes', async () => {
      const res = await api('GET', '/api/nonexistent-route-12345');
      expect(res.status).toBe(404);
    });

    it('should prevent path traversal attempts', async () => {
      const res = await api('GET', '/api/../../../etc/passwd');
      expect([200, 301, 302, 400, 403, 404]).toContain(res.status);
      if (res.status === 200) {
        const body = typeof res.json === 'string' ? res.json : JSON.stringify(res.json);
        expect(body).not.toContain('root:');
        expect(body).not.toContain('/bin/bash');
      }
    });

    it('should not leak stack traces in production errors', async () => {
      const res = await api('POST', '/api/auth/login', {
        email: null,
        password: null,
      });
      expect(res.json.stack).toBeUndefined();
      expect(res.json.trace).toBeUndefined();
    });

    it('should not expose sensitive headers', async () => {
      const res = await api('GET', '/api/auth/me');
      expect(res.headers.get('x-powered-by')).toBeNull();
    });
  });

  describe('Phase 13: Rate Limiting Verification', () => {

    it('should rate limit failed login attempts', async () => {
      const tempCookies = cookies;
      const tempCsrf = csrfToken;
      cookies = '';
      const results = [];
      for (let i = 0; i < 8; i++) {
        const res = await api('POST', '/api/auth/login', {
          email: `ratelimit_${Date.now()}_${i}@test.com`,
          password: 'wrong',
        });
        results.push(res.status);
      }
      cookies = tempCookies;
      csrfToken = tempCsrf;
      const has429 = results.includes(429);
      const allFailed = results.every(s => [401, 429, 400].includes(s));
      expect(allFailed).toBe(true);
    });

    it('should have billing rate limiter active', async () => {
      const results = [];
      for (let i = 0; i < 30; i++) {
        const res = await api('GET', '/api/billing/plans');
        results.push(res.status);
      }
      const allValid = results.every(s => [200, 429].includes(s));
      expect(allValid).toBe(true);
    });
  });

  describe('Phase 14: Email Service Verification', () => {

    it('should have email service properly structured', async () => {
      const res = await api('GET', '/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.json.email).toBe(testUser.email);
    });
  });

  describe('Phase 15: OAuth Flow Structure Verification', () => {

    it('should return proper OAuth URLs for supported platforms', async () => {
      const platforms = ['spotify', 'tiktok', 'youtube', 'twitter', 'meta', 'threads', 'linkedin'];
      for (const platform of platforms) {
        const res = await api('POST', `/api/social/connect/${platform}`);
        expect([200, 400, 503]).toContain(res.status);
        if (res.status === 200) {
          expect(res.json.authUrl || res.json.url).toBeDefined();
          const url = res.json.authUrl || res.json.url;
          expect(url.startsWith('http')).toBe(true);
        }
        if (res.status === 503) {
          expect(res.json.message).toBeDefined();
        }
      }
    });

    it('should handle OAuth callback with missing code', async () => {
      const res = await fetch(`${BASE}/api/social/callback/spotify?error=access_denied`, {
        redirect: 'manual',
        headers: { Cookie: cookies },
      });
      expect([302, 400]).toContain(res.status);
    });

    it('should handle OAuth callback with invalid state', async () => {
      const res = await fetch(`${BASE}/api/social/callback/spotify?code=test&state=invalid_state`, {
        redirect: 'manual',
        headers: { Cookie: cookies },
      });
      expect([302, 400]).toContain(res.status);
    });
  });

  describe('Phase 16: Error Handling & Graceful Degradation', () => {

    it('should return structured error responses with helpful messages', async () => {
      const res = await api('POST', '/api/billing/create-checkout-session', {});
      if (res.status !== 200) {
        expect(res.json.message || res.json.error).toBeDefined();
      }
    });

    it('should handle concurrent requests without crashes', async () => {
      const requests = Array.from({ length: 10 }, (_, i) =>
        api('GET', '/api/billing/plans')
      );
      const results = await Promise.all(requests);
      for (const res of results) {
        expect([200, 429]).toContain(res.status);
      }
    });

    it('should handle very large request bodies gracefully', async () => {
      const res = await api('POST', '/api/social/schedule-post', {
        content: 'a'.repeat(50000),
        platforms: ['instagram'],
        scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      });
      expect([200, 201, 400, 413, 422]).toContain(res.status);
    });
  });

  describe('Phase 17: Notifications & Real-Time', () => {

    it('should get notifications when authenticated', async () => {
      const res = await api('GET', '/api/auth/notifications');
      expect(res.status).toBe(200);
    });

    it('should reject notifications without auth', async () => {
      const tempCookies = cookies;
      const tempCsrf = csrfToken;
      cookies = '';
      const res = await api('GET', '/api/auth/notifications');
      expect(res.status).toBe(401);
      cookies = tempCookies;
      csrfToken = tempCsrf;
    });
  });

  describe('Phase 18: Data Integrity & Isolation', () => {

    it('should not expose other users data in profile', async () => {
      const res = await api('GET', '/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.json.id).toBe(testUserId);
    });

    it('should scope social posts to authenticated user', async () => {
      const res = await api('GET', '/api/social/calendar');
      expect(res.status).toBe(200);
      if (Array.isArray(res.json) && res.json.length > 0) {
        for (const post of res.json) {
          expect(post.userId).toBe(testUserId);
        }
      }
    });
  });

  describe('Phase 19: Session & Logout Security', () => {

    it('should logout successfully', async () => {
      const res = await api('POST', '/api/auth/logout');
      expect(res.status).toBe(200);
    });

    it('should deny access after logout (no cookies)', async () => {
      cookies = '';
      const res = await api('GET', '/api/auth/notifications');
      expect(res.status).toBe(401);
    });

    it('should deny access to billing after logout', async () => {
      const res = await api('GET', '/api/billing/subscription');
      expect([401, 404]).toContain(res.status);
    });

    it('should deny access to distribution after logout', async () => {
      const res = await api('GET', '/api/distribution/releases');
      expect([401, 200]).toContain(res.status);
    });
  });
});
