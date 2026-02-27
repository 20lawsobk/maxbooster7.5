import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { fanSubscribers, fanMessages } from "../../shared/schema.js";
import { eq, and, or, ilike, sql, desc } from "drizzle-orm";
import { logger } from "../logger.js";

const router = Router();

// Middleware to ensure authentication
const requireAuth = (req: Request, res: Response, next: Function) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
};

router.use(requireAuth);

// GET /api/fan-hub/subscribers - list all fans with pagination/search
router.get("/subscribers", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string) || "";
    const offset = (page - 1) * limit;

    const query = db.select().from(fanSubscribers)
      .where(
        and(
          eq(fanSubscribers.userId, userId),
          search ? or(
            ilike(fanSubscribers.email, `%${search}%`),
            ilike(fanSubscribers.name, `%${search}%`)
          ) : undefined
        )
      )
      .limit(limit)
      .offset(offset)
      .orderBy(desc(fanSubscribers.joinedAt));

    const subscribers = await query;
    
    // Get total count for pagination
    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(fanSubscribers)
      .where(
        and(
          eq(fanSubscribers.userId, userId),
          search ? or(
            ilike(fanSubscribers.email, `%${search}%`),
            ilike(fanSubscribers.name, `%${search}%`)
          ) : undefined
        )
      );

    return res.json({
      subscribers,
      pagination: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit)
      }
    });
  } catch (error) {
    logger.error("Error fetching fan subscribers:", error);
    return res.status(500).json({ message: "Failed to fetch fan subscribers" });
  }
});

// POST /api/fan-hub/subscribers - add fan manually
router.post("/subscribers", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { email, name, phone, source, tags, notes, isVip } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const [subscriber] = await db.insert(fanSubscribers).values({
      userId,
      email,
      name,
      phone,
      source: source || "manual",
      tags: tags || [],
      notes,
      isVip: !!isVip,
    }).returning();

    return res.status(201).json(subscriber);
  } catch (error) {
    logger.error("Error creating fan subscriber:", error);
    return res.status(500).json({ message: "Failed to create fan subscriber" });
  }
});

// PUT /api/fan-hub/subscribers/:id - update fan details
router.put("/subscribers/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;
    const updateData = req.body;

    const [updated] = await db.update(fanSubscribers)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(fanSubscribers.id, id), eq(fanSubscribers.userId, userId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Subscriber not found" });
    }

    return res.json(updated);
  } catch (error) {
    logger.error("Error updating fan subscriber:", error);
    return res.status(500).json({ message: "Failed to update fan subscriber" });
  }
});

// DELETE /api/fan-hub/subscribers/:id - remove fan
router.delete("/subscribers/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    const [deleted] = await db.delete(fanSubscribers)
      .where(and(eq(fanSubscribers.id, id), eq(fanSubscribers.userId, userId)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ message: "Subscriber not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting fan subscriber:", error);
    return res.status(500).json({ message: "Failed to delete fan subscriber" });
  }
});

// POST /api/fan-hub/subscribers/import - CSV import
router.post("/subscribers/import", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { subscribers: importData } = req.body; // Expecting array of subscriber objects

    if (!Array.isArray(importData)) {
      return res.status(400).json({ message: "Invalid import data" });
    }

    const values = importData.map(s => ({
      userId,
      email: s.email,
      name: s.name,
      phone: s.phone,
      source: s.source || "import",
      tags: s.tags || [],
      isVip: !!s.isVip,
      notes: s.notes
    }));

    // Simple implementation: insert all (Drizzle might have limits on batch size depending on DB)
    const imported = await db.insert(fanSubscribers).values(values).returning();

    return res.json({ count: imported.length });
  } catch (error) {
    logger.error("Error importing fan subscribers:", error);
    return res.status(500).json({ message: "Failed to import fan subscribers" });
  }
});

// GET /api/fan-hub/stats - total fans, growth rate, avg spend, vip count
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const [stats] = await db.select({
      totalFans: sql<number>`count(*)`,
      vipCount: sql<number>`count(*) filter (where ${fanSubscribers.isVip} = true)`,
      totalSpent: sql<number>`sum(${fanSubscribers.totalSpent})`,
    })
    .from(fanSubscribers)
    .where(eq(fanSubscribers.userId, userId));

    // Mocking growth rate and email open rate for now as we don't have historical data or real email integration yet
    return res.json({
      totalFans: Number(stats.totalFans || 0),
      vipCount: Number(stats.vipCount || 0),
      totalSpent: Number(stats.totalSpent || 0),
      avgSpend: Number(stats.totalFans) > 0 ? Number(stats.totalSpent || 0) / Number(stats.totalFans) : 0,
      growthRate: 15.5, // Mock percentage
      emailOpenRate: 24.8 // Mock percentage
    });
  } catch (error) {
    logger.error("Error fetching fan hub stats:", error);
    return res.status(500).json({ message: "Failed to fetch stats" });
  }
});

// POST /api/fan-hub/message - send bulk message to fans
router.post("/message", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { subject, body, segmentFilter } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ message: "Subject and body are required" });
    }

    // In a real app, we'd trigger SendGrid here. For now, we record the message.
    const subscribers = await db.select().from(fanSubscribers).where(eq(fanSubscribers.userId, userId));
    const recipientCount = subscribers.length;

    const [message] = await db.insert(fanMessages).values({
      userId,
      subject,
      body,
      recipientCount,
      sentAt: new Date(),
      segmentFilter: segmentFilter || "all"
    }).returning();

    return res.json(message);
  } catch (error) {
    logger.error("Error sending bulk message:", error);
    return res.status(500).json({ message: "Failed to send message" });
  }
});

// GET /api/fan-hub/messages - list sent messages
router.get("/messages", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const messages = await db.select()
      .from(fanMessages)
      .where(eq(fanMessages.userId, userId))
      .orderBy(desc(fanMessages.sentAt));

    return res.json(messages);
  } catch (error) {
    logger.error("Error fetching fan messages:", error);
    return res.status(500).json({ message: "Failed to fetch messages" });
  }
});

// PUT /api/fan-hub/subscribers/:id/tag - add/remove tags
router.put("/subscribers/:id/tag", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;
    const { tags } = req.body; // Expecting complete tags array

    if (!Array.isArray(tags)) {
      return res.status(400).json({ message: "Tags must be an array" });
    }

    const [updated] = await db.update(fanSubscribers)
      .set({ tags, updatedAt: new Date() })
      .where(and(eq(fanSubscribers.id, id), eq(fanSubscribers.userId, userId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Subscriber not found" });
    }

    return res.json(updated);
  } catch (error) {
    logger.error("Error updating tags:", error);
    return res.status(500).json({ message: "Failed to update tags" });
  }
});

export default router;
