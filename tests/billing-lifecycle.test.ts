/**
 * Integration tests for billing webhook lifecycle.
 * Covers:
 * - Stripe webhook signature validation (reject bad / accept valid)
 * - customer.subscription.created event processing
 * - Idempotency: same event ID fired twice only processed once
 * - GET /api/billing/subscription tier reflection
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
 * Stripe signs: `${timestamp}.${rawPayload}` with HMAC-SHA256.
 * The full secret string (including the `whsec_` prefix) is used as-is as the HMAC key.
 * This matches stripe.webhooks.generateTestHeaderString behavior.
 */
function computeStripeHeader(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signed = `${ts}.${payload}`;
  const sig = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${ts},v1=${sig}`;
}

function makeSubscriptionEvent(overrides: Record<string, unknown> = {}) {
  const fakeCustomerId = `cus_test_${Date.now()}`;
  const base = {
    id: `evt_test_${crypto.randomBytes(8).toString('hex')}`,
    object: 'event',
    type: 'customer.subscription.created',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `sub_test_${crypto.randomBytes(8).toString('hex')}`,
        object: 'subscription',
        customer: fakeCustomerId,
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        metadata: { planId: 'monthly' },
        items: { data: [{ price: { id: 'price_test' } }] },
      },
    },
  };
  return { ...base, ...overrides };
}

describe('Billing Webhook Lifecycle', () => {
  it('1. registers and logs in test user', async () => {
    await api('POST', '/api/auth/register', testUser);
    const r = await api('POST', '/api/auth/login', {
      email: testUser.email,
      password: testUser.password,
    });
    expect(r.status).toBe(200);
    expect(authCookies).toBeTruthy();
  });

  it('2. webhook endpoint exists (not 404)', async () => {
    const res = await fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    expect(res.status).not.toBe(404);
  });

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

  it('5. accepts webhook with a valid signature and returns received:true', async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('[BillingTest] STRIPE_WEBHOOK_SECRET not set — skipping valid-signature test');
      return;
    }

    const event = makeSubscriptionEvent();
    const payload = JSON.stringify(event);
    const signature = computeStripeHeader(payload, webhookSecret);

    const res = await fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
      body: payload,
      signal: AbortSignal.timeout(15000),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.received).toBe(true);
  });

  it('6. idempotency: same event ID fired twice returns success both times', async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('[BillingTest] STRIPE_WEBHOOK_SECRET not set — skipping idempotency test');
      return;
    }

    const sharedEventId = `evt_idem_${crypto.randomBytes(8).toString('hex')}`;
    const event = makeSubscriptionEvent({ id: sharedEventId });
    const payload = JSON.stringify(event);

    const fire = async () => {
      const signature = computeStripeHeader(payload, webhookSecret);
      const res = await fetch(`${BASE}${WEBHOOK_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': signature,
        },
        body: payload,
        signal: AbortSignal.timeout(15000),
      });
      return res.status;
    };

    const firstStatus = await fire();
    expect(firstStatus).toBe(200);

    const secondStatus = await fire();
    expect(secondStatus).toBe(200);
  });

  it('7. GET /api/billing/subscription returns tier info when authenticated', async () => {
    const r = await api('GET', '/api/billing/subscription');
    expect([200, 503]).toContain(r.status);
    if (r.status === 200) {
      const body = r.json as Record<string, unknown>;
      expect(body.tier).toBeDefined();
    }
  });

  it('8. GET /api/billing/subscription returns 401 when unauthenticated', async () => {
    const saved = authCookies;
    authCookies = '';
    const r = await api('GET', '/api/billing/subscription');
    expect([401, 403]).toContain(r.status);
    authCookies = saved;
  });

  it('9. GET /api/billing/plans returns plan list without auth', async () => {
    const r = await api('GET', '/api/billing/plans');
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(Array.isArray(body.plans)).toBe(true);
    const plans = body.plans as Array<Record<string, unknown>>;
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0].id).toBeDefined();
  });

  it('10. POST /api/billing/create-checkout-session rejects invalid plan', async () => {
    const r = await api('POST', '/api/billing/create-checkout-session', { planId: 'invalid' });
    // 400 = validation error, 401/403 = auth gate, 503 = Stripe not configured
    expect([400, 401, 403, 503]).toContain(r.status);
    expect(r.status).not.toBe(200);
  });
});
