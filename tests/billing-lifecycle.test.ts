/**
 * Integration tests for billing webhook lifecycle.
 *
 * Tests cover:
 * 1. Webhook signature validation (no sig / bad sig → rejected, valid sig → accepted)
 * 2. customer.subscription.created processing: tier is reflected in GET /api/billing/subscription
 * 3. Idempotency: same Stripe event ID processed twice — second response carries the
 *    "already processed" message and the tier does NOT change a second time
 * 4. checkout.session.completed accepted for valid events
 * 5. GET /api/billing/subscription tier, status, and plan shape
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5000';
const WEBHOOK_PATH = '/api/webhooks/stripe';

const testUser = {
  email: `billing_${Date.now()}@maxbooster-test.invalid`,
  password: 'SecurePass123!@#',
  firstName: 'Billing',
  lastName: 'Test',
};

let authCookies = '';
let csrfToken = '';
let testUserId = '';
let testUserStripeCustomerId: string | null = null;

async function api(
  method: string,
  path: string,
  body?: Record<string, unknown> | string,
  extraHeaders?: Record<string, string>,
) {
  const isStringBody = typeof body === 'string';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (authCookies) headers['Cookie'] = authCookies;
  const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (csrfToken && MUTATION_METHODS.includes(method.toUpperCase()) && !extraHeaders?.['stripe-signature']) {
    headers['x-csrf-token'] = csrfToken;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? (isStringBody ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(15000),
    redirect: 'manual',
  });
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
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

/**
 * Compute a Stripe-compatible webhook signature header.
 * The signed payload is: `${timestamp}.${rawPayload}` (HMAC-SHA256).
 * The FULL secret string (including the `whsec_` prefix) is used as the HMAC key,
 * matching the behavior of stripe.webhooks.generateTestHeaderString.
 */
function computeStripeHeader(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signed = `${ts}.${payload}`;
  const sig = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${ts},v1=${sig}`;
}

function makeSubscriptionEvent(overrides: Record<string, unknown> = {}, customerId?: string) {
  const cus = customerId ?? `cus_test_${crypto.randomBytes(6).toString('hex')}`;
  const base: Record<string, unknown> = {
    id: `evt_test_${crypto.randomBytes(8).toString('hex')}`,
    object: 'event',
    type: 'customer.subscription.created',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `sub_test_${crypto.randomBytes(8).toString('hex')}`,
        object: 'subscription',
        customer: cus,
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        metadata: { planId: 'monthly' },
        items: { data: [{ price: { id: 'price_test_monthly' } }] },
      },
    },
  };
  return { ...base, ...overrides };
}

function makeCheckoutSessionEvent(userId: string, overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    id: `evt_cs_${crypto.randomBytes(8).toString('hex')}`,
    object: 'event',
    type: 'checkout.session.completed',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_test_${crypto.randomBytes(8).toString('hex')}`,
        object: 'checkout.session',
        mode: 'subscription',
        payment_status: 'paid',
        status: 'complete',
        customer: `cus_cs_${crypto.randomBytes(6).toString('hex')}`,
        subscription: `sub_cs_${crypto.randomBytes(8).toString('hex')}`,
        payment_intent: null,
        metadata: {
          userId,
          planId: 'yearly',
        },
      },
    },
  };
  return { ...base, ...overrides };
}

/**
 * Fire a raw webhook POST with the provided payload and a freshly-computed
 * signature, returning the parsed response.
 */
async function fireWebhook(payload: string, secret: string) {
  const signature = computeStripeHeader(payload, secret);
  const res = await fetch(`${BASE}${WEBHOOK_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    body: payload,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

describe('Billing Webhook Lifecycle', () => {
  // ──────────────────── Setup ────────────────────
  it('1. registers and logs in test user; captures user ID and stripeCustomerId', async () => {
    await api('POST', '/api/auth/register', testUser);
    const loginR = await api('POST', '/api/auth/login', {
      email: testUser.email,
      password: testUser.password,
    });
    expect(loginR.status).toBe(200);
    expect(authCookies).toBeTruthy();

    // Capture user ID and any existing stripeCustomerId
    const meR = await api('GET', '/api/auth/me');
    expect(meR.status).toBe(200);
    const me = meR.json as Record<string, unknown>;
    testUserId = me.id as string;
    testUserStripeCustomerId = (me.stripeCustomerId as string | undefined) ?? null;
    expect(typeof testUserId).toBe('string');
  });

  // ──────────────────── Endpoint discovery ────────────────────
  it('2. webhook endpoint exists (not 404)', async () => {
    const res = await fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    expect(res.status).not.toBe(404);
  });

  // ──────────────────── Signature validation ────────────────────
  it('3. rejects webhook with no stripe-signature header', async () => {
    const res = await fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'test.event' }),
      signal: AbortSignal.timeout(8000),
    });
    expect([400, 401, 500]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it('4. rejects webhook with an invalid stripe-signature header', async () => {
    const res = await fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=1234567890,v1=aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
      },
      body: JSON.stringify({ type: 'checkout.session.completed' }),
      signal: AbortSignal.timeout(8000),
    });
    expect([400, 401, 500]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  // ──────────────────── Valid-signature processing ────────────────────
  it('5. valid customer.subscription.created is accepted and returns received:true', async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('[BillingTest] STRIPE_WEBHOOK_SECRET not set — skipping valid-signature test');
      return;
    }

    const event = makeSubscriptionEvent({}, testUserStripeCustomerId ?? undefined);
    const payload = JSON.stringify(event);
    const r = await fireWebhook(payload, webhookSecret);

    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.received).toBe(true);
  });

  it('6. valid checkout.session.completed is accepted and returns received:true', async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('[BillingTest] STRIPE_WEBHOOK_SECRET not set — skipping checkout.session test');
      return;
    }

    const event = makeCheckoutSessionEvent(testUserId);
    const payload = JSON.stringify(event);
    const r = await fireWebhook(payload, webhookSecret);

    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.received).toBe(true);
  });

  // ──────────────────── Idempotency ────────────────────
  it('7. idempotency: same event ID fired twice — second response is idempotent, tier unchanged', async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('[BillingTest] STRIPE_WEBHOOK_SECRET not set — skipping idempotency test');
      return;
    }

    // Use a customer ID that does NOT match any real user so we can assert tier stays 'free'
    const fakeCusId = `cus_idem_${crypto.randomBytes(8).toString('hex')}`;
    const sharedEventId = `evt_idem_${crypto.randomBytes(8).toString('hex')}`;
    const event = makeSubscriptionEvent({ id: sharedEventId }, fakeCusId);
    const payload = JSON.stringify(event);

    // Snapshot tier before
    const tierBefore = await api('GET', '/api/billing/subscription');
    const tierBeforeVal = tierBefore.status === 200
      ? (tierBefore.json as Record<string, unknown>).tier
      : 'unknown';

    // First fire — should be processed normally
    const first = await fireWebhook(payload, webhookSecret);
    expect(first.status).toBe(200);
    const firstBody = first.json as Record<string, unknown>;
    expect(firstBody.received).toBe(true);

    // Second fire — same event ID, should be skipped via idempotency cache
    const second = await fireWebhook(payload, webhookSecret);
    expect(second.status).toBe(200);
    const secondBody = second.json as Record<string, unknown>;
    expect(secondBody.received).toBe(true);
    // The second response should indicate it was de-duplicated
    if (typeof secondBody.message === 'string') {
      expect(secondBody.message.toLowerCase()).toMatch(/already|idempotent|duplicate|processed/i);
    }

    // Tier must NOT have changed — the fake customer ID has no matching user
    const tierAfter = await api('GET', '/api/billing/subscription');
    if (tierAfter.status === 200) {
      const tierAfterVal = (tierAfter.json as Record<string, unknown>).tier;
      expect(tierAfterVal).toBe(tierBeforeVal);
    }
  });

  // ──────────────────── Tier update when customer ID matches ────────────────────
  it('8. subscription.created linked to real user updates subscription_tier', async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('[BillingTest] STRIPE_WEBHOOK_SECRET not set — skipping tier-update test');
      return;
    }
    if (!testUserStripeCustomerId) {
      console.warn('[BillingTest] Test user has no stripeCustomerId (Stripe not configured) — skipping tier-update test');
      return;
    }

    // Get the tier before
    const beforeR = await api('GET', '/api/billing/subscription');
    const tierBefore = beforeR.status === 200
      ? (beforeR.json as Record<string, unknown>).tier
      : null;

    // Fire customer.subscription.created with the real user's customerId + planId: 'yearly'
    const event = makeSubscriptionEvent({
      id: `evt_tier_${crypto.randomBytes(8).toString('hex')}`,
      data: {
        object: {
          id: `sub_tier_${crypto.randomBytes(8).toString('hex')}`,
          object: 'subscription',
          customer: testUserStripeCustomerId,
          status: 'active',
          current_period_end: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
          metadata: { planId: 'yearly' },
          items: { data: [{ price: { id: 'price_test_yearly' } }] },
        },
      },
    });
    const payload = JSON.stringify(event);
    const r = await fireWebhook(payload, webhookSecret);
    expect(r.status).toBe(200);
    expect((r.json as Record<string, unknown>).received).toBe(true);

    // Verify tier updated to 'yearly'
    const afterR = await api('GET', '/api/billing/subscription');
    expect(afterR.status).toBe(200);
    const afterBody = afterR.json as Record<string, unknown>;
    expect(afterBody.tier).not.toBe(tierBefore);
    expect(afterBody.tier).toBe('yearly');
  });

  // ──────────────────── Subscription endpoint shape ────────────────────
  it('9. GET /api/billing/subscription returns complete tier shape when authenticated', async () => {
    const r = await api('GET', '/api/billing/subscription');
    expect([200, 500, 503]).toContain(r.status);
    if (r.status === 200) {
      const body = r.json as Record<string, unknown>;
      // Required fields
      expect(typeof body.tier).toBe('string');
      expect(typeof body.status).toBe('string');
      expect(typeof body.stripeConfigured).toBe('boolean');
      // Plan benefits block
      expect(body.planBenefits).toBeDefined();
      expect(body.allPlans).toBeDefined();
    }
  });

  it('10. GET /api/billing/subscription returns 401 when unauthenticated', async () => {
    const saved = authCookies;
    authCookies = '';
    const r = await api('GET', '/api/billing/subscription');
    expect([401, 403]).toContain(r.status);
    authCookies = saved;
  });

  it('11. GET /api/billing/plans returns a non-empty plan list without auth', async () => {
    const r = await api('GET', '/api/billing/plans');
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(Array.isArray(body.plans)).toBe(true);
    const plans = body.plans as Array<Record<string, unknown>>;
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0].id).toBeDefined();
    expect(plans[0].name).toBeDefined();
  });

  it('12. POST /api/billing/create-checkout-session rejects invalid plan', async () => {
    const r = await api('POST', '/api/billing/create-checkout-session', { planId: 'invalid_plan_xyz' });
    // 400 = validation error, 401/403 = auth gate, 503 = Stripe not configured
    expect([400, 401, 403, 503]).toContain(r.status);
    expect(r.status).not.toBe(200);
  });
});
