import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Stripe from "stripe";
import { createHash, randomUUID } from "node:crypto";
import {
  applyCommerceMigrations,
  createCommerceFixtureSchema,
  loadDatabaseSubject,
  startDisposablePostgres,
} from "./helpers-database-postgres.mjs";

let cluster;
let pool;
let repository;
let CommerceEngine;
let settlement;
let webhook;
let checkout;
const testRun = randomUUID().replaceAll("-", "").slice(0, 18);

before(async () => {
  cluster = await startDisposablePostgres();
  pool = cluster.pool;
  await applyCommerceMigrations(pool);
  await createCommerceFixtureSchema(pool);

  const { CommerceRepository } = await loadDatabaseSubject("server/services/commerce/repository.ts");
  repository = new CommerceRepository(pool);
  globalThis.__commercePool = pool;
  globalThis.__commerceRepository = repository;
  globalThis.__commerceVerifiedPayment = async () => ({
    processingFeeCents: 300,
    refundedCents: 0,
    pendingCents: 0,
    disputed: false,
  });
  ({ CommerceEngine } = await loadDatabaseSubject("server/services/commerce/engine.ts"));
  settlement = await loadDatabaseSubject(
    "server/services/commerce/settlement.ts",
    {
      "../../db": "export const pool = globalThis.__commercePool;",
      "./runtime": "export const commerceRepository = globalThis.__commerceRepository;",
      "./verification": "export const verifiedPayment = (...args) => globalThis.__commerceVerifiedPayment(...args);",
    },
    { "process.env.PLATFORM_FEE_PERCENTAGE": "10" },
  );
  webhook = await loadDatabaseSubject(
    "server/services/commerceWebhookRepository.ts",
    { "../db": "export const pool = globalThis.__commercePool;" },
  );
  globalThis.__commerceSnapshotTerms = (...args) => settlement.snapshotMarketplaceTerms(...args);
  checkout = await loadDatabaseSubject(
    "server/services/commerce/marketplaceCheckout.ts",
    {
      "../../db": "export const pool = globalThis.__commercePool;",
      "./settlement": "export const snapshotMarketplaceTerms = (...args) => globalThis.__commerceSnapshotTerms(...args);",
    },
    { "process.env.PLATFORM_FEE_PERCENTAGE": "10" },
  );
});

after(async () => {
  delete globalThis.__commercePool;
  delete globalThis.__commerceRepository;
  delete globalThis.__commerceVerifiedPayment;
  delete globalThis.__commerceSnapshotTerms;
  delete globalThis.__dbStripeClient;
  if (cluster) await cluster.stop();
});

async function ensureIdentity(id) {
  await pool.query(
    "INSERT INTO users(id,created_at) VALUES($1,now()-interval '180 days') ON CONFLICT(id) DO NOTHING",
    [id],
  );
}

async function seedListing(listingId, splits = [["seller-a", 70], ["seller-b", 30]]) {
  await pool.query("INSERT INTO listings(id,metadata) VALUES($1,'{}') ON CONFLICT(id) DO NOTHING", [listingId]);
  for (const [index, [userId, percentage]] of splits.entries()) {
    await ensureIdentity(userId);
    await pool.query(
      "INSERT INTO royalty_splits(id,release_id,user_id,percentage) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
      [`${listingId}-split-${index}`, listingId, userId, percentage],
    );
  }
}

async function seedMarketplaceOrder({
  id,
  paymentIntent = `pi_${id}`,
  listingId = `listing-${id}`,
  buyerId = `buyer-${id}`,
  sellerId = "seller-a",
  grossCents = 10_000,
  licenseDocumentUrl = `local://licenses/${id}`,
  splits = [["seller-a", 70], ["seller-b", 30]],
} = {}) {
  await ensureIdentity(buyerId);
  await ensureIdentity(sellerId);
  await seedListing(listingId, splits);
  await pool.query(
    `INSERT INTO orders(
      id,user_id,seller_id,listing_id,license_type,amount,currency,status,
      stripe_payment_intent_id,license_document_url,metadata
    ) VALUES($1,$2,$3,$4,'basic',$5,'usd','pending',$6,$7,'{}')`,
    [id, buyerId, sellerId, listingId, grossCents / 100, paymentIntent, licenseDocumentUrl],
  );
  const terms = await settlement.snapshotMarketplaceTerms({
    listingId,
    sellerId,
    amount: grossCents / 100,
    currency: "usd",
    metadata: { amountCents: grossCents },
  });
  return {
    id,
    userId: buyerId,
    sellerId,
    listingId,
    amount: grossCents / 100,
    currency: "usd",
    status: "pending",
    stripePaymentIntentId: paymentIntent,
    metadata: { amountCents: grossCents, settlementTerms: terms },
  };
}

async function journalTotals() {
  return pool.query(`SELECT j.id,COALESCE(sum(e.amount_cents),0)::text AS total
    FROM commerce_journals j LEFT JOIN commerce_entries e ON e.journal_id=j.id
    GROUP BY j.id ORDER BY j.id`);
}

function sanitizedStripeError(error, secret, publishable, knownClientSecrets = []) {
  const redact = (value) => {
    let text = String(value ?? "");
    for (const sensitive of [secret, publishable, ...knownClientSecrets]) {
      if (sensitive) text = text.replaceAll(String(sensitive), "[REDACTED]");
    }
    return text
      .replace(/\b(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9_]+\b/g, "[REDACTED_KEY]")
      .replace(/\b(?:pi|seti|cs)_[A-Za-z0-9]+_secret_[A-Za-z0-9]+\b/g, "[REDACTED_CLIENT_SECRET]")
      .replace(/\bclient_secret\s*[:=]\s*[^\s,;)]+/gi, "client_secret=[REDACTED]")
      .replace(/https?:\/\/[^\s"'<>]+/gi, "[REDACTED_URL]")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 1_000);
  };
  const code = redact(error?.code || "(none)");
  const param = redact(error?.param || "(none)");
  const message = redact(error?.message || "(no message)");
  return `Stripe error type=${redact(error?.type || error?.name || "(unknown)")}; code=${code}; param=${param}; message=${message}`;
}

test("PostgreSQL migrations and real CommerceRepository settlement/fulfillment", async (t) => {
  await t.test("applies additive 0022/0023 migrations and books one balanced, allocated order atomically", async () => {
    const order = await seedMarketplaceOrder({ id: `sale-${testRun}` });
    await settlement.bookMarketplace(order);

    const source = await repository.sourceByPayment(order.stripePaymentIntentId);
    assert.equal(source.id, order.id);
    const allocations = await pool.query(
      "SELECT user_id,amount_cents FROM commerce_allocations WHERE source_id=$1 ORDER BY user_id",
      [order.id],
    );
    assert.deepEqual(
      allocations.rows.map(({ user_id, amount_cents }) => [user_id, Number(amount_cents)]),
      [["seller-a", 6_300], ["seller-b", 2_700]],
    );
    const orderState = await pool.query(
      "SELECT status,license_document_url FROM orders WHERE id=$1",
      [order.id],
    );
    assert.equal(orderState.rows[0].status, "completed");
    assert.equal(orderState.rows[0].license_document_url, `local://licenses/${order.id}`);
    const revenue = await pool.query("SELECT amount,currency,order_id FROM revenue_events WHERE order_id=$1", [order.id]);
    assert.equal(Number(revenue.rows[0].amount), 100);
    assert.equal(revenue.rows[0].currency, "usd");

    const entries = await pool.query(
      `SELECT e.account,e.user_id,e.amount_cents FROM commerce_entries e
       JOIN commerce_journals j ON j.id=e.journal_id WHERE j.id=$1 ORDER BY e.line`,
      [`sale:${order.id}`],
    );
    assert.deepEqual(
      entries.rows.map(({ account, user_id, amount_cents }) => [account, user_id, Number(amount_cents)]),
      [
        ["platform_clearing", null, -9_700],
        ["processor_expense", null, -300],
        ["platform_fee", null, 1_000],
        ["tax_liability", null, 0],
        ["payable", "seller-a", 6_300],
        ["payable", "seller-b", 2_700],
      ],
    );
    assert.deepEqual((await journalTotals()).rows.filter((row) => Number(row.total) !== 0), []);
    assert.deepEqual(await repository.balance("seller-a"), { available: 6_300, reserved: 0, paid: 0 });
    assert.deepEqual(await repository.balance("seller-b"), { available: 2_700, reserved: 0, paid: 0 });
  });

  await t.test("rolls back source, allocations, journal, revenue, and order status when fulfillment is not ready", async () => {
    const order = await seedMarketplaceOrder({
      id: `unlicensed-${testRun}`,
      licenseDocumentUrl: null,
      splits: [["seller-unlicensed", 100]],
      sellerId: "seller-unlicensed",
    });
    await assert.rejects(settlement.bookMarketplace(order), /Order license obligation is not ready/);
    const remnants = await pool.query(
      `SELECT
        (SELECT count(*) FROM commerce_sources WHERE id=$1) AS sources,
        (SELECT count(*) FROM commerce_allocations WHERE source_id=$1) AS allocations,
        (SELECT count(*) FROM commerce_journals WHERE id=$2) AS journals,
        (SELECT count(*) FROM revenue_events WHERE order_id=$1) AS revenue,
        (SELECT status FROM orders WHERE id=$1) AS status`,
      [order.id, `sale:${order.id}`],
    );
    assert.deepEqual(remnants.rows[0], {
      sources: "0",
      allocations: "0",
      journals: "0",
      revenue: "0",
      status: "pending",
    });
  });

  await t.test("concurrent duplicate settlements serialize on the production advisory lock", async () => {
    const order = await seedMarketplaceOrder({
      id: `parallel-${testRun}`,
      splits: [["seller-parallel", 100]],
      sellerId: "seller-parallel",
    });
    const attempts = 8;
    let entered = 0;
    let openBarrier;
    let releaseBarrier;
    const allAtBarrier = new Promise((resolve) => { openBarrier = resolve; });
    const barrier = new Promise((resolve) => { releaseBarrier = resolve; });
    globalThis.__commerceVerifiedPayment = async () => {
      entered += 1;
      if (entered === attempts) openBarrier();
      await barrier;
      return { processingFeeCents: 300, refundedCents: 0, pendingCents: 0, disputed: false };
    };
    try {
      const calls = Array.from({ length: attempts }, () => settlement.bookMarketplace(order));
      let barrierTimer;
      await Promise.race([
        allAtBarrier,
        new Promise((_, reject) => {
          barrierTimer = setTimeout(() => reject(new Error("Settlement concurrency barrier timed out")), 8_000);
          barrierTimer.unref();
        }),
      ]);
      clearTimeout(barrierTimer);
      releaseBarrier();
      await Promise.all(calls);
    } finally {
      releaseBarrier();
      globalThis.__commerceVerifiedPayment = async () => ({
        processingFeeCents: 300,
        refundedCents: 0,
        pendingCents: 0,
        disputed: false,
      });
    }
    assert.equal(entered, attempts);
    const counts = await pool.query(
      `SELECT
        (SELECT count(*) FROM commerce_sources WHERE id=$1) AS sources,
        (SELECT count(*) FROM commerce_allocations WHERE source_id=$1) AS allocations,
        (SELECT count(*) FROM commerce_journals WHERE id=$2) AS journals,
        (SELECT count(*) FROM revenue_events WHERE order_id=$1) AS revenue`,
      [order.id, `sale:${order.id}`],
    );
    assert.deepEqual(counts.rows[0], { sources: "1", allocations: "1", journals: "1", revenue: "1" });
  });

  await t.test("rejects a reused PaymentIntent attached to another order", async () => {
    const settled = await seedMarketplaceOrder({
      id: `pi-owner-${testRun}`,
      paymentIntent: `pi-shared-${testRun}`,
      splits: [["seller-shared", 100]],
      sellerId: "seller-shared",
    });
    await settlement.bookMarketplace(settled);
    const other = await seedMarketplaceOrder({
      id: `pi-impostor-${testRun}`,
      paymentIntent: settled.stripePaymentIntentId,
      splits: [["seller-impostor", 100]],
      sellerId: "seller-impostor",
    });
    await assert.rejects(settlement.bookMarketplace(other), /Payment already allocated to a different order/);
    assert.equal((await repository.sourceByPayment(settled.stripePaymentIntentId)).id, settled.id);
  });

  await t.test("database deferred constraint also rejects unbalanced journals at COMMIT", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO commerce_journals(id,currency,source) VALUES($1,'usd','constraint-test')", [`unbalanced-${testRun}`]);
      await client.query(
        "INSERT INTO commerce_entries(journal_id,line,account,amount_cents) VALUES($1,0,'payable',1)",
        [`unbalanced-${testRun}`],
      );
      await assert.rejects(client.query("COMMIT"));
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    assert.equal(
      (await pool.query("SELECT count(*) FROM commerce_journals WHERE id=$1", [`unbalanced-${testRun}`])).rows[0].count,
      "0",
    );
  });
});

test("CommerceEngine executes production payout/refund/reversal workflows against SQL", async (t) => {
  const walletSellerA = `seller-wallet-${testRun}`;
  const walletSellerB = `seller-wallet-split-${testRun}`;
  const order = await seedMarketplaceOrder({
    id: `wallet-${testRun}`,
    sellerId: walletSellerA,
    splits: [[walletSellerA, 70], [walletSellerB, 30]],
  });
  await settlement.bookMarketplace(order);

  const providerCalls = [];
  const provider = {
    async transfer(op) {
      providerCalls.push(["transfer", op.id]);
      return `tr_${op.id}`;
    },
    async payout(op) {
      providerCalls.push(["payout", op.id]);
      return { id: `po_${op.id}`, status: "paid" };
    },
    async refund(op) {
      providerCalls.push(["refund", op.amount_cents]);
      return {
        id: `re_${op.id}`,
        status: "succeeded",
        refundedCents: op.amount_cents === 2_000 ? 2_000 : 10_000,
        pendingCents: 0,
      };
    },
    async reverse(op) {
      providerCalls.push(["reverse", op.id]);
      return `trr_${op.id}`;
    },
  };
  const engine = new CommerceEngine(repository, provider);

  await t.test("reserves against funded payable, idempotently, and rejects over-reservation", async () => {
    const payout = await repository.reserve(walletSellerA, 1_000, "usd", `payout-${testRun}`, "acct-local");
    const retry = await repository.reserve(walletSellerA, 1_000, "usd", `payout-${testRun}`, "acct-local");
    assert.equal(retry.id, payout.id);
    await assert.rejects(
      repository.reserve(walletSellerA, 1_000, "usd", `payout-${testRun}`, "acct-changed"),
      /Idempotency key reused with different payout account/,
    );
    await assert.rejects(
      repository.reserve(walletSellerA, 900, "usd", `payout-${testRun}`, "acct-local"),
      /Idempotency key reused with different payout/,
    );
    await assert.rejects(
      repository.reserve(walletSellerA, 10_000, "usd", `overdraw-${testRun}`, "acct-local"),
      /Insufficient funded unreserved balance/,
    );
    assert.deepEqual(await repository.balance(walletSellerA), { available: 5_300, reserved: 1_000, paid: 0 });

    const legacySeller = `seller-legacy-binding-${testRun}`;
    const legacyOrder = await seedMarketplaceOrder({
      id: `legacy-binding-${testRun}`,
      sellerId: legacySeller,
      splits: [[legacySeller, 100]],
    });
    await settlement.bookMarketplace(legacyOrder);
    const legacyKey = `legacy-binding-key-${testRun}`;
    const legacyId = `wd_${createHash("sha256").update(`${legacySeller}:${legacyKey}`).digest("hex")}`;
    await pool.query(
      `INSERT INTO commerce_operations(id,kind,user_id,currency,amount_cents,payload)
       VALUES($1,'withdrawal',$2,'usd',1000,'{}')`,
      [legacyId, legacySeller],
    );
    await assert.rejects(
      repository.reserve(legacySeller, 1_000, "usd", legacyKey, "acct-rebound"),
      /Idempotency key reused with different payout account/,
    );
    const legacy = await pool.query("SELECT payload FROM commerce_operations WHERE id=$1", [legacyId]);
    assert.deepEqual(legacy.rows[0].payload, {});
  });

  await t.test("concurrent same-key requests for conflicting payout accounts have one immutable winner", async () => {
    const collisionSeller = `seller-account-race-${testRun}`;
    const collisionOrder = await seedMarketplaceOrder({
      id: `account-race-${testRun}`,
      sellerId: collisionSeller,
      splits: [[collisionSeller, 100]],
    });
    await settlement.bookMarketplace(collisionOrder);
    const key = `account-race-key-${testRun}`;
    const operationId = `wd_${createHash("sha256").update(`${collisionSeller}:${key}`).digest("hex")}`;
    const results = await Promise.allSettled([
      repository.reserve(collisionSeller, 1_000, "usd", key, "acct-race-a"),
      repository.reserve(collisionSeller, 1_000, "usd", key, "acct-race-b"),
    ]);
    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    assert.match(failures[0].reason.message, /Idempotency key reused with different payout account/);
    const persisted = await pool.query(
      `SELECT payload,amount_cents FROM commerce_operations WHERE id=$1`,
      [operationId],
    );
    assert.equal(persisted.rows.length, 1);
    assert.ok(["acct-race-a", "acct-race-b"].includes(persisted.rows[0].payload.accountId));
    assert.equal(Number(persisted.rows[0].amount_cents), 1_000);
    const draws = await pool.query(
      "SELECT COALESCE(sum(amount_cents),0)::text AS cents FROM commerce_draws WHERE operation_id=$1",
      [operationId],
    );
    assert.equal(Number(draws.rows[0].cents), 1_000);
    assert.deepEqual(await repository.balance(collisionSeller), { available: 8_000, reserved: 1_000, paid: 0 });
  });

  await t.test("pays a claimed reservation through the engine's real SQL state transitions", async () => {
    const reservation = (await repository.history(walletSellerA)).find((row) => row.payload.accountId === "acct-local");
    assert.ok(reservation);
    const result = await engine.execute(reservation.id);
    assert.equal(result.state, "completed");
    assert.deepEqual(providerCalls.slice(0, 2).map(([method]) => method), ["transfer", "payout"]);
    assert.deepEqual(await repository.balance(walletSellerA), { available: 5_300, reserved: 0, paid: 1_000 });
  });

  await t.test("refund authorization, duplicate intent, partial reversal, and over-refund guardrails", async () => {
    await assert.rejects(
      repository.refundIntent(order.id, "not-the-buyer", 2_000, `unauthorized-${testRun}`),
      /Not authorized to refund this order/,
    );
    const refund = await repository.refundIntent(order.id, order.userId, 2_000, `partial-${testRun}`);
    const retry = await repository.refundIntent(order.id, order.userId, 2_000, `partial-${testRun}`);
    assert.equal(retry.id, refund.id);
    await assert.rejects(
      repository.refundIntent(order.id, order.userId, 3_000, `partial-${testRun}`),
      /Refund idempotency conflict/,
    );
    await assert.rejects(
      repository.refundIntent(order.id, order.userId, 9_000, `too-much-${testRun}`),
      /Refund exceeds remaining amount/,
    );
    await pool.query("INSERT INTO refunds(id,status) VALUES($1,'pending')", [refund.id]);
    const completed = await engine.execute(refund.id);
    assert.equal(completed.state, "completed");
    assert.equal((await pool.query("SELECT status FROM refunds WHERE id=$1", [refund.id])).rows[0].status, "succeeded");
    const allocation = await pool.query(
      "SELECT amount_cents,reversed_cents,drawn_cents FROM commerce_allocations WHERE id=$1",
      [`${order.id}:${walletSellerA}`],
    );
    assert.deepEqual(
      [Number(allocation.rows[0].amount_cents), Number(allocation.rows[0].reversed_cents), Number(allocation.rows[0].drawn_cents)],
      [6_300, 1_260, 1_000],
    );
  });

  await t.test("full refund creates balanced reversal, exposes the debt, then recovers it exactly once", async () => {
    const fullRefund = await repository.refundIntent(order.id, order.userId, 8_000, `remainder-${testRun}`);
    await pool.query("INSERT INTO refunds(id,status) VALUES($1,'pending')", [fullRefund.id]);
    const completed = await engine.execute(fullRefund.id);
    assert.equal(completed.state, "completed");
    const source = await repository.sourceByPayment(order.stripePaymentIntentId);
    assert.equal(Number(source.refunded_cents), 10_000);
    assert.equal(Number(source.compensated_cents), 10_000);
    assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1", [order.id])).rows[0].status, "refunded");

    const reversalRows = await pool.query(
      "SELECT * FROM commerce_operations WHERE kind='reversal' AND payload->>'sourceId'=$1",
      [order.id],
    );
    assert.equal(reversalRows.rows.length, 1);
    assert.equal(Number(reversalRows.rows[0].amount_cents), 1_000);
    assert.equal((await repository.balance(walletSellerA)).available, -1_000);
    await assert.rejects(
      repository.reserve(walletSellerA, 1, "usd", `debt-reserve-${testRun}`, "acct-local"),
      /Insufficient funded unreserved balance/,
    );

    const recovered = await engine.execute(reversalRows.rows[0].id);
    assert.equal(recovered.state, "completed");
    assert.equal(await engine.execute(reversalRows.rows[0].id), undefined);
    assert.deepEqual(await repository.balance(walletSellerA), { available: 0, reserved: 0, paid: 1_000 });
    assert.deepEqual((await journalTotals()).rows.filter((row) => Number(row.total) !== 0), []);
    await assert.rejects(
      repository.refundIntent(order.id, order.userId, 1, `after-full-${testRun}`),
      /Refund exceeds remaining amount/,
    );
  });
});

test("production commerce webhook inbox deduplicates concurrent duplicate events", async () => {
  const order = await seedMarketplaceOrder({
    id: `webhook-${testRun}`,
    splits: [["seller-webhook", 100]],
    sellerId: "seller-webhook",
  });
  let handlerCalls = 0;
  let signalStarted;
  let releaseHandler;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  const wait = new Promise((resolve) => { releaseHandler = resolve; });
  const event = { id: `evt_${testRun}`, type: "payment_intent.succeeded" };
  const handler = async () => {
    handlerCalls += 1;
    signalStarted();
    await wait;
    await settlement.bookMarketplace(order);
    return { success: true, message: "settled" };
  };
  const first = webhook.processCommerceEvent(event, handler);
  try {
    await started;
    const competing = await webhook.processCommerceEvent(event, handler);
    assert.equal(competing.success, false);
    releaseHandler();
    assert.deepEqual(await first, { success: true, message: "settled" });
  } finally {
    releaseHandler();
  }
  const replay = await webhook.processCommerceEvent(event, handler);
  assert.equal(replay.success, true);
  assert.equal(handlerCalls, 1);
  assert.equal(
    (await pool.query("SELECT count(*) FROM commerce_webhook_receipts WHERE event_id=$1", [event.id])).rows[0].count,
    "1",
  );
  assert.equal((await repository.sourceByPayment(order.stripePaymentIntentId)).id, order.id);
});

const hasStripeTestCredentials = Boolean(process.env.STRIPE_TEST_SECRET && process.env.STRIPE_TEST_CLIENT);
test(
  "real Stripe test-mode checkout and PaymentIntent settle through production code in disposable SQL",
  {
    skip: hasStripeTestCredentials ? false : "STRIPE_TEST_SECRET and STRIPE_TEST_CLIENT were not supplied.",
    timeout: 90_000,
  },
  async (context) => {
    const secret = process.env.STRIPE_TEST_SECRET;
    const publishable = process.env.STRIPE_TEST_CLIENT;
    let stripe;
    let stripeCustomer;
    let stripePaymentMethod;
    let paymentIntent;
    let checkoutOrderId;
    let checkoutSessionId;
    let checkoutBuyerId;
    let checkoutListingId;
    let stripeCleanupFailed = false;
    let stage = "test-key validation";
    let failureKind = "verification-error";
    try {
      assert.ok(secret?.startsWith("sk_test_") && publishable?.startsWith("pk_test_"), "test-only Stripe keys required");
      stripe = new Stripe(secret, { maxNetworkRetries: 1, timeout: 15_000 });
      stage = "test-mode balance and webhook endpoint inspection";
      const balance = await stripe.balance.retrieve();
      assert.equal(balance.livemode, false, "Stripe account must be in test mode");
      let enabledEndpointCount = 0;
      let cursor;
      let endpointListingComplete = true;
      do {
        const page = await stripe.webhookEndpoints.list({
          limit: 100,
          ...(cursor ? { starting_after: cursor } : {}),
        });
        enabledEndpointCount += page.data.filter((endpoint) => endpoint.status === "enabled").length;
        if (!page.has_more) break;
        cursor = page.data.at(-1)?.id;
        if (!cursor) {
          endpointListingComplete = false;
          break;
        }
      } while (true);
      context.diagnostic(
        `Stripe test-mode webhook safety check: enabled endpoint count=${enabledEndpointCount}; listing complete=${endpointListingComplete}.`,
      );
      if (!endpointListingComplete || enabledEndpointCount > 0) {
        context.skip(
          "Real Stripe writes blocked: enabled webhook endpoint(s) may deliver events to shared application state.",
        );
        return;
      }

      const stripeBuyer = `stripe-buyer-${testRun}`;
      const stripeSeller = `stripe-seller-${testRun}`;
      const checkoutListing = `stripe-checkout-listing-${testRun}`;
      checkoutBuyerId = stripeBuyer;
      checkoutListingId = checkoutListing;
      await ensureIdentity(stripeBuyer);
      await ensureIdentity(stripeSeller);
      await seedListing(checkoutListing, [[stripeSeller, 100]]);
      stage = "production marketplace checkout";
      const checkoutResult = await checkout.createMarketplaceCheckout(stripe, {
        buyerId: stripeBuyer,
        sellerId: stripeSeller,
        beatId: checkoutListing,
        licenseType: "basic",
        amountCents: 1_200,
        licenseSnapshot: null,
        title: "Disposable commerce integration test item",
        successUrl: "https://example.com/test/complete",
        cancelUrl: "https://example.com/test/cancel",
      });
      checkoutOrderId = checkoutResult.orderId;
      checkoutSessionId = checkoutResult.sessionId;
      assert.ok(typeof checkoutResult.url === "string" && checkoutResult.url.startsWith("https://"));
      const frozenCheckout = await pool.query(
        "SELECT metadata,license_type FROM orders WHERE id=$1",
        [checkoutOrderId],
      );
      assert.equal(frozenCheckout.rows[0].metadata.settlementTerms.version, 1);
      assert.equal(frozenCheckout.rows[0].metadata.sessionId, checkoutSessionId);
      assert.equal(frozenCheckout.rows[0].license_type, "basic");
      context.diagnostic("Production marketplace checkout succeeded in Stripe test mode; its open session is expired during cleanup.");

      stage = "test Customer and card PaymentMethod setup";
      stripeCustomer = await stripe.customers.create(
        {
          email: `commerce-test-${testRun}@example.com`,
          metadata: { disposableDatabaseIntegration: testRun },
        },
        { idempotencyKey: `db-customer-${testRun}` },
      );
      stripePaymentMethod = await stripe.paymentMethods.create(
        {
          type: "card",
          card: { token: "tok_visa" },
          billing_details: { email: `commerce-test-${testRun}@example.com` },
        },
        { idempotencyKey: `db-payment-method-${testRun}` },
      );
      stripePaymentMethod = await stripe.paymentMethods.attach(
        stripePaymentMethod.id,
        { customer: stripeCustomer.id },
        { idempotencyKey: `db-attach-payment-method-${testRun}` },
      );

      stage = "test PaymentIntent creation";
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: 2_000,
          currency: "usd",
          customer: stripeCustomer.id,
          payment_method: stripePaymentMethod.id,
          payment_method_types: ["card"],
          confirm: true,
          return_url: "https://example.com/test/return",
          metadata: { disposableDatabaseIntegration: testRun },
        },
        { idempotencyKey: `db-commerce-${testRun}` },
      );
      assert.equal(paymentIntent.status, "succeeded");
      assert.equal(paymentIntent.amount_received, 2_000);
      assert.equal(paymentIntent.livemode, false);
      assert.ok(typeof paymentIntent.client_secret === "string");

      // Exercise publishable-key retrieval without ever printing the URL or
      // client_secret. The response body is held only in memory.
      stage = "publishable-key pairing";
      const clientResponse = await fetch(
        `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntent.id)}?client_secret=${encodeURIComponent(paymentIntent.client_secret)}`,
        {
          headers: { authorization: `Bearer ${publishable}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      const clientPaymentIntent = clientResponse.ok ? await clientResponse.json() : null;
      assert.equal(clientPaymentIntent?.id, paymentIntent.id, "publishable key must retrieve its paired test intent");
      assert.equal(clientPaymentIntent?.livemode, false);

      stage = "provider settlement accounting readiness";
      let accountingProbe;
      let probeCharge;
      const accountingDeadline = Date.now() + 15_000;
      do {
        accountingProbe = await stripe.paymentIntents.retrieve(
          paymentIntent.id,
          { expand: ["latest_charge.balance_transaction"] },
        );
        probeCharge = typeof accountingProbe.latest_charge === "string"
          ? await stripe.charges.retrieve(accountingProbe.latest_charge, { expand: ["balance_transaction"] })
          : accountingProbe.latest_charge;
        if (probeCharge?.balance_transaction) break;
        if (Date.now() < accountingDeadline) await new Promise((resolve) => setTimeout(resolve, 1_000));
      } while (Date.now() < accountingDeadline);
      context.diagnostic(
        `Stripe accounting probe: PI status=${accountingProbe.status}; charge present=${Boolean(probeCharge)}; charge status=${probeCharge?.status || "(none)"}; balance transaction present=${Boolean(probeCharge?.balance_transaction)}; bounded readiness wait complete.`,
      );
      if (!probeCharge?.balance_transaction) {
        throw new Error("Stripe test charge balance transaction did not become available within the bounded readiness window.");
      }

      stage = "production settlement with Stripe verifiedPayment";
      globalThis.__dbStripeClient = stripe;
      const realSettlement = await loadDatabaseSubject(
        "server/services/commerce/settlement.ts",
        {
          "../../db": "export const pool = globalThis.__commercePool;",
          "./runtime": "export const commerceRepository = globalThis.__commerceRepository; export const commerceStripe = () => globalThis.__dbStripeClient;",
        },
        { "process.env.PLATFORM_FEE_PERCENTAGE": "10" },
      );
      const realListing = `stripe-paid-listing-${testRun}`;
      const realBuyer = `stripe-paid-buyer-${testRun}`;
      const realSeller = `stripe-paid-seller-${testRun}`;
      await ensureIdentity(realBuyer);
      await ensureIdentity(realSeller);
      await seedListing(realListing, [[realSeller, 100]]);
      const realOrderId = `stripe-paid-order-${testRun}`;
      await pool.query(
        `INSERT INTO orders(
          id,user_id,seller_id,listing_id,license_type,amount,currency,status,
          stripe_payment_intent_id,license_document_url,metadata
        ) VALUES($1,$2,$3,$4,'basic',20,'usd','pending',$5,$6,'{}')`,
        [realOrderId, realBuyer, realSeller, realListing, paymentIntent.id, `local://licenses/${realOrderId}`],
      );
      const terms = await realSettlement.snapshotMarketplaceTerms({
        listingId: realListing,
        sellerId: realSeller,
        amount: 20,
        currency: "usd",
        metadata: { amountCents: 2_000 },
      });
      await realSettlement.bookMarketplace({
        id: realOrderId,
        userId: realBuyer,
        sellerId: realSeller,
        listingId: realListing,
        amount: 20,
        currency: "usd",
        status: "pending",
        stripePaymentIntentId: paymentIntent.id,
        metadata: { amountCents: 2_000, settlementTerms: terms },
      });
      const realLedger = await pool.query(
        `SELECT e.account,e.amount_cents FROM commerce_entries e
         JOIN commerce_journals j ON j.id=e.journal_id WHERE j.id=$1 ORDER BY e.line`,
        [`sale:${realOrderId}`],
      );
      const actualCharge = typeof paymentIntent.latest_charge === "string"
        ? await stripe.charges.retrieve(paymentIntent.latest_charge, { expand: ["balance_transaction"] })
        : paymentIntent.latest_charge;
      const actualBalance = typeof actualCharge?.balance_transaction === "string"
        ? await stripe.balanceTransactions.retrieve(actualCharge.balance_transaction)
        : actualCharge?.balance_transaction;
      assert.ok(actualBalance && actualBalance.amount === 2_000 && actualBalance.currency === "usd");
      const expense = realLedger.rows.find((row) => row.account === "processor_expense");
      assert.equal(Number(expense?.amount_cents), -actualBalance.fee);
      assert.equal((await pool.query("SELECT status FROM orders WHERE id=$1", [realOrderId])).rows[0].status, "completed");
      assert.deepEqual((await journalTotals()).rows.filter((row) => Number(row.total) !== 0), []);
    } catch (error) {
      if (error?.payment_intent?.id) paymentIntent = error.payment_intent;
      context.diagnostic(
        `${stage}: ${sanitizedStripeError(
          error,
          secret,
          publishable,
          [paymentIntent?.client_secret, error?.payment_intent?.client_secret],
        )}`,
      );
      const safeTypes = new Set([
        "StripeAPIError",
        "StripeAuthenticationError",
        "StripeConnectionError",
        "StripeInvalidGrantError",
        "StripeInvalidRequestError",
        "StripePermissionError",
        "StripeRateLimitError",
        "StripeSignatureVerificationError",
        "StripeUnknownError",
      ]);
      if (safeTypes.has(error?.type)) failureKind = error.type;
      else if (error?.name === "AssertionError") failureKind = "assertion";
      else if (typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)) {
        failureKind = `sqlstate-${error.code}`;
      } else if (/^[A-Za-z]+Error$/.test(error?.name || "")) {
        failureKind = error.name;
      }
      throw new Error(`Stripe test-mode verification failed at ${stage} (${failureKind}); provider details were withheld.`);
    } finally {
      if (stripe && checkoutBuyerId && checkoutListingId) {
        try {
          const row = await pool.query(
            "SELECT id,metadata FROM orders WHERE user_id=$1 AND listing_id=$2 AND license_type='basic' ORDER BY created_at DESC LIMIT 1",
            [checkoutBuyerId, checkoutListingId],
          );
          checkoutOrderId ||= row.rows[0]?.id;
          checkoutSessionId ||= row.rows[0]?.metadata?.sessionId;
          if (checkoutOrderId && !checkoutSessionId) {
            const sessions = await stripe.checkout.sessions.list({
              limit: 100,
              created: { gte: Math.floor(Date.now() / 1000) - 300 },
            });
            checkoutSessionId = sessions.data.find((session) => session.metadata?.orderId === checkoutOrderId)?.id;
          }
        } catch {
          stripeCleanupFailed = true;
        }
      }
      if (stripe && checkoutOrderId && !checkoutSessionId) {
        try {
          const row = await pool.query("SELECT metadata FROM orders WHERE id=$1", [checkoutOrderId]);
          checkoutSessionId = row.rows[0]?.metadata?.sessionId;
        } catch {
          stripeCleanupFailed = true;
        }
      }
      if (stripe && checkoutSessionId) {
        try {
          const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
          if (session.status === "open") await stripe.checkout.sessions.expire(checkoutSessionId);
        } catch {
          stripeCleanupFailed = true;
        }
      }
      if (stripe && paymentIntent?.id) {
        try {
          const current = await stripe.paymentIntents.retrieve(paymentIntent.id);
          if (current.status === "succeeded") {
            const refunds = await stripe.refunds.list({ payment_intent: paymentIntent.id, limit: 100 });
            const refunded = refunds.data
              .filter((refund) => refund.status === "succeeded")
              .reduce((sum, refund) => sum + refund.amount, 0);
            if ((current.amount_received || current.amount) > refunded) {
              await stripe.refunds.create(
                { payment_intent: paymentIntent.id, amount: (current.amount_received || current.amount) - refunded },
                { idempotencyKey: `db-cleanup-${testRun}` },
              );
            }
          } else if (current.status !== "canceled") {
            await stripe.paymentIntents.cancel(paymentIntent.id);
          }
        } catch {
          stripeCleanupFailed = true;
        }
      }
      if (stripe && stripePaymentMethod?.id) {
        try {
          const current = await stripe.paymentMethods.retrieve(stripePaymentMethod.id);
          if (current.customer) await stripe.paymentMethods.detach(stripePaymentMethod.id);
        } catch {
          stripeCleanupFailed = true;
        }
      }
      if (stripe && stripeCustomer?.id) {
        try {
          const current = await stripe.customers.retrieve(stripeCustomer.id);
          if (!current.deleted) await stripe.customers.del(stripeCustomer.id);
        } catch {
          stripeCleanupFailed = true;
        }
      }
      delete globalThis.__dbStripeClient;
    }
    if (stripeCleanupFailed) throw new Error("Stripe test resources could not be fully cleaned up; provider details were withheld.");
  },
);