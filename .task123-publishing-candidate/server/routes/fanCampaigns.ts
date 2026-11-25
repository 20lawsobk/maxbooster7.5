// @ts-nocheck
import { Router } from "express";
import { db } from "../db";
import {
  fanCampaigns,
  insertFanCampaignSchema,
  fanSubscribers,
} from "@shared/schema";
import { and, eq, desc, count, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { z } from "zod";
import { queryCache, createCacheKey } from "../lib/queryCache.js";
import { parsePaginationParams } from "../middleware/pagination.js";
import { requireUUIDParam } from "../middleware/requestValidation.js";
import { enqueueFanDelivery, processFanDelivery } from "../services/fanDeliveryService";

const router = Router();
const CACHE_TTL = 60;

export function resolveFanCampaignDeliveryState(delivery: Record<string, unknown>) {
  const accepted = Number(delivery.acceptedCount || 0);
  const delivered = Number(delivery.deliveredCount || 0);
  const pending = Number(delivery.pendingCount || 0);
  const unknown = Number(delivery.unknownCount || 0);
  const suppressed = Number(delivery.suppressedCount || 0);
  const bounced = Number(delivery.bouncedCount || 0);
  const complained = Number(delivery.complainedCount || 0);

  if (unknown > 0) {
    return {
      status: "needs_reconciliation",
      recipientCount: accepted + delivered + pending + unknown + suppressed + bounced + complained,
      sentAt: null,
    };
  }
  if (pending > 0) {
    return {
      status: "sending",
      recipientCount: accepted + delivered + pending + suppressed + bounced + complained,
      sentAt: null,
    };
  }
  const recipientCount = accepted + delivered + suppressed + bounced + complained;
  const hadProviderAcceptance = accepted + delivered + bounced + complained > 0;
  return {
    status: hadProviderAcceptance ? "sent" : "failed",
    recipientCount,
    sentAt: hadProviderAcceptance ? new Date() : null,
  };
}

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(100_000).optional(),
  campaignType: z
    .enum(["newsletter", "announcement", "promotion", "event"])
    .optional(),
  status: z.enum(["draft", "cancelled"]).optional(),
  segmentFilter: z.record(z.string(), z.unknown()).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const campaigns = await db
      .select()
      .from(fanCampaigns)
      .where(eq(fanCampaigns.userId, req.user!.id))
      .orderBy(desc(fanCampaigns.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(campaigns);
  } catch (error) {
    logger.warn({ err: error }, "[FanCampaigns] Failed to list campaigns:");
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

router.get("/stats", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cacheKey = createCacheKey("stats:fanCampaigns", userId);

    const stats = await queryCache?.getOrCompute(
      cacheKey,
      async () => {
        const [campaignTotals] = await db
          .select({
            totalCampaigns: count(),
            sent: sql<number>`count(*) filter (where status = 'sent')`,
            totalRecipients: sql<number>`coalesce(sum(recipient_count), 0)`,
            totalOpens: sql<number>`coalesce(sum(open_count), 0)`,
          })
          .from(fanCampaigns)
          .where(eq(fanCampaigns.userId, userId));

        const [subscriberCount] = await db
          .select({ total: count() })
          .from(fanSubscribers)
          .where(eq(fanSubscribers.userId, userId))
          .limit(1);

        const totalCampaigns = Number(campaignTotals?.totalCampaigns);
        const sentCount = Number(campaignTotals?.sent);
        const totalRecipients = Number(campaignTotals?.totalRecipients);
        const totalOpens = Number(campaignTotals?.totalOpens);
        const totalSubscribers = Number(subscriberCount?.total);
        const avgOpenRate =
          totalRecipients > 0
            ? Math.round((totalOpens / (totalRecipients || 1)) * 100)
            : 0;

        return {
          totalCampaigns,
          sent: sentCount,
          totalSubscribers,
          avgOpenRate,
        };
      },
      CACHE_TTL,
    );

    res.json(stats);
  } catch (error) {
    logger.warn({ err: error }, "[FanCampaigns] Failed to fetch stats:");
    res.status(500).json({ error: "Failed to fetch campaign stats" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const data = insertFanCampaignSchema?.parse({
      ...req.body,
      userId: req.user!.id,
      status: "draft",
      recipientCount: 0,
      openCount: 0,
      sentAt: null,
    });
    const [campaign] = await db.insert(fanCampaigns).values(data).returning();
    await queryCache?.invalidate(
      createCacheKey("stats:fanCampaigns", req.user!.id),
    );
    res.status(201).json(campaign);
  } catch (error: unknown) {
    logger.warn({ err: error }, "[FanCampaigns] Failed to create campaign:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as unknown as Record<string, unknown>).flatten(),
        });
    }
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.get("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(fanCampaigns)
      .where(
        and(
          eq(fanCampaigns.id, (req.params.id as string)),
          eq(fanCampaigns.userId, req.user!.id),
        ),
      )
      .limit(1);
    if (!item) return res.status(404).json({ error: "Campaign not found" });
    res.json(item);
  } catch (error) {
    logger.warn({ err: error }, "[FanCampaigns] Failed to fetch campaign:");
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

router.put("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;

    const existing = await db
      .select()
      .from(fanCampaigns)
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)))
      .limit(1);

    if (existing?.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (existing[0].status === "sent") {
      return res.status(400).json({ error: "Cannot modify a sent campaign" });
    }
    const commands = await db.execute(sql`SELECT id FROM growth_fan_commands
      WHERE artist_id=${userId} AND command_key=${`campaign:${id}`}`);
    if ((commands.rows ?? commands).length)
      return res.status(409).json({ error: "A queued campaign snapshot is immutable; create a new draft" });

    const parsed = updateCampaignSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const [campaign] = await db
      .update(fanCampaigns)
      .set({ ...parsed?.data, updatedAt: new Date() })
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)))
      .returning();

    await queryCache?.invalidate(createCacheKey("stats:fanCampaigns", userId));
    res.json(campaign);
  } catch (error) {
    logger.warn({ err: error }, "[FanCampaigns] Failed to update campaign:");
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.post("/:id/send", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;

    const existing = await db
      .select()
      .from(fanCampaigns)
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)))
      .limit(1);

    if (existing?.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (existing[0].status === "sent") {
      return res.status(400).json({ error: "Campaign already sent" });
    }
    if (existing[0].status === "cancelled")
      return res.status(409).json({ error: "Cancelled campaigns cannot be sent" });

    const segment = existing[0].segmentFilter;
    if (segment && Object.keys(segment).length)
      return res.status(400).json({ error: "Only the all-consented audience is supported" });
    const commandId = await enqueueFanDelivery(userId, `campaign:${id}`, existing[0].subject, existing[0].body);
    await db
      .update(fanCampaigns)
      .set({ status: "sending", sentAt: null, updatedAt: new Date() })
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)));
    let delivery;
    try {
      delivery = await processFanDelivery(commandId, userId);
    } catch (deliveryError) {
      logger.warn(
        { err: deliveryError, campaignId: id, commandId },
        "[FanCampaigns] Delivery requires reconciliation:",
      );
      await db
        .update(fanCampaigns)
        .set({ status: "needs_reconciliation", updatedAt: new Date() })
        .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)));
      await queryCache?.invalidate(createCacheKey("stats:fanCampaigns", userId));
      return res.status(202).json({
        success: false,
        status: "needs_reconciliation",
        commandId,
        error:
          "Delivery state is uncertain. Do not create a duplicate campaign; reconcile the delivery ledger before retrying.",
      });
    }
    const state = resolveFanCampaignDeliveryState(delivery);
    await db
      .update(fanCampaigns)
      .set({
        status: state.status,
        recipientCount: state.recipientCount,
        sentAt: state.sentAt || existing[0].sentAt,
        updatedAt: new Date(),
      })
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)));
    await queryCache?.invalidate(createCacheKey("stats:fanCampaigns", userId));
    res.status(state.status === "sent" || state.status === "failed" ? 200 : 202).json({
      success: state.status === "sent",
      status: state.status,
      ...delivery,
      recipientCount: state.recipientCount,
    });
  } catch (error) {
    logger.warn({ err: error }, "[FanCampaigns] Failed to send campaign:");
    res.status(500).json({ error: "Failed to send campaign" });
  }
});

router.delete("/:id", requireAuth, requireUUIDParam("id"), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;

    const existing = await db
      .select()
      .from(fanCampaigns)
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)))
      .limit(1);

    if (existing?.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const commands = await db.execute(sql`SELECT id FROM growth_fan_commands
      WHERE artist_id=${userId} AND command_key=${`campaign:${id}`}`);
    if ((commands.rows ?? commands).length)
      return res.status(409).json({ error: "Campaign has an immutable delivery ledger and cannot be deleted" });
    await db
      .delete(fanCampaigns)
      .where(and(eq(fanCampaigns.id, id), eq(fanCampaigns.userId, userId)));

    await queryCache?.invalidate(createCacheKey("stats:fanCampaigns", userId));
    res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, "[FanCampaigns] Failed to delete campaign:");
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

export default router;
