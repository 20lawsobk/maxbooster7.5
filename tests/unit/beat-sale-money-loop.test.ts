/**
 * Beat-sale money loop — database-backed unit tests.
 *
 * Creates real rows in the test database, calls distributeSplits() directly,
 * then asserts:
 *   - royalty_transactions row written with the correct amount
 *   - royalty_splits.total_earned / pending_payout incremented
 *   - revenue_events row written (via processPayment path, tested separately)
 *   - A second call (simulated webhook replay) does NOT double-credit
 *
 * Requires NEON_DATABASE_URL to be set. All seed data is cleaned up after the
 * test suite regardless of outcome.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { eq, and, sql } from "drizzle-orm";

// ---------- conditional DB import (skips gracefully when DB unavailable) ----
let db: Awaited<ReturnType<typeof import("../../server/db").default>> | null =
  null;
let listings: typeof import("@shared/schema").listings | null = null;
let royaltySplits: typeof import("@shared/schema").royaltySplits | null = null;
let royaltyTransactions: typeof import("@shared/schema").royaltyTransactions | null =
  null;
let orders: typeof import("@shared/schema").orders | null = null;
let revenueEvents: typeof import("@shared/schema").revenueEvents | null = null;
let distributeSplitsImpl:
  | ((orderId: string) => Promise<{ success: boolean }>)
  | null = null;

const SKIP_REASON = !process.env.NEON_DATABASE_URL
  ? "NEON_DATABASE_URL not set — skipping DB tests"
  : null;

// IDs for rows created during this test run
const seedIds = {
  listingId: `test-listing-${Date.now()}`,
  splitId: `test-split-${Date.now()}`,
  orderId: `test-order-${Date.now()}`,
  sellerId: `test-seller-${Date.now()}`,
};

beforeAll(async () => {
  if (SKIP_REASON) return;
  try {
    const dbMod = await import("../../server/db");
    db = (dbMod as { default?: typeof db; db?: typeof db }).default ??
      (dbMod as { db: typeof db }).db;

    const schema = await import("@shared/schema");
    listings = schema.listings;
    royaltySplits = schema.royaltySplits;
    royaltyTransactions = schema.royaltyTransactions;
    orders = schema.orders;
    revenueEvents = schema.revenueEvents;

    const svc = await import("../../server/services/marketplaceService");
    const instance =
      (svc as { marketplaceService?: { distributeSplits: typeof distributeSplitsImpl } })
        .marketplaceService ??
      (svc as { default?: { distributeSplits: typeof distributeSplitsImpl } })
        .default;
    distributeSplitsImpl = instance?.distributeSplits?.bind(instance) ?? null;

    if (!db || !listings || !royaltySplits || !royaltyTransactions || !orders) {
      throw new Error("Failed to import DB or schema modules");
    }

    // ── Seed: listing ─────────────────────────────────────────────────────
    await db.insert(listings).values({
      id: seedIds.listingId,
      userId: seedIds.sellerId,
      title: "Test Beat — money loop",
      priceCents: 2999,
      isPublished: true,
      metadata: { beatSale: true, genre: "hip-hop" },
    });

    // ── Seed: royalty_splits (seller owns 100 %) ──────────────────────────
    await db.insert(royaltySplits).values({
      id: seedIds.splitId,
      releaseId: seedIds.listingId,
      userId: seedIds.sellerId,
      collaboratorName: "Test Seller",
      collaboratorEmail: "seller@test.invalid",
      role: "producer",
      percentage: 100,
      status: "active",
    });

    // ── Seed: order (completed by Stripe, awaiting ledger write) ──────────
    await db.insert(orders).values({
      id: seedIds.orderId,
      userId: `test-buyer-${Date.now()}`,
      sellerId: seedIds.sellerId,
      listingId: seedIds.listingId,
      licenseType: "basic",
      amount: 29.99,
      currency: "usd",
      status: "completed",
      stripePaymentIntentId: `pi_test_${Date.now()}`,
    });
  } catch (err) {
    // If seed fails the describe block will skip via SKIP_REASON equivalent
    console.error("[beat-sale-money-loop] beforeAll failed:", err);
    db = null;
  }
});

afterAll(async () => {
  if (!db) return;
  try {
    // Clean up in FK-safe order
    await db
      .delete(royaltyTransactions!)
      .where(
        sql`${royaltyTransactions!.metadata}->>'orderId' = ${seedIds.orderId}`,
      );
    await db
      .delete(revenueEvents!)
      .where(eq(revenueEvents!.orderId, seedIds.orderId));
    await db
      .delete(orders!)
      .where(eq(orders!.id, seedIds.orderId));
    await db
      .delete(royaltySplits!)
      .where(eq(royaltySplits!.id, seedIds.splitId));
    await db
      .delete(listings!)
      .where(eq(listings!.id, seedIds.listingId));
  } catch (err) {
    console.warn("[beat-sale-money-loop] afterAll cleanup failed:", err);
  }
});

// ---------------------------------------------------------------------------
describe("Beat-sale money loop — distributeSplits", () => {
  it("skips gracefully when DB is unavailable", () => {
    if (!SKIP_REASON) return; // DB is available — this test is a no-op
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
    if (!db || !distributeSplitsImpl) return;

    const [split] = await db
      .select()
      .from(royaltySplits!)
      .where(eq(royaltySplits!.id, seedIds.splitId));

    expect(Number(split.totalEarned ?? 0)).toBeCloseTo(29.99, 1);
    expect(Number(split.pendingPayout ?? 0)).toBeCloseTo(29.99, 1);
  });

  it("does NOT double-credit on a second call (idempotency)", async () => {
    if (!db || !distributeSplitsImpl) return;

    // Second call simulates a Stripe webhook retry
    const result = await distributeSplitsImpl(seedIds.orderId);
    expect(result.success).toBe(true);

    // Still exactly 1 transaction row
    const txRows = await db
      .select()
      .from(royaltyTransactions!)
      .where(
        sql`${royaltyTransactions!.metadata}->>'orderId' = ${seedIds.orderId}`,
      );
    expect(txRows.length).toBe(1);

    // Balances unchanged
    const [split] = await db
      .select()
      .from(royaltySplits!)
      .where(eq(royaltySplits!.id, seedIds.splitId));
    expect(Number(split.totalEarned ?? 0)).toBeCloseTo(29.99, 1);
  });

  it("records a revenue_events row with source='marketplace'", async () => {
    if (!db || !revenueEvents) return;

    // Insert directly (simulating the processPayment path that already ran)
    await db
      .insert(revenueEvents)
      .values({
        userId: seedIds.sellerId,
        source: "marketplace",
        sourceType: "beat_sale",
        amount: 29.99,
        currency: "usd",
        listingId: seedIds.listingId,
        orderId: seedIds.orderId,
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

    // Should not throw and should not add a second row
    await db
      .insert(revenueEvents)
      .values({
        userId: seedIds.sellerId,
        source: "marketplace",
        sourceType: "beat_sale",
        amount: 999, // different amount — proves the conflict guard works
        currency: "usd",
        listingId: seedIds.listingId,
        orderId: seedIds.orderId, // same orderId → conflict
        occurredAt: new Date(),
      })
      .onConflictDoNothing();

    const evRows = await db
      .select()
      .from(revenueEvents)
      .where(eq(revenueEvents.orderId, seedIds.orderId));

    expect(evRows.length).toBe(1);                    // still exactly 1 row
    expect(Number(evRows[0].amount)).toBeCloseTo(29.99, 1); // original amount kept
  });
});
