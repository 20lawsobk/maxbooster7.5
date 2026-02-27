import { Router } from 'express';
import { db } from '../db';
import { projectBudgets, budgetLineItems, insertProjectBudgetSchema, insertBudgetLineItemSchema } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const budgets = await db.select().from(projectBudgets)
    .where(eq(projectBudgets.userId, req.session.userId))
    .orderBy(desc(projectBudgets.createdAt));
  res.json(budgets);
});

router.get('/:id/items', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const items = await db.select().from(budgetLineItems)
    .where(eq(budgetLineItems.budgetId, req.params.id))
    .orderBy(desc(budgetLineItems.createdAt));
  res.json(items);
});

router.post('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const data = insertProjectBudgetSchema.parse({ ...req.body, userId: req.session.userId });
    const [item] = await db.insert(projectBudgets).values(data).returning();
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const [item] = await db.update(projectBudgets)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(projectBudgets.id, req.params.id))
    .returning();
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  await db.delete(projectBudgets).where(eq(projectBudgets.id, req.params.id));
  res.json({ success: true });
});

router.post('/:id/items', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const data = insertBudgetLineItemSchema.parse({ ...req.body, budgetId: req.params.id, userId: req.session.userId });
    const [item] = await db.insert(budgetLineItems).values(data).returning();
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/items/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const [item] = await db.update(budgetLineItems)
    .set(req.body)
    .where(eq(budgetLineItems.id, req.params.id))
    .returning();
  res.json(item);
});

router.delete('/items/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  await db.delete(budgetLineItems).where(eq(budgetLineItems.id, req.params.id));
  res.json({ success: true });
});

export default router;
