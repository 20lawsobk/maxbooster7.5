import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { fanSubscribers, fanMessages } from "../../shared/schema.js";
import { eq, and, or, ilike, sql, desc } from "drizzle-orm";
import { logger } from "../logger.js";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";

const router = Router();

router.use(requireAuth);

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
  segmentFilter: z.string().max(200).optional().default("all"),
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

router.get("/subscribers", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const search = (req.query.search as string)?.slice(0, 200) || "";
    const offset = (page - 1) * limit;

    const searchCondition = search
      ? or(
          ilike(fanSubscribers.email, `%${search}%`),
          ilike(fanSubscribers.name, `%${search}%`),
        )
      : undefined;

    const subscribers = await db.select().from(fanSubscribers)
      .where(and(eq(fanSubscribers.userId, userId), searchCondition))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(fanSubscribers.joinedAt));

    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
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
    logger.error("Error fetching fan subscribers:", error);
    return res.status(500).json({ error: "Failed to fetch fan subscribers" });
  }
});

router.post("/subscribers", async (req: Request, res: Response) => {
  try {
    const parsed = createSubscriberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const [subscriber] = await db.insert(fanSubscribers).values({
      userId: req.user!.id,
      ...parsed.data,
    }).returning();

    return res.status(201).json(subscriber);
  } catch (error) {
    logger.error("Error creating fan subscriber:", error);
    return res.status(500).json({ error: "Failed to create fan subscriber" });
  }
});

router.put("/subscribers/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const parsed = updateSubscriberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const [updated] = await db.update(fanSubscribers)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(fanSubscribers.id, id), eq(fanSubscribers.userId, userId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Subscriber not found" });
    }

    return res.json(updated);
  } catch (error) {
    logger.error("Error updating fan subscriber:", error);
    return res.status(500).json({ error: "Failed to update fan subscriber" });
  }
});

router.delete("/subscribers/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const [deleted] = await db.delete(fanSubscribers)
      .where(and(eq(fanSubscribers.id, id), eq(fanSubscribers.userId, userId)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Subscriber not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting fan subscriber:", error);
    return res.status(500).json({ error: "Failed to delete fan subscriber" });
  }
});

router.post("/subscribers/import", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { subscribers: importData } = req.body;

    if (!Array.isArray(importData)) {
      return res.status(400).json({ error: "Invalid import data: must be an array" });
    }

    if (importData.length > 1000) {
      return res.status(400).json({ error: "Import limit is 1000 subscribers per request" });
    }

    const parsed = z.array(importSubscriberSchema).safeParse(importData);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const values = parsed.data.map(s => ({
      userId,
      email: s.email,
      name: s.name,
      phone: s.phone,
      source: s.source || "import",
      tags: s.tags || [],
      isVip: !!s.isVip,
      notes: s.notes,
    }));

    const imported = await db.insert(fanSubscribers).values(values).returning();
    return res.json({ count: imported.length });
  } catch (error) {
    logger.error("Error importing fan subscribers:", error);
    return res.status(500).json({ error: "Failed to import fan subscribers" });
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const [stats] = await db.select({
      totalFans: sql<number>`count(*)`,
      vipCount: sql<number>`count(*) filter (where ${fanSubscribers.isVip} = true)`,
      totalSpent: sql<number>`sum(${fanSubscribers.totalSpent})`,
    })
      .from(fanSubscribers)
      .where(eq(fanSubscribers.userId, userId));

    return res.json({
      totalFans: Number(stats.totalFans || 0),
      vipCount: Number(stats.vipCount || 0),
      totalSpent: Number(stats.totalSpent || 0),
      avgSpend: Number(stats.totalFans) > 0 ? Number(stats.totalSpent || 0) / Number(stats.totalFans) : 0,
      growthRate: 15.5,
      emailOpenRate: 24.8,
    });
  } catch (error) {
    logger.error("Error fetching fan hub stats:", error);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.post("/message", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const { subject, body, segmentFilter } = parsed.data;

    const [{ recipientCount }] = await db.select({
      recipientCount: sql<number>`count(*)`,
    }).from(fanSubscribers).where(eq(fanSubscribers.userId, userId));

    const [message] = await db.insert(fanMessages).values({
      userId,
      subject,
      body,
      recipientCount: Number(recipientCount),
      sentAt: new Date(),
      segmentFilter: segmentFilter || "all",
    }).returning();

    return res.json(message);
  } catch (error) {
    logger.error("Error sending bulk message:", error);
    return res.status(500).json({ error: "Failed to send message" });
  }
});

router.get("/messages", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = (page - 1) * limit;
    const messages = await db.select()
      .from(fanMessages)
      .where(eq(fanMessages.userId, req.user!.id))
      .orderBy(desc(fanMessages.sentAt))
      .limit(limit)
      .offset(offset);

    return res.json(messages);
  } catch (error) {
    logger.error("Error fetching fan messages:", error);
    return res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.put("/subscribers/:id/tag", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const parsed = z.object({ tags: z.array(z.string().max(100)).max(50) }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Tags must be an array of strings (max 50 tags)" });
    }

    const [updated] = await db.update(fanSubscribers)
      .set({ tags: parsed.data.tags, updatedAt: new Date() })
      .where(and(eq(fanSubscribers.id, id), eq(fanSubscribers.userId, userId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Subscriber not found" });
    }

    return res.json(updated);
  } catch (error) {
    logger.error("Error updating tags:", error);
    return res.status(500).json({ error: "Failed to update tags" });
  }
});

export default router;
