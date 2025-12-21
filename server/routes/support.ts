import { Router, type RequestHandler } from 'express';
import { db } from '../db.js';
import { supportTickets, users } from '../../shared/schema.js';
import { eq, desc, like, or, sql, count, avg, and } from 'drizzle-orm';
import { logger } from '../logger.js';

const router = Router();

const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.get('/tickets/all', requireAdmin, async (req, res) => {
  try {
    const { status, priority, search } = req.query;

    let conditions = [];

    if (status && status !== 'all') {
      conditions.push(eq(supportTickets.status, status as string));
    }

    if (priority && priority !== 'all') {
      conditions.push(eq(supportTickets.priority, priority as string));
    }

    if (search) {
      conditions.push(
        or(
          like(supportTickets.subject, `%${search}%`),
          like(supportTickets.description, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
    logger.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [ticketStatsResult, avgResponseResult, avgSatisfactionResult] = await Promise.all([
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
      avgResponseTimeMinutes: parseFloat(avgResponseResult[0]?.avg || '0'),
      avgSatisfaction: parseFloat(avgSatisfactionResult[0]?.avg || '0'),
    });
  } catch (error) {
    logger.error('Error fetching ticket stats:', error);
    res.status(500).json({ error: 'Failed to fetch ticket stats' });
  }
});

router.get('/tickets/:ticketId', requireAdmin, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    if (!ticket.length) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(ticket[0]);
  } catch (error) {
    logger.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

router.patch('/tickets/:ticketId', requireAdmin, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, priority, assignedTo, responseTimeMinutes, satisfactionRating, resolvedAt } = req.body;

    const allowedStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    const allowedPriorities = ['low', 'medium', 'high', 'critical'];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` });
    }

    if (priority && !allowedPriorities.includes(priority)) {
      return res.status(400).json({ error: `Invalid priority. Allowed: ${allowedPriorities.join(', ')}` });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (responseTimeMinutes !== undefined) updateData.responseTimeMinutes = responseTimeMinutes;
    if (satisfactionRating !== undefined) updateData.satisfactionRating = satisfactionRating;
    if (resolvedAt !== undefined) updateData.resolvedAt = resolvedAt;

    if (status === 'resolved' && !resolvedAt) {
      updateData.resolvedAt = new Date();
    }

    await db.update(supportTickets).set(updateData).where(eq(supportTickets.id, ticketId));

    logger.info(`Admin ${req.user?.email} updated ticket ${ticketId}:`, updateData);

    res.json({ success: true, message: 'Ticket updated' });
  } catch (error) {
    logger.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

router.post('/tickets', requireAuth, async (req, res) => {
  try {
    const { subject, description, category, priority } = req.body;

    if (!subject) {
      return res.status(400).json({ error: 'Subject is required' });
    }

    const allowedCategories = ['general', 'billing', 'technical', 'account'];
    const allowedPriorities = ['low', 'medium', 'high', 'critical'];

    if (category && !allowedCategories.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Allowed: ${allowedCategories.join(', ')}` });
    }

    if (priority && !allowedPriorities.includes(priority)) {
      return res.status(400).json({ error: `Invalid priority. Allowed: ${allowedPriorities.join(', ')}` });
    }

    const [newTicket] = await db
      .insert(supportTickets)
      .values({
        userId: req.user!.id,
        subject,
        description: description || null,
        category: category || 'general',
        priority: priority || 'medium',
        status: 'open',
      })
      .returning();

    logger.info(`User ${req.user?.email} created ticket ${newTicket.id}`);

    res.status(201).json(newTicket);
  } catch (error) {
    logger.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

export default router;
