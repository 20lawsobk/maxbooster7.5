// @ts-nocheck
/**
 * Fan Memberships API
 *
 * Provides artist-facing endpoints to manage fan club tiers, view subscribers,
 * and configure the loyalty wallet programme (credits for engagement).
 *
 * Routes are mounted at /api/fan-memberships
 */

import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import {
  membershipTiers,
  customerMemberships,
  storefronts,
  fanWallets,
  fanCreditTransactions,
  fanLoyaltyConfigs,
  users,
  insertFanCreditTransactionSchema,
} from "@shared/schema";
import {
  eq,
  and,
  desc,
  count,
  sql,
  sum,
} from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";

const router = Router();
router.use(requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getArtistStorefront(userId: string) {
  const [sf] = await db
    .select()
    .from(storefronts)
    .where(eq(storefronts.userId, userId))
    .limit(1);
  return sf ?? null;
}

// ── Tier management ───────────────────────────────────────────────────────────

const createTierSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().min(100).max(100_000_00),
  currency: z.string().length(3).default("usd"),
  interval: z.enum(["month", "year"]),
  benefits: z
    .array(z.string().max(300))
    .max(20)
    .optional()
    .default([]),
  maxSubscribers: z.number().int().min(1).optional(),
  sortOrder: z.number().int().default(0),
});

const updateTierSchema = createTierSchema.partial();

/**
 * GET /api/fan-memberships/tiers
 * List all membership tiers for the authenticated artist.
 */
router.get("/tiers", async (req, res) => {
  try {
    const userId = req.user!.id;
    const sf = await getArtistStorefront(userId);
    if (!sf) return res.json([]);

    const tiers = await db
      .select()
      .from(membershipTiers)
      .where(eq(membershipTiers.storefrontId, sf.id))
      .orderBy(membershipTiers.sortOrder);

    res.json(tiers);
  } catch (err) {
    logger.warn({ err }, "[FanMemberships] GET /tiers failed");
    res.status(500).json({ error: "Failed to fetch tiers" });
  }
});

/**
 * POST /api/fan-memberships/tiers
 * Create a new fan club tier.
 */
router.post("/tiers", async (req, res) => {
  try {
    const userId = req.user!.id;
    const sf = await getArtistStorefront(userId);
    if (!sf) {
      return res.status(400).json({
        error: "Create a storefront before adding fan club tiers",
      });
    }

    const body = createTierSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: body.error.format() });
    }

    const [tier] = await db
      .insert(membershipTiers)
      .values({
        storefrontId: sf.id,
        name: body.data.name,
        description: body.data.description,
        priceCents: body.data.priceCents,
        currency: body.data.currency,
        interval: body.data.interval,
        benefits: body.data.benefits,
        maxSubscribers: body.data.maxSubscribers ?? null,
        sortOrder: body.data.sortOrder,
        isActive: true,
      })
      .returning();

    logger.info(
      { tierId: tier.id, userId, storefrontId: sf.id },
      "[FanMemberships] tier created",
    );
    res.status(201).json(tier);
  } catch (err) {
    logger.warn({ err }, "[FanMemberships] POST /tiers failed");
    res.status(500).json({ error: "Failed to create tier" });
  }
});

/**
 * PUT /api/fan-memberships/tiers/:tierId
 * Update an existing tier (artist must own it via storefront).
 */
router.put("/tiers/:tierId", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { tierId } = req.params;
    const sf = await getArtistStorefront(userId);
    if (!sf) return res.status(403).json({ error: "Unauthorized" });

    const [existing] = await db
      .select()
      .from(membershipTiers)
      .where(
        and(
          eq(membershipTiers.id, tierId),
          eq(membershipTiers.storefrontId, sf.id),
        ),
      )
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Tier not found" });

    const body = updateTierSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: body.error.format() });
    }

    const [updated] = await db
      .update(membershipTiers)
      .set({
        ...(body.data.name && { name: body.data.name }),
        ...(body.data.description !== undefined && {
          description: body.data.description,
        }),
        ...(body.data.priceCents !== undefined && {
          priceCents: body.data.priceCents,
        }),
        ...(body.data.interval && { interval: body.data.interval }),
        ...(body.data.benefits !== undefined && {
          benefits: body.data.benefits,
        }),
        ...(body.data.maxSubscribers !== undefined && {
          maxSubscribers: body.data.maxSubscribers,
        }),
        ...(body.data.sortOrder !== undefined && {
          sortOrder: body.data.sortOrder,
        }),
      })
      .where(eq(membershipTiers.id, tierId))
      .returning();

    res.json(updated);
  } catch (err) {
    logger.warn({ err }, "[FanMemberships] PUT /tiers/:tierId failed");
    res.status(500).json({ error: "Failed to update tier" });
  }
});

/**
 * DELETE /api/fan-memberships/tiers/:tierId
 * Deactivate a tier (soft-delete — preserves existing subscribers).
 */
router.delete("/tiers/:tierId", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { tierId } = req.params;
    const sf = await getArtistStorefront(userId);
    if (!sf) return res.status(403).json({ error: "Unauthorized" });

    const [existing] = await db
      .select()
      .from(membershipTiers)
      .where(
        and(
          eq(membershipTiers.id, tierId),
          eq(membershipTiers.storefrontId, sf.id),
        ),
      )
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Tier not found" });

    await db
      .update(membershipTiers)
      .set({ isActive: false })
      .where(eq(membershipTiers.id, tierId));

    res.json({ ok: true });
  } catch (err) {
    logger.warn({ err }, "[FanMemberships] DELETE /tiers/:tierId failed");
    res.status(500).json({ error: "Failed to deactivate tier" });
  }
});

// ── Members / subscribers ─────────────────────────────────────────────────────

/**
 * GET /api/fan-memberships/members
 * List active subscribers across all tiers for this artist.
 * Supports ?tierId= filter and pagination.
 */
router.get("/members", async (req, res) => {
  try {
    const userId = req.user!.id;
    const sf = await getArtistStorefront(userId);
    if (!sf) return res.json({ members: [], total: 0 });

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10));
    const offset = (page - 1) * limit;
    const tierId = req.query.tierId as string | undefined;

    // Build a tier-id set for this storefront
    const allTiers = await db
      .select({ id: membershipTiers.id, name: membershipTiers.name, priceCents: membershipTiers.priceCents })
      .from(membershipTiers)
      .where(eq(membershipTiers.storefrontId, sf.id));

    const tierIds = allTiers.map((t) => t.id);
    const tierMap = Object.fromEntries(allTiers.map((t) => [t.id, t]));

    if (tierIds.length === 0) return res.json({ members: [], total: 0 });

    const filterTierId = tierId && tierIds.includes(tierId) ? tierId : undefined;

    const conditions = [
      eq(customerMemberships.storefrontId, sf.id),
      eq(customerMemberships.status, "active"),
    ];
    if (filterTierId) {
      conditions.push(eq(customerMemberships.tierId, filterTierId));
    }

    const [{ total }] = await db
      .select({ total: count() })
      .from(customerMemberships)
      .where(and(...conditions));

    const members = await db
      .select()
      .from(customerMemberships)
      .where(and(...conditions))
      .orderBy(desc(customerMemberships.startDate))
      .limit(limit)
      .offset(offset);

    res.json({
      members: members.map((m) => ({
        ...m,
        tierName: tierMap[m.tierId]?.name ?? "Unknown",
        tierPriceCents: tierMap[m.tierId]?.priceCents ?? 0,
      })),
      total: Number(total),
      page,
      limit,
    });
  } catch (err) {
    logger.warn({ err }, "[FanMemberships] GET /members failed");
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

// ── MRR summary ───────────────────────────────────────────────────────────────

/**
 * GET /api/fan-memberships/revenue
 * Monthly Recurring Revenue summary across all tiers.
 */
router.get("/revenue", async (req, res) => {
  try {
    const userId = req.user!.id;
    const sf = await getArtistStorefront(userId);
    if (!sf) return res.json({ mrrCents: 0, arrCents: 0, activeMembers: 0, byTier: [] });

    const tiers = await db
      .select()
      .from(membershipTiers)
      .where(eq(membershipTiers.storefrontId, sf.id));

    const tierIds = tiers.map((t) => t.id);
    if (tierIds.length === 0) {
      return res.json({ mrrCents: 0, arrCents: 0, activeMembers: 0, byTier: [] });
    }

    const activeMemberships = await db
      .select({
        tierId: customerMemberships.tierId,
        memberCount: count(),
      })
      .from(customerMemberships)
      .where(
        and(
          eq(customerMemberships.storefrontId, sf.id),
          eq(customerMemberships.status, "active"),
        ),
      )
      .groupBy(customerMemberships.tierId);

    const byTier = tiers.map((tier) => {
      const row = activeMemberships.find((a) => a.tierId === tier.id);
      const members = Number(row?.memberCount ?? 0);
      const mrrCents =
        tier.interval === "year"
          ? Math.round((tier.priceCents * members) / 12)
          : tier.priceCents * members;
      return {
        tierId: tier.id,
        tierName: tier.name,
        interval: tier.interval,
        priceCents: tier.priceCents,
        members,
        mrrCents,
      };
    });

    const mrrCents = byTier.reduce((s, t) => s + t.mrrCents, 0);

    res.json({
      mrrCents,
      arrCents: mrrCents * 12,
      activeMembers: byTier.reduce((s, t) => s + t.members, 0),
      byTier,
    });
  } catch (err) {
    logger.warn({ err }, "[FanMemberships] GET /revenue failed");
    res.status(500).json({ error: "Failed to fetch revenue" });
  }
});

// ── Loyalty wallet ────────────────────────────────────────────────────────────

/**
 * GET /api/fan-memberships/wallet-config
 * Fetch the artist's loyalty programme configuration.
 */
router.get("/wallet-config", async (req, res) => {
  try {
    const userId = req.user!.id;
    const [config] = await db
      .select()
      .from(fanLoyaltyConfigs)
      .where(eq(fanLoyaltyConfigs.artistId, userId))
      .limit(1);

    res.json(
      config ?? {
        artistId: userId,
        creditsPerDollar: 10,
        creditsPerShare: 5,
        creditsPerComment: 2,
        creditsPerRedemptionDollar: 100,
        maxRedemptionPct: 50,
        enabled: false,
      },
    );
  } catch (err) {
    logger.warn({ err }, "[FanMemberships] GET /wallet-config failed");
    res.status(500).json({ error: "Failed to fetch wallet config" });
  }
});

const loyaltyConfigSchema = z.object({
  creditsPerDollar: z.number().int().min(1).max(1000),
  creditsPerShare: z.number().int().min(0).max(500),
  creditsPerComment: z.number().int().min(0).max(100),
  creditsPerRedemptionDollar: z.number().int().min(1).max(10000),
  maxRedemptionPct: z.number().int().min(0).max(100),
  enabled: z.boolean(),
});

/**
 * PUT /api/fan-memberships/wallet-config
 * Create or update loyalty programme configuration.
 */
router.put("/wallet-config", async (req, res) => {
  try {
    const userId = req.user!.id;
    const body = loyaltyConfigSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: body.error.format() });
    }

    await db
      .insert(fanLoyaltyConfigs)
      .values({ artistId: userId, ...body.data })
      .onConflictDoUpdate({
        target: fanLoyaltyConfigs.artistId,
        set: { ...body.data, updatedAt: new Date() },
      });

    res.json({ ok: true });
  } catch (err) {
    logger.warn({ err }, "[FanMemberships] PUT /wallet-config failed");
    res.status(500).json({ error: "Failed to update wallet config" });
  }
});

/**
 * GET /api/fan-memberships/wallet-leaderboard
 * Top fans by lifetime credit earnings for the authenticated artist.
 */
router.get("/wallet-leaderboard", async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(50, parseInt(String(req.query.limit ?? "20"), 10));

    const leaders = await db
      .select({
        fanId: fanWallets.fanId,
        balanceCredits: fanWallets.balanceCredits,
        lifetimeEarned: fanWallets.lifetimeEarned,
        lifetimeRedeemed: fanWallets.lifetimeRedeemed,
      })
      .from(fanWallets)
      .where(eq(fanWallets.artistId, userId))
      .orderBy(desc(fanWallets.lifetimeEarned))
      .limit(limit);

    res.json(leaders);
  } catch (err) {
    logger.warn({ err }, "[FanMemberships] GET /wallet-leaderboard failed");
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
