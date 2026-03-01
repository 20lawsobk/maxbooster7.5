import { Router } from 'express';
import { db } from '../db';
import { projectBudgets, budgetLineItems, insertProjectBudgetSchema, insertBudgetLineItemSchema } from '@shared/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const budgets = await db.select().from(projectBudgets)
      .where(eq(projectBudgets.userId, req.user!.id))
      .orderBy(desc(projectBudgets.createdAt));
    res.json(budgets);
  } catch (error) {
    logger.error('[ProjectBudgets] Failed to list:', error);
    res.status(500).json({ error: 'Failed to fetch project budgets' });
  }
});

router.get('/:id/items', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const budget = await db.select().from(projectBudgets)
      .where(and(eq(projectBudgets.id, id), eq(projectBudgets.userId, userId)))
      .limit(1);

    if (budget.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    const items = await db.select().from(budgetLineItems)
      .where(eq(budgetLineItems.budgetId, id))
      .orderBy(desc(budgetLineItems.createdAt));
    res.json(items);
  } catch (error) {
    logger.error('[ProjectBudgets] Failed to fetch line items:', error);
    res.status(500).json({ error: 'Failed to fetch budget line items' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const data = insertProjectBudgetSchema.parse({ ...req.body, userId: req.user!.id });
    const [item] = await db.insert(projectBudgets).values(data).returning();
    res.status(201).json(item);
  } catch (error: any) {
    logger.error('[ProjectBudgets] Failed to create:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to create project budget' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(projectBudgets)
      .where(and(eq(projectBudgets.id, id), eq(projectBudgets.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    const data = insertProjectBudgetSchema.partial().parse(req.body);
    const [item] = await db.update(projectBudgets)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(projectBudgets.id, id), eq(projectBudgets.userId, userId)))
      .returning();
    res.json(item);
  } catch (error: any) {
    logger.error('[ProjectBudgets] Failed to update:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to update project budget' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(projectBudgets)
      .where(and(eq(projectBudgets.id, id), eq(projectBudgets.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    await db.delete(budgetLineItems).where(eq(budgetLineItems.budgetId, id));
    await db.delete(projectBudgets)
      .where(and(eq(projectBudgets.id, id), eq(projectBudgets.userId, userId)));
    res.json({ success: true });
  } catch (error) {
    logger.error('[ProjectBudgets] Failed to delete:', error);
    res.status(500).json({ error: 'Failed to delete project budget' });
  }
});

router.post('/:id/items', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const budget = await db.select().from(projectBudgets)
      .where(and(eq(projectBudgets.id, id), eq(projectBudgets.userId, userId)))
      .limit(1);

    if (budget.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    const data = insertBudgetLineItemSchema.parse({ ...req.body, budgetId: id, userId });
    const [item] = await db.insert(budgetLineItems).values(data).returning();
    res.status(201).json(item);
  } catch (error: any) {
    logger.error('[ProjectBudgets] Failed to create line item:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to create budget line item' });
  }
});

router.put('/items/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(budgetLineItems)
      .where(and(eq(budgetLineItems.id, id), eq(budgetLineItems.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Line item not found' });
    }

    const data = insertBudgetLineItemSchema.partial().parse(req.body);
    const [item] = await db.update(budgetLineItems)
      .set(data)
      .where(and(eq(budgetLineItems.id, id), eq(budgetLineItems.userId, userId)))
      .returning();
    res.json(item);
  } catch (error: any) {
    logger.error('[ProjectBudgets] Failed to update line item:', error);
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to update budget line item' });
  }
});

router.delete('/items/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(budgetLineItems)
      .where(and(eq(budgetLineItems.id, id), eq(budgetLineItems.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Line item not found' });
    }

    await db.delete(budgetLineItems)
      .where(and(eq(budgetLineItems.id, id), eq(budgetLineItems.userId, userId)));
    res.json({ success: true });
  } catch (error) {
    logger.error('[ProjectBudgets] Failed to delete line item:', error);
    res.status(500).json({ error: 'Failed to delete budget line item' });
  }
});

export default router;
