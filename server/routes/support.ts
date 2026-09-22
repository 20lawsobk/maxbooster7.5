import { Router } from "express";
import { db } from "../db.js";
import { supportTickets } from "../../shared/schema.js";
import { eq, desc, like, or, sql, count, avg, and } from "drizzle-orm";
import { logger } from "../logger.js";
import { requireAdmin, requireAuth, require2FA } from "../middleware/auth.js";
import { notificationService } from "../services/notificationService.js";
import { supportTicketService } from "../services/supportTicketService.js";

const router = Router();

// Customer projection deliberately excludes staff tags, assignment and raw metadata.
router.get("/my/tickets/:ticketId", requireAuth, async (req, res) => {
  try {
    const { ticketId } = req.params;
    if (typeof ticketId !== "string" || !ticketId.trim()) {
      return res.status(400).json({ error: "A single nonempty ticket ID is required" });
    }
    const [ticket] = await db.select().from(supportTickets).where(and(
      eq(supportTickets.id, ticketId), eq(supportTickets.userId, req.user!.id),
    )).limit(1);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    const messages = await supportTicketService.getTicketMessages(ticket.id);
    return res.json({
      id: ticket.id, subject: ticket.subject, description: ticket.description,
      status: ticket.status, createdAt: ticket.createdAt,
      messages: messages.map(message => ({
        id: message.id, message: message.message, isStaffReply: message.isStaffReply, createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    logger.warn({ err: error }, "Customer ticket read failed");
    return res.status(500).json({ error: "Unable to load ticket" });
  }
});

router.post("/my/tickets/:ticketId/messages", requireAuth, async (req, res) => {
  try {
    const { ticketId } = req.params;
    if (typeof ticketId !== "string" || !ticketId.trim()) {
      return res.status(400).json({ error: "A single nonempty ticket ID is required" });
    }
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim() || message.length > 10000) {
      return res.status(400).json({ error: "Message must contain 1–10000 characters" });
    }
    const [ticket] = await db.select({ id: supportTickets.id, status: supportTickets.status })
      .from(supportTickets).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, req.user!.id))).limit(1);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (ticket.status === "closed") return res.status(409).json({ error: "This ticket is closed" });
    const saved = await supportTicketService.addMessage(ticket.id, req.user!.id, message.trim(), false);
    return res.status(201).json({ id: saved.id });
  } catch (error) {
    logger.warn({ err: error }, "Customer ticket reply failed");
    return res.status(500).json({ error: "Unable to send reply; reload the ticket before retrying" });
  }
});

// Get user's own tickets
router.get("/tickets", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(100);

    res.json({ tickets, total: tickets.length });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching user tickets:");
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// Get all tickets (admin only)
router.get("/tickets/all", requireAuth, requireAdmin, require2FA, async (req, res) => {
  try {
    const { status, priority, search } = req.query;

    let conditions = [];

    if (status && status !== "all") {
      conditions?.push(eq(supportTickets.status, status as string));
    }

    if (priority && priority !== "all") {
      conditions?.push(eq(supportTickets.priority, priority as string));
    }

    if (search) {
      conditions?.push(
        or(
          like(supportTickets.subject, `%${search}%`),
          like(supportTickets.description, `%${search}%`),
        ),
      );
    }

    const whereClause = conditions?.length > 0 ? and(...conditions) : undefined;

    const tickets = await db
      .select({
        id: supportTickets.id,
        userId: supportTickets.userId,
        subject: supportTickets.subject,
        description: supportTickets.description,
        status: supportTickets.status,
        priority: supportTickets.priority,
        category: supportTickets.category,
        assignedTo: supportTickets.assignedTo,
        responseTimeMinutes: supportTickets.responseTimeMinutes,
        satisfactionRating: supportTickets.satisfactionRating,
        metadata: supportTickets.metadata,
        resolvedAt: supportTickets.resolvedAt,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
      })
      .from(supportTickets)
      .where(whereClause)
      .orderBy(desc(supportTickets.createdAt));

    res.json(tickets);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching tickets:");
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

router.get("/stats", requireAuth, requireAdmin, require2FA, async (_req, res) => {
  try {
    const [ticketStatsResult, avgResponseResult, avgSatisfactionResult] =
      await Promise.all([
        db
          .select({
            status: supportTickets.status,
            priority: supportTickets.priority,
            count: count(),
          })
          .from(supportTickets)
          .groupBy(supportTickets.status, supportTickets.priority),
        db
          .select({
            avg: avg(supportTickets.responseTimeMinutes),
          })
          .from(supportTickets)
          .where(sql`${supportTickets.responseTimeMinutes} IS NOT NULL`),
        db
          .select({
            avg: avg(supportTickets.satisfactionRating),
          })
          .from(supportTickets)
          .where(sql`${supportTickets.satisfactionRating} IS NOT NULL`),
      ]);

    res.json({
      ticketStats: ticketStatsResult,
      avgResponseTimeMinutes: parseFloat(avgResponseResult[0]?.avg || "0"),
      avgSatisfaction: parseFloat(avgSatisfactionResult[0]?.avg || "0"),
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching ticket stats:");
    res.status(500).json({ error: "Failed to fetch ticket stats" });
  }
});

router.get("/tickets/:ticketId", requireAuth, requireAdmin, require2FA, async (req, res) => {
  try {
    const { ticketId } = req.params;
    if (typeof ticketId !== "string" || !ticketId.trim()) {
      return res.status(400).json({ error: "A single nonempty ticket ID is required" });
    }

    const ticket = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    if (!ticket?.length) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const [messages, tags] = await Promise.all([
      supportTicketService.getTicketMessages(ticketId),
      supportTicketService.getTicketTags(ticketId),
    ]);

    res.json({ ...ticket[0], messages, tags: tags.map((t) => t.tag) });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching ticket:");
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

// Add a reply (message) to a ticket — admin/staff only. Persisted in the
// ticket's metadata JSONB (metadata.messages) since a dedicated messages
// table does not exist in the schema yet.
router.post(
  "/tickets/:ticketId/messages",
  requireAuth,
  requireAdmin,
  require2FA,
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      if (typeof ticketId !== "string" || !ticketId.trim()) {
        return res.status(400).json({ error: "A single nonempty ticket ID is required" });
      }
      const { message } = req.body;

      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      const existing = await db
        .select({ id: supportTickets.id })
        .from(supportTickets)
        .where(eq(supportTickets.id, ticketId))
        .limit(1);
      if (!existing?.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const saved = await supportTicketService.addMessage(
        ticketId,
        req.user!.id,
        message.trim(),
        true,
      );

      logger.info(`Admin ${req.user?.email} replied to ticket ${ticketId}`);

      res.status(201).json(saved);
    } catch (error) {
      logger.warn({ err: error }, "Error adding ticket reply:");
      res.status(500).json({ error: "Failed to add reply" });
    }
  },
);

// Add tags to a ticket — admin only. Persisted in metadata.tags (deduplicated).
router.post(
  "/tickets/:ticketId/tags",
  requireAuth,
  requireAdmin,
  require2FA,
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      if (typeof ticketId !== "string" || !ticketId.trim()) {
        return res.status(400).json({ error: "A single nonempty ticket ID is required" });
      }
      const { tags } = req.body;

      const tagList = Array.isArray(tags)
        ? tags
        : typeof tags === "string"
          ? [tags]
          : [];
      const cleaned = tagList
        .map((t) => String(t).trim())
        .filter((t) => t.length > 0);

      if (!cleaned.length) {
        return res.status(400).json({ error: "At least one tag is required" });
      }

      await supportTicketService.addTags(ticketId, cleaned);
      const updatedTags = await supportTicketService.getTicketTags(ticketId);

      logger.info(
        `Admin ${req.user?.email} tagged ticket ${ticketId}: ${cleaned.join(", ")}`,
      );

      res.status(201).json({ tags: updatedTags.map((t) => t.tag) });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "Ticket not found") {
        return res.status(404).json({ error: "Ticket not found" });
      }
      logger.warn({ err: error }, "Error adding ticket tags:");
      res.status(500).json({ error: "Failed to add tags" });
    }
  },
);

// Remove a tag from a ticket — admin only.
router.delete(
  "/tickets/:ticketId/tags/:tag",
  requireAuth,
  requireAdmin,
  require2FA,
  async (req, res) => {
    try {
      const { ticketId, tag } = req.params;
      if (typeof ticketId !== "string" || !ticketId.trim() || typeof tag !== "string" || !tag.trim()) {
        return res.status(400).json({ error: "A single nonempty ticket ID and tag are required" });
      }

      const existing = await db
        .select({ metadata: supportTickets.metadata })
        .from(supportTickets)
        .where(eq(supportTickets.id, ticketId))
        .limit(1);
      if (!existing?.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      await db
        .update(supportTickets)
        .set({
          updatedAt: new Date(),
          metadata: sql`jsonb_set(COALESCE(${supportTickets.metadata}, '{}'::jsonb), '{tags}', (SELECT COALESCE(jsonb_agg(value), '[]'::jsonb) FROM jsonb_array_elements(COALESCE(${supportTickets.metadata}->'tags', '[]'::jsonb)) WHERE value <> ${JSON.stringify(tag)}::jsonb))`,
        })
        .where(eq(supportTickets.id, ticketId));
      const remaining = (await supportTicketService.getTicketTags(ticketId)).map(item => item.tag);

      logger.info(`Admin ${req.user?.email} removed tag "${tag}" from ticket ${ticketId}`);

      res.json({ tags: remaining });
    } catch (error) {
      logger.warn({ err: error }, "Error removing ticket tag:");
      res.status(500).json({ error: "Failed to remove tag" });
    }
  },
);

router.patch(
  "/tickets/:ticketId",
  requireAuth,
  requireAdmin,
  require2FA,
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      if (typeof ticketId !== "string" || !ticketId.trim()) {
        return res.status(400).json({ error: "A single nonempty ticket ID is required" });
      }
      const {
        status,
        priority,
        assignedTo,
        responseTimeMinutes,
        satisfactionRating,
        resolvedAt,
      } = req.body;

      const allowedStatuses = ["open", "in_progress", "resolved", "closed"];
      const allowedPriorities = ["low", "medium", "high", "critical"];

      if (status && !allowedStatuses?.includes(status)) {
        return res
          .status(400)
          .json({
            error: `Invalid status. Allowed: ${allowedStatuses?.join(", ")}`,
          });
      }

      if (priority && !allowedPriorities?.includes(priority)) {
        return res
          .status(400)
          .json({
            error: `Invalid priority. Allowed: ${allowedPriorities?.join(", ")}`,
          });
      }

      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (status !== undefined) updateData.status = status;
      if (priority !== undefined) updateData.priority = priority;
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
      if (responseTimeMinutes !== undefined)
        updateData.responseTimeMinutes = responseTimeMinutes;
      if (satisfactionRating !== undefined)
        updateData.satisfactionRating = satisfactionRating;
      if (resolvedAt !== undefined) updateData.resolvedAt = resolvedAt;

      if (status === "resolved" && !resolvedAt) {
        updateData.resolvedAt = new Date();
      }

      const updatedTickets = await db
        .update(supportTickets)
        .set(updateData)
        .where(eq(supportTickets.id, ticketId))
        .returning({ id: supportTickets.id });

      if (!updatedTickets.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      logger.info({ detail: updateData }, `Admin ${req.user?.email} updated ticket ${ticketId}:`,
      );

      res.json({ success: true, message: "Ticket updated" });
    } catch (error) {
      logger.warn({ err: error }, "Error updating ticket:");
      res.status(500).json({ error: "Failed to update ticket" });
    }
  },
);

router.post("/tickets", requireAuth, async (req, res) => {
  try {
    const { subject, description, category, priority } = req.body;

    if (!subject) {
      return res.status(400).json({ error: "Subject is required" });
    }

    const allowedCategories = ["general", "billing", "technical", "account"];
    const allowedPriorities = ["low", "medium", "high", "critical"];

    if (category && !allowedCategories?.includes(category)) {
      return res
        .status(400)
        .json({
          error: `Invalid category. Allowed: ${allowedCategories?.join(", ")}`,
        });
    }

    if (priority && !allowedPriorities?.includes(priority)) {
      return res
        .status(400)
        .json({
          error: `Invalid priority. Allowed: ${allowedPriorities?.join(", ")}`,
        });
    }

    const [newTicket] = await db
      .insert(supportTickets)
      .values({
        userId: req.user!.id,
        subject,
        description: description || null,
        category: category || "general",
        priority: priority || "medium",
        status: "open",
      })
      .returning();

    logger.info(`User ${req.user?.email} created ticket ${newTicket?.id}`);

    res.status(201).json(newTicket);

    setImmediate(async () => {
      try {
        await notificationService?.sendAdminSupportTicketNotification(
          req.user!.email!,
          subject,
          newTicket?.id,
        );
      } catch (err) {
        logger.warn({ err: err }, "Support ticket admin notification error:");
      }
    });
  } catch (error) {
    logger.warn({ err: error }, "Error creating ticket:");
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

export default router;
