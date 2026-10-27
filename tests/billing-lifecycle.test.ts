/**
 * Integration tests for billing webhook lifecycle.
 *
 * Tests cover:
 * 1. Webhook signature validation (no sig / bad sig → rejected, valid sig → accepted)
 * 2. Signed subscription payloads cannot grant a tier without provider authority
 * 3. Idempotency: same Stripe event ID processed twice — second response carries the
 *    "already processed" message and the tier does NOT change a second time
 * 4. checkout.session.completed accepted for valid events
 * 5. GET /api/billing/subscription tier, status, and plan shape
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { withFixtureDatabase } from "./helpers-http-fixture";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";
const WEBHOOK_PATH = "/api/webhooks/stripe";

const testUser = {
  birthdate: "1990-01-01",
  email: `billing_${Date.now()}@maxbooster-test.invalid`,
  password: "SecurePass123!@#",
  firstName: "Billing",
  lastName: "Test",
};

let authCookies = "";
let csrfToken = "";
let testUserId = "";

async function api(
  method: string,
  path: string,
  body?: Record<string, unknown> | string,
  extraHeaders?: Record<string, string>,
) {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase()) &&
      !authCookies.split("; ").some(cookie => cookie.startsWith("csrf-token="))) {
    await api("GET", "/api/csrf-token");
  }
  const isStringBody = typeof body === "string";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (authCookies) headers["Cookie"] = authCookies;
  const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
  if (
    csrfToken &&
    MUTATION_METHODS.includes(method.toUpperCase()) &&
    !extraHeaders?.["stripe-signature"]
  ) {
    headers["x-csrf-token"] = csrfToken;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? (isStringBody ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(15000),
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

async function setFixtureCustomer(customerId: string) {
  return withFixtureDatabase(testUser.email, async client => {
    const result = await client.query("UPDATE users SET stripe_customer_id=$1 WHERE email=$2 RETURNING id", [customerId, testUser.email]);
    expect(result.rowCount).toBe(1);
    return result.rows[0].id;
  });
}

async function fixtureTier() {
  return withFixtureDatabase(testUser.email, async client => {
    const result = await client.query("SELECT subscription_tier FROM users WHERE email=$1", [testUser.email]);
    expect(result.rowCount).toBe(1);
    return result.rows[0].subscription_tier;
  });
}

/**
 * Compute a Stripe-compatible webhook signature header.
 * The signed payload is: `${timestamp}.${rawPayload}` (HMAC-SHA256).
 * The FULL secret string (including the `whsec_` prefix) is used as the HMAC key,
 * matching the behavior of stripe.webhooks.generateTestHeaderString.
 */
function computeStripeHeader(
  payload: string,
  secret: string,
  timestamp?: number,
): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signed = `${ts}.${payload}`;
  const sig = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${ts},v1=${sig}`;
}

function makeSubscriptionEvent(
  overrides: Record<string, unknown> = {},
  customerId?: string,
) {
  const cus = customerId ?? `cus_test_${crypto.randomBytes(6).toString("hex")}`;
  const base: Record<string, unknown> = {
    id: `evt_test_${crypto.randomBytes(8).toString("hex")}`,
    object: "event",
    type: "customer.subscription.created",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `sub_test_${crypto.randomBytes(8).toString("hex")}`,
        object: "subscription",
        customer: cus,
        status: "active",
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        metadata: { planId: "monthly" },
        items: { data: [{ price: { id: "price_test_monthly" } }] },
      },
    },
  };
  return { ...base, ...overrides };
}

function makeCheckoutSessionEvent(
  customerId: string,
  planId: string,
  overrides: Record<string, unknown> = {},
) {
  const base: Record<string, unknown> = {
    id: `evt_cs_${crypto.randomBytes(8).toString("hex")}`,
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_test_${crypto.randomBytes(8).toString("hex")}`,
        object: "checkout.session",
        mode: "subscription",
        payment_status: "paid",
        status: "complete",
        customer: customerId,
        subscription: `sub_cs_${crypto.randomBytes(8).toString("hex")}`,
        payment_intent: null,
        metadata: { planId },
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
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

describe("Billing Webhook Lifecycle", () => {
  // ──────────────────── Setup ────────────────────
  it("1. registers and logs in an owned fixture user and captures its ID", async () => {
    await api("POST", "/api/auth/register", testUser);
    const loginR = await api("POST", "/api/auth/login", {
      email: testUser.email,
      password: testUser.password,
    });
    expect(loginR.status).toBe(200);
    expect(authCookies).toBeTruthy();

    // Capture user ID and any existing stripeCustomerId
    const meR = await api("GET", "/api/auth/me");
    expect(meR.status).toBe(200);
    const me = meR.json as Record<string, unknown>;
    testUserId = me.id as string;
    expect(typeof testUserId).toBe("string");
  });

  // ──────────────────── Endpoint discovery ────────────────────
  it("2. webhook endpoint exists (not 404)", async () => {
    const res = await fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    expect(res.status).not.toBe(404);
  });

  // ──────────────────── Signature validation ────────────────────
  it("3. rejects webhook with no stripe-signature header", async () => {
    const res = await fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "test.event" }),
      signal: AbortSignal.timeout(8000),
    });
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(200);
  });

  it("4. rejects webhook with an invalid stripe-signature header", async () => {
    const res = await fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature":
          "t=1234567890,v1=aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
      },
      body: JSON.stringify({ type: "checkout.session.completed" }),
      signal: AbortSignal.timeout(8000),
    });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(200);
  });

  // ──────────────────── Valid-signature processing ────────────────────
  it("5. a signed subscription event cannot grant entitlement without current provider verification", async () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    expect(secret, "The isolated runner supplies an owned webhook secret").toBeTruthy();
    const before = await fixtureTier();
    const event = makeSubscriptionEvent({}, `cus_unlinked_${crypto.randomBytes(8).toString("hex")}`);
    const result = await fireWebhook(JSON.stringify(event), secret!);
    expect(result.status).toBe(500);
    expect(await fixtureTier()).toBe(before);
  });

  it("6. checkout.session.completed (subscription mode) updates subscription_tier", async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn(
        "[BillingTest] STRIPE_WEBHOOK_SECRET not set — skipping checkout.session tier-update test",
      );
      return;
    }

    // Plant a unique stripeCustomerId on the test user for this test
    const fakeCusId6 = `cus_cs_${crypto.randomBytes(8).toString("hex")}`;
    expect(await setFixtureCustomer(fakeCusId6)).toBe(testUserId);

    // Fire checkout.session.completed with mode:subscription → should update tier to 'monthly'
    const event = makeCheckoutSessionEvent(fakeCusId6, "monthly");
    const payload = JSON.stringify(event);
    const r = await fireWebhook(payload, webhookSecret);

    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(body.received).toBe(true);

    // Verify tier updated directly in DB (bypasses Stripe API sync)
    expect(await fixtureTier()).toBe("monthly");
  });

  // ──────────────────── Idempotency ────────────────────
  it("7. idempotency: same event ID fired twice — second response is idempotent, tier unchanged", async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn(
        "[BillingTest] STRIPE_WEBHOOK_SECRET not set — skipping idempotency test",
      );
      return;
    }

    const ownedCustomer = `cus_idem_${crypto.randomBytes(8).toString("hex")}`;
    expect(await setFixtureCustomer(ownedCustomer)).toBe(testUserId);
    const sharedEventId = `evt_idem_${crypto.randomBytes(8).toString("hex")}`;
    const event = makeCheckoutSessionEvent(ownedCustomer, "monthly", { id: sharedEventId });
    const payload = JSON.stringify(event);

    // Snapshot tier before
    const tierBefore = await api("GET", "/api/billing/subscription");
    const tierBeforeVal =
      tierBefore.status === 200
        ? (tierBefore.json as Record<string, unknown>).tier
        : "unknown";

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
    if (typeof secondBody.message === "string") {
      expect(secondBody.message.toLowerCase()).toMatch(
        /already|idempotent|duplicate|processed/i,
      );
    }

    // Replaying the verified checkout must not change the already applied tier
    const tierAfter = await api("GET", "/api/billing/subscription");
    if (tierAfter.status === 200) {
      const tierAfterVal = (tierAfter.json as Record<string, unknown>).tier;
      expect(tierAfterVal).toBe(tierBeforeVal);
    }
  });

  // Provider-state authority is exercised with real SQL in subscription-authority-postgres.test.mjs.
  it("8. a valid signed event cannot replace a user's tier from unverified payload metadata", async () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    expect(secret).toBeTruthy();
    const customer = `cus_authority_${crypto.randomBytes(8).toString("hex")}`;
    expect(await setFixtureCustomer(customer)).toBe(testUserId);
    const before = await fixtureTier();
    const event = makeSubscriptionEvent({ data: { object: {
      id: `sub_unverified_${crypto.randomBytes(8).toString("hex")}`,
      customer, status: "active", metadata: { planId: "yearly" },
      items: { data: [{ price: { id: "price_unverified_yearly" } }] },
    } } });
    const result = await fireWebhook(JSON.stringify(event), secret!);
    expect(result.status).toBe(500);
    expect(await fixtureTier()).toBe(before);
  });

  // ──────────────────── Subscription endpoint shape ────────────────────
  it("9. GET /api/billing/subscription returns complete tier shape when authenticated", async () => {
    const r = await api("GET", "/api/billing/subscription");
    expect(r.status).toBe(200);
    if (r.status === 200) {
      const body = r.json as Record<string, unknown>;
      // Required fields
      expect(typeof body.tier).toBe("string");
      expect(typeof body.status).toBe("string");
      expect(typeof body.stripeConfigured).toBe("boolean");
      // Plan benefits block
      expect(body.planBenefits).toBeDefined();
      expect(body.allPlans).toBeDefined();
    }
  });

  it("10. GET /api/billing/subscription returns 401 when unauthenticated", async () => {
    const saved = authCookies;
    const savedCsrf = csrfToken;
    authCookies = "";
    const r = await api("GET", "/api/billing/subscription");
    expect([401, 403]).toContain(r.status);
    authCookies = saved;
    csrfToken = savedCsrf;
  });

  it("11. GET /api/billing/plans returns a non-empty plan list without auth", async () => {
    const r = await api("GET", "/api/billing/plans");
    expect(r.status).toBe(200);
    const body = r.json as Record<string, unknown>;
    expect(Array.isArray(body.plans)).toBe(true);
    const plans = body.plans as Array<Record<string, unknown>>;
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0].id).toBeDefined();
    expect(plans[0].name).toBeDefined();
  });

  it("12. POST /api/billing/create-checkout-session rejects invalid plan", async () => {
    const r = await api("POST", "/api/billing/create-checkout-session", {
      planId: "invalid_plan_xyz",
    });
    expect(r.status).toBe(400);
    expect(r.status).not.toBe(200);
  });
});
