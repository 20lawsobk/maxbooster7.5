import { requireUUIDParam } from "../middleware/requestValidation.js";
import { Router, Request, Response } from "express";
import { db } from "../db";
import { merchItems, merchOrders } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";
import { parsePaginationParams } from "../middleware/pagination.js";

const router = Router();

const VALID_CATEGORIES = [
  "clothing",
  "accessories",
  "music",
  "digital",
  "art",
  "other",
] as const;
const VALID_ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

const createMerchSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  price: z.number().min(0).max(1_000_000),
  salePrice: z.number().min(0).max(1_000_000).nullable().optional(),
  imageUrl: z.string().url().max(2048).optional().or(z.literal("")),
  category: z.enum(VALID_CATEGORIES).optional().default("clothing"),
  variants: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  inventory: z.number().int().min(0).optional().default(0),
  sku: z.string().max(100).optional(),
  isActive: z.boolean().optional().default(true),
  isDigital: z.boolean().optional().default(false),
  downloadUrl: z
    .string()
    .url()
    .max(2048)
    .optional()
    .or(z.literal(""))
    .nullable(),
});

const updateMerchSchema = createMerchSchema?.partial();

const updateOrderSchema = z.object({
  status: z.enum(VALID_ORDER_STATUSES).optional(),
  trackingNumber: z.string().max(200).nullable().optional(),
});

// GET /api/merch - list user's merch items
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const items = await db
      .select()
      .from(merchItems)
      .where(eq(merchItems.userId, req.user!.id))
      .orderBy(desc(merchItems.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(items);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching merch items:");
    res.status(500).json({ error: "Failed to fetch merch items" });
  }
});

// POST /api/merch - create merch item
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = createMerchSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const data = parsed?.data;
    const [item] = await db
      .insert(merchItems)
      .values({
        userId: req.user!.id,
        name: data.name,
        description: data.description,
        price: String(data?.price),
        salePrice: data.salePrice != null ? String(data?.salePrice) : null,
        imageUrl: data.imageUrl || null,
        category: data.category,
        variants: data.variants,
        inventory: data.inventory,
        sku: data.sku,
        isActive: data.isActive,
        isDigital: data.isDigital,
        downloadUrl: data.downloadUrl || null,
        soldCount: 0,
      })
      .returning();

    res.status(201).json(item);
  } catch (error) {
    logger.warn({ err: error }, "Error creating merch item:");
    res.status(500).json({ error: "Failed to create merch item" });
  }
});

// PUT /api/merch/:id - update merch item (explicit field allowlist - no body spread)
router.put(
  "/:id",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as Record<string, string>;

      const parsed = updateMerchSchema?.safeParse(req.body);
      if (!parsed?.success) {
        return res
          .status(400)
          .json({ error: "Validation error", details: parsed.error.flatten() });
      }

      const existing = await db
        .select()
        .from(merchItems)
        .where(and(eq(merchItems.id, id), eq(merchItems.userId, req.user!.id)))
        .limit(1);

      if (existing?.length === 0) {
        return res.status(404).json({ error: "Merch item not found" });
      }

      const data = parsed?.data;
      const allowedUpdates: Record<string, unknown> = {};
      if (data?.name !== undefined) allowedUpdates.name = data?.name;
      if (data?.description !== undefined)
        allowedUpdates.description = data?.description;
      if (data?.price !== undefined) allowedUpdates.price = String(data?.price);
      if (data?.salePrice !== undefined)
        allowedUpdates.salePrice =
          data?.salePrice != null ? String(data?.salePrice) : null;
      if (data?.imageUrl !== undefined)
        allowedUpdates.imageUrl = data?.imageUrl || null;
      if (data?.category !== undefined) allowedUpdates.category = data?.category;
      if (data?.variants !== undefined) allowedUpdates.variants = data?.variants;
      if (data?.inventory !== undefined)
        allowedUpdates.inventory = data?.inventory;
      if (data?.sku !== undefined) allowedUpdates.sku = data?.sku;
      if (data?.isActive !== undefined) allowedUpdates.isActive = data?.isActive;
      if (data?.isDigital !== undefined)
        allowedUpdates.isDigital = data?.isDigital;
      if (data?.downloadUrl !== undefined)
        allowedUpdates.downloadUrl = data?.downloadUrl || null;

      if (Object.keys(allowedUpdates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const [updated] = await db
        .update(merchItems)
        .set(allowedUpdates)
        .where(and(eq(merchItems.id, id), eq(merchItems.userId, req.user!.id)))
        .returning();

      res.json(updated);
    } catch (error) {
      logger.warn({ err: error }, "Error updating merch item:");
      res.status(500).json({ error: "Failed to update merch item" });
    }
  },
);

// DELETE /api/merch/:id - delete item
router.delete(
  "/:id",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as Record<string, string>;
      const existing = await db
        .select()
        .from(merchItems)
        .where(and(eq(merchItems.id, id), eq(merchItems.userId, req.user!.id)))
        .limit(1);

      if (existing?.length === 0) {
        return res.status(404).json({ error: "Merch item not found" });
      }

      await db
        .delete(merchItems)
        .where(and(eq(merchItems.id, id), eq(merchItems.userId, req.user!.id)));

      res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Error deleting merch item:");
      res.status(500).json({ error: "Failed to delete merch item" });
    }
  },
);

// GET /api/merch/orders - list orders
router.get("/orders", requireAuth, async (req: Request, res: Response) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const orders = await db
      .select()
      .from(merchOrders)
      .where(eq(merchOrders.userId, req.user!.id))
      .orderBy(desc(merchOrders.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(orders);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching merch orders:");
    res.status(500).json({ error: "Failed to fetch merch orders" });
  }
});

// PUT /api/merch/orders/:id - update order status
router.put("/orders/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as Record<string, string>;

    const parsed = updateOrderSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const existing = await db
      .select()
      .from(merchOrders)
      .where(and(eq(merchOrders.id, id), eq(merchOrders.userId, req.user!.id)))
      .limit(1);

    if (existing?.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { status, trackingNumber } = parsed?.data;
    const [updated] = await db
      .update(merchOrders)
      .set({
        status: status ?? existing[0].status,
        trackingNumber:
          trackingNumber !== undefined
            ? trackingNumber
            : existing[0].trackingNumber,
      })
      .where(and(eq(merchOrders.id, id), eq(merchOrders.userId, req.user!.id)))
      .returning();

    res.json(updated);
  } catch (error) {
    logger.warn({ err: error }, "Error updating merch order:");
    res.status(500).json({ error: "Failed to update merch order" });
  }
});

// GET /api/merch/stats - revenue, orders, bestsellers, inventory alerts
router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const [orderStats] = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${merchOrders.total}), 0)`,
        totalOrders: sql<number>`COUNT(*)`,
      })
      .from(merchOrders)
      .where(eq(merchOrders.userId, userId));

    const startOfMonth = new Date();
    startOfMonth?.setDate(1);
    startOfMonth?.setHours(0, 0, 0, 0);

    const [monthlyOrders] = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(merchOrders)
      .where(
        and(
          eq(merchOrders.userId, userId),
          sql`${merchOrders.createdAt} >= ${startOfMonth}`,
        ),
      );

    const topItems = await db
      .select()
      .from(merchItems)
      .where(eq(merchItems.userId, userId))
      .orderBy(desc(merchItems.soldCount))
      .limit(5);

    const lowInventoryItems = await db
      .select()
      .from(merchItems)
      .where(
        and(
          eq(merchItems.userId, userId),
          sql`${merchItems.inventory} < 5`,
          eq(merchItems.isDigital, false),
        ),
      )
      .limit(50);

    res.json({
      totalRevenue: Number(orderStats?.totalRevenue || 0),
      totalOrders: Number(orderStats?.totalOrders || 0),
      ordersThisMonth: Number(monthlyOrders?.count || 0),
      bestSellers: topItems,
      inventoryAlerts: lowInventoryItems.length,
      lowInventoryItems,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching merch stats:");
    res.status(500).json({ error: "Failed to fetch merch stats" });
  }
});

// GET /api/merch/:id - get single merch item (after /stats & /orders to avoid route shadowing)
router.get(
  "/:id",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const [item] = await db
        .select()
        .from(merchItems)
        .where(
          and(
            eq(merchItems.id, (req.params.id as string)),
            eq(merchItems.userId, req.user!.id),
          ),
        )
        .limit(1);
      if (!item) return res.status(404).json({ error: "Merch item not found" });
      res.json(item);
    } catch (error) {
      logger.warn({ err: error }, "Error fetching merch item:");
      res.status(500).json({ error: "Failed to fetch merch item" });
    }
  },
);

export default router;
