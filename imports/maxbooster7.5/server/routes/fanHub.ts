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
import { requestFanConsent, confirmFanConsent, unsubscribeFan, enqueueFanDelivery,
  processFanDelivery, getFanDelivery } from "../services/fanDeliveryService";

const router = Router();

// Public capability links: GET is safe for email scanners; POST changes consent.
for (const action of ["consent", "unsubscribe"] as const) {
  router.get(`/${action}/:token`, (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.sendStatus(400);
    const csrf = String((req as any).csrfToken ?? req.cookies?.["csrf-token"] ?? "");
    if (!/^[a-zA-Z0-9_-]+$/.test(csrf)) return res.status(503).send("Security token unavailable. Refresh this page.");
    res.set("Referrer-Policy", "no-referrer").set("Cache-Control", "no-store")
      .type("html").send(`<form method="post"><input type="hidden" name="_csrf" value="${csrf}"><p>${action === "consent" ? "Confirm artist email subscription" : "Unsubscribe from artist emails"}</p><button type="submit">Confirm</button></form>`);
  });
  router.post(`/${action}/:token`, async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.sendStatus(400);
    try {
      const changed = action === "consent" ? await confirmFanConsent(req.params.token) : await unsubscribeFan(req.params.token);
      return res.status(changed ? 200 : 410).send(changed ? "Preference saved." : "This link is invalid or expired.");
    } catch (error) {
      logger.warn({ err: error }, "Fan preference update failed");
      return res.status(503).send("Unable to save preference. Please retry.");
    }
  });
}
router.use(requireAuth, requirePremium);

router.post("/subscribers/:id/consent-request", async (req, res) => {
  try { res.json(await requestFanConsent(req.user!.id, req.params.id)); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); }
});
router.get("/deliveries/:id", async (req, res) => {
  try { res.json(await getFanDelivery(req.params.id, req.user!.id)); }
  catch { res.status(503).json({ error: "Could not load recipient outcomes" }); }
});
router.post("/deliveries/:id/resume", async (req, res) => {
  try { res.json(await processFanDelivery(req.params.id, req.user!.id)); }
  catch { res.status(503).json({ error: "Could not resume pending recipients" }); }
});
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
  commandKey: z.string().regex(/^[a-zA-Z0-9_-]{16,100}$/),
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
          ? Number(stats?.totalSpent || 0) / (totalFans || 1)
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

    const key = parsed.data.commandKey;
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))
      return res.status(400).json({ error: "A stable Idempotency-Key is required" });
    const id = await enqueueFanDelivery(userId, `broadcast:${key}`, subject, body);
    return res.json(await processFanDelivery(id, userId));
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

    const commandsResult = await db.execute(sql`SELECT id, subject, body, created_at AS "sentAt"
      FROM growth_fan_commands WHERE artist_id=${req.user!.id}
      ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`);
    const commands = commandsResult.rows ?? commandsResult;
    const current = await Promise.all(commands.map(async command => ({
      ...command, ...await getFanDelivery(command.id, req.user!.id),
      recipientCount: null, openCount: null, provenance: "recipient-ledger",
    })));
    return res.json([...current, ...messages.map(message => ({ ...message, provenance: "historical-unverified" }))]);
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
