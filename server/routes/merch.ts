import { Router, Request, Response } from 'express';
import { db } from '../db';
import { merchItems, merchOrders } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { logger } from '../logger.js';

const router = Router();

// GET /api/merch - list user's merch items
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const items = await db.select()
      .from(merchItems)
      .where(eq(merchItems.userId, req.user!.id))
      .orderBy(desc(merchItems.createdAt));

    res.json(items);
  } catch (error: any) {
    logger.error('Error fetching merch items:', error);
    res.status(500).json({ error: 'Failed to fetch merch items' });
  }
});

// POST /api/merch - create merch item
router.post('/', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, description, price, salePrice, imageUrl, category, variants, inventory, sku, isActive, isDigital, downloadUrl } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const [item] = await db.insert(merchItems).values({
      userId: req.user!.id,
      name,
      description,
      price: String(price),
      salePrice: salePrice ? String(salePrice) : null,
      imageUrl,
      category: category || 'clothing',
      variants: variants || [],
      inventory: inventory || 0,
      sku,
      isActive: isActive !== undefined ? isActive : true,
      isDigital: isDigital !== undefined ? isDigital : false,
      downloadUrl,
      soldCount: 0,
    }).returning();

    res.status(201).json(item);
  } catch (error: any) {
    logger.error('Error creating merch item:', error);
    res.status(500).json({ error: 'Failed to create merch item' });
  }
});

// PUT /api/merch/:id - update merch item
router.put('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const existing = await db.select().from(merchItems)
      .where(and(eq(merchItems.id, id), eq(merchItems.userId, req.user!.id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Merch item not found' });
    }

    const updates = { ...req.body };
    // Handle numeric/string conversion for price fields if they are in the body
    if (updates.price !== undefined) updates.price = String(updates.price);
    if (updates.salePrice !== undefined) updates.salePrice = updates.salePrice ? String(updates.salePrice) : null;
    
    // Remove fields that shouldn't be updated directly via this endpoint if any
    delete updates.id;
    delete updates.userId;
    delete updates.createdAt;

    const [updated] = await db.update(merchItems)
      .set(updates)
      .where(and(eq(merchItems.id, id), eq(merchItems.userId, req.user!.id)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    logger.error('Error updating merch item:', error);
    res.status(500).json({ error: 'Failed to update merch item' });
  }
});

// DELETE /api/merch/:id - delete item
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const existing = await db.select().from(merchItems)
      .where(and(eq(merchItems.id, id), eq(merchItems.userId, req.user!.id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Merch item not found' });
    }

    await db.delete(merchItems)
      .where(and(eq(merchItems.id, id), eq(merchItems.userId, req.user!.id)));

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error deleting merch item:', error);
    res.status(500).json({ error: 'Failed to delete merch item' });
  }
});

// GET /api/merch/orders - list orders
router.get('/orders', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const orders = await db.select()
      .from(merchOrders)
      .where(eq(merchOrders.userId, req.user!.id))
      .orderBy(desc(merchOrders.createdAt));

    res.json(orders);
  } catch (error: any) {
    logger.error('Error fetching merch orders:', error);
    res.status(500).json({ error: 'Failed to fetch merch orders' });
  }
});

// PUT /api/merch/orders/:id - update order status
router.put('/orders/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { status, trackingNumber } = req.body;

    const existing = await db.select().from(merchOrders)
      .where(and(eq(merchOrders.id, id), eq(merchOrders.userId, req.user!.id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const [updated] = await db.update(merchOrders)
      .set({ 
        status: status || existing[0].status,
        trackingNumber: trackingNumber !== undefined ? trackingNumber : existing[0].trackingNumber
      })
      .where(and(eq(merchOrders.id, id), eq(merchOrders.userId, req.user!.id)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    logger.error('Error updating merch order:', error);
    res.status(500).json({ error: 'Failed to update merch order' });
  }
});

// GET /api/merch/stats - revenue, orders, bestsellers, inventory alerts
router.get('/stats', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;

    // Total Revenue & Total Orders
    const [orderStats] = await db.select({
      totalRevenue: sql<number>`COALESCE(SUM(${merchOrders.total}), 0)`,
      totalOrders: sql<number>`COUNT(*)`
    })
    .from(merchOrders)
    .where(eq(merchOrders.userId, userId));

    // Orders this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [monthlyOrders] = await db.select({
      count: sql<number>`COUNT(*)`
    })
    .from(merchOrders)
    .where(and(
      eq(merchOrders.userId, userId),
      sql`${merchOrders.createdAt} >= ${startOfMonth}`
    ));

    // Best sellers
    const topItems = await db.select()
      .from(merchItems)
      .where(eq(merchItems.userId, userId))
      .orderBy(desc(merchItems.soldCount))
      .limit(5);

    // Low inventory alerts
    const lowInventoryItems = await db.select()
      .from(merchItems)
      .where(and(
        eq(merchItems.userId, userId),
        sql`${merchItems.inventory} < 5`,
        eq(merchItems.isDigital, false)
      ));

    res.json({
      totalRevenue: Number(orderStats?.totalRevenue || 0),
      totalOrders: Number(orderStats?.totalOrders || 0),
      ordersThisMonth: Number(monthlyOrders?.count || 0),
      bestSellers: topItems,
      inventoryAlerts: lowInventoryItems.length,
      lowInventoryItems
    });

  } catch (error: any) {
    logger.error('Error fetching merch stats:', error);
    res.status(500).json({ error: 'Failed to fetch merch stats' });
  }
});

export default router;
