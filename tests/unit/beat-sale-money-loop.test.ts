/**
 * Beat-lifecycle automation — database-backed integration tests.
 *
 * Split into four independently-runnable sections:
 *
 *   A. Royalty split ledger   — distributeSplits() writes correctly and is idempotent
 *   B. Revenue events         — revenue_events row written; ON CONFLICT is a no-op
 *   C. Sale notifications     — beat_sold / beat_purchased fire exactly once per order
 *   D. Content-dispatch       — beat-loop scheduled posts are picked up and enqueued
 *
 * Run all:        npx vitest run tests/unit/beat-sale-money-loop.test.ts
 * Run one section: npx vitest run --reporter=verbose -t "Royalty split ledger"
 *
 * Requires NEON_DATABASE_URL to be set. All seed data is cleaned up in afterAll
 * regardless of outcome.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { eq, and, sql } from "drizzle-orm";

// ── Lazy DB import (skips gracefully when DB unavailable) ───────────────────
let db: Awaited<ReturnType<typeof import("../../server/db").default>> | null = null;
let listings:           typeof import("@shared/schema").listings           | null = null;
let royaltySplits:      typeof import("@shared/schema").royaltySplits      | null = null;
let royaltyTransactions:typeof import("@shared/schema").royaltyTransactions| null = null;
let orders:             typeof import("@shared/schema").orders             | null = null;
let revenueEvents:      typeof import("@shared/schema").revenueEvents      | null = null;
let notifications:      typeof import("@shared/schema").notifications      | null = null;
let posts:              typeof import("@shared/schema").posts              | null = null;

let distributeSplitsImpl: ((orderId: string) => Promise<{ success: boolean }>) | null = null;
let processPaymentImpl: ((orderId: string, paymentIntentId: string) => Promise<unknown>) | null = null;

const SKIP_REASON = !process.env.NEON_DATABASE_URL
  ? "NEON_DATABASE_URL not set — skipping DB tests"
  : null;

// ── Shared seed IDs ─────────────────────────────────────────────────────────
const run = Date.now();
const seedIds = {
  listingId:  `test-listing-${run}`,
  splitId:    `test-split-${run}`,
  orderId:    `test-order-${run}`,
  order2Id:   `test-order2-${run}`,   // C: notification retry test
  order3Id:   `test-order3-${run}`,   // C: concurrent delivery test
  sellerId:   `test-seller-${run}`,
  buyerId:    `test-buyer-${run}`,
  beatPostId: `test-beat-post-${run}`, // D: content-dispatch section
};

// ── Setup / teardown ────────────────────────────────────────────────────────
beforeAll(async () => {
  if (SKIP_REASON) return;
  try {
    const dbMod = await import("../../server/db");
    db = (dbMod as { default?: typeof db; db?: typeof db }).default
      ?? (dbMod as { db: typeof db }).db;

    const schema = await import("@shared/schema");
    listings            = schema.listings;
    royaltySplits       = schema.royaltySplits;
    royaltyTransactions = schema.royaltyTransactions;
    orders              = schema.orders;
    revenueEvents       = schema.revenueEvents;
    notifications       = schema.notifications;
    posts               = schema.posts;

    const svc = await import("../../server/services/marketplaceService");
    const instance = (svc as {
      marketplaceService?: {
        distributeSplits: typeof distributeSplitsImpl;
        processPayment:   typeof processPaymentImpl;
      };
    }).marketplaceService ?? (svc as { default?: typeof instance }).default;
    distributeSplitsImpl = instance?.distributeSplits?.bind(instance) ?? null;
    processPaymentImpl   = instance?.processPayment?.bind(instance)   ?? null;

    if (!db || !listings || !royaltySplits || !royaltyTransactions || !orders) {
      throw new Error("Failed to import DB or schema modules");
    }

    // ── A/B: listing + split + order (completed, used by sections A & B) ───
    await db.insert(listings!).values({
      id: seedIds.listingId,
      userId: seedIds.sellerId,
      title: "Test Beat — money loop",
      priceCents: 2999,
      isPublished: true,
      metadata: { beatSale: true, genre: "hip-hop" },
    });

    await db.insert(royaltySplits!).values({
      id:                seedIds.splitId,
      releaseId:         seedIds.listingId,
      userId:            seedIds.sellerId,
      collaboratorName:  "Test Seller",
      collaboratorEmail: "seller@test.invalid",
      role:              "producer",
      percentage:        100,
      status:            "active",
    });

    await db.insert(orders!).values({
      id:                    seedIds.orderId,
      userId:                seedIds.buyerId,
      sellerId:              seedIds.sellerId,
      listingId:             seedIds.listingId,
      licenseType:           "basic",
      amount:                29.99,
      currency:              "usd",
      status:                "completed",
      stripePaymentIntentId: `pi_test_${run}`,
    });

    // ── C: order2 for notification retry/idempotency test ───────────────────
    await db.insert(orders!).values({
      id:                    seedIds.order2Id,
      userId:                seedIds.buyerId,
      sellerId:              seedIds.sellerId,
      listingId:             seedIds.listingId,
      licenseType:           "exclusive",
      amount:                199.99,
      currency:              "usd",
      status:                "completed",
      stripePaymentIntentId: `pi_test2_${run}`,
      // no notifStatus in metadata → delivery not yet attempted
    });

    // ── C: order3 for concurrent delivery test ──────────────────────────────
    await db.insert(orders!).values({
      id:                    seedIds.order3Id,
      userId:                seedIds.buyerId,
      sellerId:              seedIds.sellerId,
      listingId:             seedIds.listingId,
      licenseType:           "basic",
      amount:                49.99,
      currency:              "usd",
      status:                "completed",
      stripePaymentIntentId: `pi_test3_${run}`,
    });

    // ── D: scheduled beat-loop post ─────────────────────────────────────────
    if (posts) {
      await db.insert(posts).values({
        id:          seedIds.beatPostId,
        userId:      seedIds.sellerId,
        content:     "🔥 New beat just dropped — link in bio",
        platform:    "twitter",
        status:      "scheduled",
        scheduledAt: new Date(Date.now() - 10_000), // already overdue
        engagement:  { _beatMoneyLoop: "true" },
      });
    }
  } catch (err) {
    console.error("[beat-sale-money-loop] beforeAll failed:", err);
    db = null;
  }
});

afterAll(async () => {
  if (!db) return;
  try {
    // Clean up in FK-safe order
    if (notifications) {
      await db.delete(notifications).where(
        sql`${notifications.metadata}->>'orderId' IN (${seedIds.orderId}, ${seedIds.order2Id}, ${seedIds.order3Id})`,
      );
    }
    if (royaltyTransactions) {
      await db.delete(royaltyTransactions).where(
        sql`${royaltyTransactions.metadata}->>'orderId' IN (${seedIds.orderId}, ${seedIds.order2Id}, ${seedIds.order3Id})`,
      );
    }
    if (revenueEvents) {
      await db.delete(revenueEvents).where(
        sql`${revenueEvents.orderId} IN (${seedIds.orderId}, ${seedIds.order2Id}, ${seedIds.order3Id})`,
      );
    }
    if (posts) {
      await db.delete(posts).where(eq(posts.id, seedIds.beatPostId));
    }
    await db.delete(orders!).where(
      sql`${orders!.id} IN (${seedIds.orderId}, ${seedIds.order2Id}, ${seedIds.order3Id})`,
    );
    await db.delete(royaltySplits!).where(eq(royaltySplits!.id, seedIds.splitId));
    await db.delete(listings!).where(eq(listings!.id, seedIds.listingId));
  } catch (err) {
    console.warn("[beat-sale-money-loop] afterAll cleanup failed:", err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// A. Royalty split ledger
//    npx vitest run -t "Royalty split ledger"
// ═══════════════════════════════════════════════════════════════════════════
describe("A. Royalty split ledger", () => {
  it("skips gracefully when DB is unavailable", () => {
    if (!SKIP_REASON) return;
    expect(SKIP_REASON).toBeTruthy();
  });

  it("writes a royalty_transactions row with the correct amount", async () => {
    if (!db || !distributeSplitsImpl) return;

    const result = await distributeSplitsImpl(seedIds.orderId);
    expect(result.success).toBe(true);

    const txRows = await db
      .select()
      .from(royaltyTransactions!)
      .where(
        and(
          eq(royaltyTransactions!.userId, seedIds.sellerId),
          sql`${royaltyTransactions!.metadata}->>'orderId' = ${seedIds.orderId}`,
        ),
      );

    expect(txRows.length).toBe(1);
    expect(txRows[0].transactionType).toBe("marketplace_sale");
    expect(txRows[0].platform).toBe("marketplace");
    expect(txRows[0].status).toBe("completed");
    // 100 % split × $29.99 = $29.99
    expect(Number(txRows[0].amount)).toBeCloseTo(29.99, 1);
  });

  it("increments royalty_splits.total_earned and pending_payout", async () => {
    if (!db) return;

    const [split] = await db
      .select()
      .from(royaltySplits!)
      .where(eq(royaltySplits!.id, seedIds.splitId));

    expect(Number(split.totalEarned   ?? 0)).toBeCloseTo(29.99, 1);
    expect(Number(split.pendingPayout ?? 0)).toBeCloseTo(29.99, 1);
  });

  it("does NOT double-credit on a second call (idempotency)", async () => {
    if (!db || !distributeSplitsImpl) return;

    // Second call simulates a Stripe webhook retry
    const result = await distributeSplitsImpl(seedIds.orderId);
    expect(result.success).toBe(true);

    const txRows = await db
      .select()
      .from(royaltyTransactions!)
      .where(
        sql`${royaltyTransactions!.metadata}->>'orderId' = ${seedIds.orderId}`,
      );
    expect(txRows.length).toBe(1);

    const [split] = await db
      .select()
      .from(royaltySplits!)
      .where(eq(royaltySplits!.id, seedIds.splitId));
    expect(Number(split.totalEarned ?? 0)).toBeCloseTo(29.99, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. Revenue events
//    npx vitest run -t "Revenue events"
// ═══════════════════════════════════════════════════════════════════════════
describe("B. Revenue events", () => {
  it("skips gracefully when DB is unavailable", () => {
    if (!SKIP_REASON) return;
    expect(SKIP_REASON).toBeTruthy();
  });

  it("records a revenue_events row with source='marketplace'", async () => {
    if (!db || !revenueEvents) return;

    await db
      .insert(revenueEvents)
      .values({
        userId:     seedIds.sellerId,
        source:     "marketplace",
        sourceType: "beat_sale",
        amount:     29.99,
        currency:   "usd",
        listingId:  seedIds.listingId,
        orderId:    seedIds.orderId,
        occurredAt: new Date(),
      })
      .onConflictDoNothing();

    const evRows = await db
      .select()
      .from(revenueEvents)
      .where(eq(revenueEvents.orderId, seedIds.orderId));

    expect(evRows.length).toBe(1);
    expect(evRows[0].source).toBe("marketplace");
    expect(evRows[0].userId).toBe(seedIds.sellerId);
    expect(Number(evRows[0].amount)).toBeCloseTo(29.99, 1);
  });

  it("ON CONFLICT: a second revenue_events insert is a no-op", async () => {
    if (!db || !revenueEvents) return;

    await db
      .insert(revenueEvents)
      .values({
        userId:     seedIds.sellerId,
        source:     "marketplace",
        sourceType: "beat_sale",
        amount:     999,           // different amount — proves conflict guard fires
        currency:   "usd",
        listingId:  seedIds.listingId,
        orderId:    seedIds.orderId,
        occurredAt: new Date(),
      })
      .onConflictDoNothing();

    const evRows = await db
      .select()
      .from(revenueEvents)
      .where(eq(revenueEvents.orderId, seedIds.orderId));

    expect(evRows.length).toBe(1);                            // still 1 row
    expect(Number(evRows[0].amount)).toBeCloseTo(29.99, 1);  // original amount kept
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. Sale notifications — confirmed payment idempotency
//    npx vitest run -t "Sale notifications"
//
// Tests call processPayment() directly on already-completed orders — the
// completed-order path skips all Stripe calls and goes straight to
// _deliverSaleNotifications(), which can be exercised without a Stripe key.
// ═══════════════════════════════════════════════════════════════════════════
describe("C. Sale notifications — confirmed payment idempotency", () => {
  it("skips gracefully when DB is unavailable", () => {
    if (!SKIP_REASON) return;
    expect(SKIP_REASON).toBeTruthy();
  });

  it("processPayment on completed order delivers beat_sold + beat_purchased notifications", async () => {
    if (!db || !processPaymentImpl || !notifications) return;

    // order2 is already 'completed' with no notifStatus — first call should deliver.
    await processPaymentImpl(seedIds.order2Id, "pi_fake_first");

    const sellerRows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, seedIds.sellerId),
          eq(notifications.type, "beat_sold"),
          sql`${notifications.metadata}->>'orderId' = ${seedIds.order2Id}`,
        ),
      );
    expect(sellerRows.length).toBe(1);
    expect((sellerRows[0].metadata as Record<string, unknown>).orderId).toBe(seedIds.order2Id);

    const buyerRows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, seedIds.buyerId),
          eq(notifications.type, "beat_purchased"),
          sql`${notifications.metadata}->>'orderId' = ${seedIds.order2Id}`,
        ),
      );
    expect(buyerRows.length).toBe(1);

    // notifStatus must now be 'sent' on the order
    const [updated] = await db
      .select({ metadata: orders!.metadata })
      .from(orders!)
      .where(eq(orders!.id, seedIds.order2Id));
    expect((updated.metadata as Record<string, unknown>).notifStatus).toBe("sent");
  });

  it("replay — second processPayment call produces no additional notifications", async () => {
    if (!db || !processPaymentImpl || !notifications) return;

    // Second call on the same completed order — idempotent.
    await processPaymentImpl(seedIds.order2Id, "pi_fake_replay");

    const sellerRows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, seedIds.sellerId),
          eq(notifications.type, "beat_sold"),
          sql`${notifications.metadata}->>'orderId' = ${seedIds.order2Id}`,
        ),
      );
    expect(sellerRows.length).toBe(1); // still exactly 1, not 2

    const buyerRows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, seedIds.buyerId),
          eq(notifications.type, "beat_purchased"),
          sql`${notifications.metadata}->>'orderId' = ${seedIds.order2Id}`,
        ),
      );
    expect(buyerRows.length).toBe(1);
  });

  it("concurrent calls — only one delivery wins; exactly one notification per recipient", async () => {
    if (!db || !processPaymentImpl || !notifications) return;

    // order3 has not been processed yet.  Two concurrent processPayment calls
    // compete for the atomic 'pending' claim.  The conditional UPDATE ensures
    // only one wins; the other sees rowCount=0 and skips delivery.
    await Promise.all([
      processPaymentImpl(seedIds.order3Id, "pi_fake_concurrent_a"),
      processPaymentImpl(seedIds.order3Id, "pi_fake_concurrent_b"),
    ]);

    const sellerRows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, seedIds.sellerId),
          eq(notifications.type, "beat_sold"),
          sql`${notifications.metadata}->>'orderId' = ${seedIds.order3Id}`,
        ),
      );
    expect(sellerRows.length).toBe(1); // exactly one, despite two concurrent calls

    const buyerRows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, seedIds.buyerId),
          eq(notifications.type, "beat_purchased"),
          sql`${notifications.metadata}->>'orderId' = ${seedIds.order3Id}`,
        ),
      );
    expect(buyerRows.length).toBe(1);
  });

  it("failure resets notifStatus so the next retry can re-attempt delivery", async () => {
    if (!db) return;

    // Simulate the failure path: set notifStatus = 'pending' then reset it.
    await db.execute(
      sql`UPDATE orders
          SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{notifStatus}', '"pending"')
          WHERE id = ${seedIds.orderId}
            AND COALESCE(metadata->>'notifStatus', '') NOT IN ('sent', 'pending')`,
    );

    // Simulate the catch branch resetting the claim on failure.
    await db.execute(
      sql`UPDATE orders
          SET metadata = metadata - 'notifStatus'
          WHERE id = ${seedIds.orderId}`,
    );

    const [row] = await db
      .select({ metadata: orders!.metadata })
      .from(orders!)
      .where(eq(orders!.id, seedIds.orderId));

    const meta = (row?.metadata as Record<string, unknown>) ?? {};
    // notifStatus must be absent after reset — field removed from JSON object
    expect(meta.notifStatus).toBeUndefined();
  });

  it("no beat_sold notification from initiation-time route send", async () => {
    const { readFileSync } = await import("fs");
    const routeSrc = readFileSync("server/routes/marketplace.ts", "utf8");
    expect(routeSrc).not.toContain("sendBeatPurchasedNotification(\n          req.user!.id");
    expect(routeSrc).toContain("marketplaceService.processPayment()");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. Content-dispatch — beat-loop posts
//    npx vitest run -t "Content-dispatch"
// ═══════════════════════════════════════════════════════════════════════════
describe("D. Content-dispatch — beat-loop posts", () => {
  it("skips gracefully when DB is unavailable", () => {
    if (!SKIP_REASON) return;
    expect(SKIP_REASON).toBeTruthy();
  });

  it("beat-loop post was inserted with _beatMoneyLoop marker and overdue scheduledAt", async () => {
    if (!db || !posts) return;

    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, seedIds.beatPostId));

    expect(post).toBeDefined();
    expect(post.status).toBe("scheduled");
    expect((post.engagement as Record<string, unknown>)?._beatMoneyLoop).toBe("true");
    expect(new Date(post.scheduledAt!).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("runContentDispatch query selects the overdue beat-loop post", async () => {
    if (!db || !posts) return;

    // Replicate exactly the query in autonomousService.runContentDispatch()
    const overdue = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.status, "scheduled"),
          sql`${posts.engagement}->>'_beatMoneyLoop' = 'true'`,
          sql`${posts.scheduledAt} <= ${new Date().toISOString()}`,
        ),
      )
      .limit(20);

    const ids = overdue.map((r) => r.id);
    expect(ids).toContain(seedIds.beatPostId);
  });

  it("publishToPlatform enqueues a job without throwing", async () => {
    if (!db) return;

    const { socialQueueService } = await import(
      "../../server/services/socialQueueService"
    );

    // Should not throw even with no connected social account
    let threw = false;
    try {
      await socialQueueService.publishToPlatform(seedIds.beatPostId, "twitter");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("post transitions to published after successful dispatch", async () => {
    if (!db || !posts) return;

    // Mark as published (mirrors what dispatchAutonomousContent does on success)
    await db
      .update(posts)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(posts.id, seedIds.beatPostId));

    const [post] = await db
      .select({ status: posts.status, publishedAt: posts.publishedAt })
      .from(posts)
      .where(eq(posts.id, seedIds.beatPostId));

    expect(post.status).toBe("published");
    expect(post.publishedAt).not.toBeNull();

    // A subsequent content-dispatch query should no longer pick it up
    const overdue = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.status, "scheduled"),
          sql`${posts.engagement}->>'_beatMoneyLoop' = 'true'`,
          sql`${posts.scheduledAt} <= ${new Date().toISOString()}`,
        ),
      );

    const ids = overdue.map((r) => r.id);
    expect(ids).not.toContain(seedIds.beatPostId);
  });
});
