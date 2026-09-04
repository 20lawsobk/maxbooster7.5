// @ts-nocheck
import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { fanSubscribers, fanMessages, users } from "../../shared/schema.js";
import { eq, and, or, ilike, gte, sql, desc } from "drizzle-orm";
import { logger } from "../logger.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePremium } from "../middleware/requirePremium.js";
import { z } from "zod";
import { emailService } from "../services/emailService.js";

const router = Router();

router.use(requireAuth, requirePremium);

const createSubscriberSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  source: z.string().max(100).optional().default("manual"),
  tags: z.array(z.string().max(100)).optional().default([]),
  notes: z.string().max(5000).optional(),
  isVip: z.boolean().optional().default(false),
});

const updateSubscriberSchema = z.object({
  email: z.string().email().max(320).optional(),
  name: z.string().max(200).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  source: z.string().max(100).optional(),
  tags: z.array(z.string().max(100)).optional(),
  notes: z.string().max(5000).optional().nullable(),
  isVip: z.boolean().optional(),
});

const sendMessageSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(100_000),
  // Segmented delivery is not implemented; accepting a segment here would
  // misleadingly record it while still delivering to every subscriber.
  segmentFilter: z.literal("all").optional().default("all"),
});

const importSubscriberSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  source: z.string().max(100).optional(),
  tags: z.array(z.string().max(100)).optional(),
  isVip: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});
const subscriberIdSchema = z.string().uuid();

router.get("/subscribers", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const search = (req.query.search as string)?.slice(0, 200) || "";
    const offset = (page - 1) * limit;

    const searchCondition = search
      ? or(
          ilike(fanSubscribers.email, `%${search}%`),
          ilike(fanSubscribers.name, `%${search}%`),
        )
      : undefined;

    const subscribers = await db
      .select()
      .from(fanSubscribers)
      .where(and(eq(fanSubscribers.userId, userId), searchCondition))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(fanSubscribers.joinedAt));

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(fanSubscribers)
      .where(and(eq(fanSubscribers.userId, userId), searchCondition));

    return res.json({
      subscribers,
      pagination: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit),
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching fan subscribers:");
    return res.status(500).json({ error: "Failed to fetch fan subscribers" });
  }
});

router.post("/subscribers", async (req: Request, res: Response) => {
  try {
    const parsed = createSubscriberSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const [subscriber] = await db
      .insert(fanSubscribers)
      .values({
        userId: req.user!.id,
        ...parsed?.data,
      })
      .returning();

    return res.status(201).json(subscriber);
  } catch (error) {
    logger.warn({ err: error }, "Error creating fan subscriber:");
    return res.status(500).json({ error: "Failed to create fan subscriber" });
  }
});

router.put("/subscribers/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;
    const parsedId = subscriberIdSchema.safeParse(id);
    if (!parsedId.success) {
      return res.status(400).json({ error: "Invalid subscriber ID" });
    }

    const parsed = updateSubscriberSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const [updated] = await db
      .update(fanSubscribers)
      .set({ ...parsed?.data })
      .where(
        and(
          eq(fanSubscribers.id, parsedId.data),
          eq(fanSubscribers.userId, userId),
        ),
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Subscriber not found" });
    }

    return res.json(updated);
  } catch (error) {
    logger.warn({ err: error }, "Error updating fan subscriber:");
    return res.status(500).json({ error: "Failed to update fan subscriber" });
  }
});

router.delete("/subscribers/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;
    const parsedId = subscriberIdSchema.safeParse(id);
    if (!parsedId.success) {
      return res.status(400).json({ error: "Invalid subscriber ID" });
    }

    const [deleted] = await db
      .delete(fanSubscribers)
      .where(
        and(
          eq(fanSubscribers.id, parsedId.data),
          eq(fanSubscribers.userId, userId),
        ),
      )
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Subscriber not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, "Error deleting fan subscriber:");
    return res.status(500).json({ error: "Failed to delete fan subscriber" });
  }
});

router.post("/subscribers/import", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { subscribers: importData } = req.body;

    if (!Array.isArray(importData)) {
      return res
        .status(400)
        .json({ error: "Invalid import data: must be an array" });
    }
    if (importData.length === 0) {
      return res.status(400).json({
        error: "Import data must contain at least one subscriber",
      });
    }

    if (importData?.length > 1000) {
      return res
        .status(400)
        .json({ error: "Import limit is 1000 subscribers per request" });
    }

    const parsed = z.array(importSubscriberSchema).safeParse(importData);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const values = parsed?.data.map((s) => ({
      userId,
      email: s.email,
      name: s.name,
      phone: s.phone,
      source: s.source || "import",
      tags: s.tags || [],
      isVip: !!s?.isVip,
      notes: s.notes,
    }));

    const imported = await db.insert(fanSubscribers).values(values).returning();
    return res.json({ count: imported.length });
  } catch (error) {
    logger.warn({ err: error }, "Error importing fan subscribers:");
    return res.status(500).json({ error: "Failed to import fan subscribers" });
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [[stats], [recentStats], [messageStats]] = await Promise.all([
      db
        .select({
          totalFans: sql<number>`count(*)`,
          vipCount: sql<number>`count(*) filter (where ${fanSubscribers.isVip} = true)`,
          totalSpent: sql<number>`sum(${fanSubscribers.totalSpent})`,
        })
        .from(fanSubscribers)
        .where(eq(fanSubscribers.userId, userId)),
      db
        .select({ totalFans: sql<number>`count(*)` })
        .from(fanSubscribers)
        .where(
          and(
            eq(fanSubscribers.userId, userId),
            gte(fanSubscribers.joinedAt, thirtyDaysAgo),
          ),
        ),
      db
        .select({
          recipients: sql<number>`coalesce(sum(${fanMessages.recipientCount}), 0)`,
          opens: sql<number>`coalesce(sum(${fanMessages.openCount}), 0)`,
        })
        .from(fanMessages)
        .where(eq(fanMessages.userId, userId)),
    ]);
    const totalFans = Number(stats?.totalFans || 0);
    const newFansLast30Days = Number(recentStats?.totalFans || 0);
    const recipients = Number(messageStats?.recipients || 0);
    const opens = Number(messageStats?.opens || 0);

    return res.json({
      totalFans,
      vipCount: Number(stats?.vipCount || 0),
      totalSpent: Number(stats?.totalSpent || 0),
      avgSpend:
        totalFans > 0
          ? Number(stats?.totalSpent || 0) / totalFans
          : 0,
      newFansLast30Days,
      emailOpenRate:
        recipients > 0 ? Math.round((opens / recipients) * 1000) / 10 : 0,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching fan hub stats:");
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.post("/message", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const parsed = sendMessageSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const { subject, body, segmentFilter } = parsed?.data ?? {};

    // Get artist info for the from-name
    const [artist] = await db
      .select({ username: users.username, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId));
    const artistName = artist?.displayName || artist?.username || "Your Artist";

    // Get all subscribers to send to
    const subscribers = await db
      .select({
        id: fanSubscribers.id,
        email: fanSubscribers.email,
        name: fanSubscribers.name,
      })
      .from(fanSubscribers)
      .where(eq(fanSubscribers.userId, userId));

    if (subscribers.length === 0) {
      return res.status(400).json({
        error: "Add at least one fan before sending a broadcast",
      });
    }

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    const htmlBody = escapeHtml(body).replace(/\n/g, "<br>");
    const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#1a1a2e;color:#fff;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;color:#a78bfa">${escapeHtml(artistName)}</h2>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
            <p style="color:#374151;font-size:16px;line-height:1.6">${htmlBody}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
            <p style="color:#9ca3af;font-size:12px">You're receiving this because you subscribed to updates from ${escapeHtml(artistName)} via Max Booster.</p>
          </div>
        </div>
      `;

    const BATCH_SIZE = 50;
    let deliveredCount = 0;
    let failedCount = 0;
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (subscriber) => {
          try {
            return await emailService.send({
              to: subscriber.email,
              subject: `${artistName}: ${subject}`,
              html: emailHtml,
            });
          } catch (error) {
            logger.warn(
              { err: error, subscriberId: subscriber.id },
              "Fan broadcast email delivery failed",
            );
            return false;
          }
        }),
      );
      deliveredCount += results.filter(Boolean).length;
      failedCount += results.filter((result) => !result).length;
    }

    if (deliveredCount === 0) {
      return res.status(503).json({
        error: "No broadcast emails could be delivered. Please try again later.",
      });
    }

    const [message] = await db
      .insert(fanMessages)
      .values({
        userId,
        subject,
        body,
        recipientCount: deliveredCount,
        sentAt: new Date(),
        segmentFilter: segmentFilter || "all",
      })
      .returning();

    logger.info(
      {
        messageId: message.id,
        deliveredCount,
        failedCount,
        requestedRecipientCount: subscribers.length,
      },
      "Fan broadcast delivery completed",
    );

    return res.json({ ...message, recipientCount: deliveredCount, failedCount });
  } catch (error) {
    logger.warn({ err: error }, "Error sending bulk message:");
    return res.status(500).json({ error: "Failed to send message" });
  }
});

router.get("/messages", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = (page - 1) * limit;
    const messages = await db
      .select()
      .from(fanMessages)
      .where(eq(fanMessages.userId, req.user!.id))
      .orderBy(desc(fanMessages.sentAt))
      .limit(limit)
      .offset(offset);

    return res.json(messages);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching fan messages:");
    return res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.put("/subscribers/:id/tag", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;
    const parsedId = subscriberIdSchema.safeParse(id);
    if (!parsedId.success) {
      return res.status(400).json({ error: "Invalid subscriber ID" });
    }
    const parsed = z
      .object({ tags: z.array(z.string().max(100)).max(50) })
      .safeParse(req.body);

    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Tags must be an array of strings (max 50 tags)" });
    }

    const [updated] = await db
      .update(fanSubscribers)
      .set({ tags: parsed.data.tags })
      .where(
        and(
          eq(fanSubscribers.id, parsedId.data),
          eq(fanSubscribers.userId, userId),
        ),
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Subscriber not found" });
    }

    return res.json(updated);
  } catch (error) {
    logger.warn({ err: error }, "Error updating tags:");
    return res.status(500).json({ error: "Failed to update tags" });
  }
});

export default router;
