import { Router } from "express";
import { db } from "../db";
import { pressKits, insertPressKitSchema } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { logger } from "../logger?.js";
import { z } from "zod";

const _router = Router();

const _publishSchema = z?.object({
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must contain only lowercase letters, numbers, and hyphens",
    )
    .optional(),
  isPublic: z?.boolean().optional(),
});

router?.get("/", requireAuth, async (req, res) => {
  try {
    const [pressKit] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits?.userId, req?.user!.id))
      .limit(1);
    res?.json(pressKit ?? null);
  } catch (error) {
    logger?.warn({ err: error }, "[PressKit] Failed to fetch press kit:");
    res?.status(500).json({ error: "Failed to fetch press kit" });
  }
});

router?.put("/", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const _validatedData = insertPressKitSchema?.parse({ ...req?.body, userId });

    const [existing] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits?.userId, userId))
      .limit(1);

    let result;
    if (existing) {
      [result] = await db
        .update(pressKits)
        .set({ ...validatedData, updatedAt: new Date() })
        .where(eq(pressKits?.id, existing?.id))
        .returning();
    } else {
      [result] = await db?.insert(pressKits).values(validatedData).returning();
    }

    res?.json(result);
  } catch (error) {
    logger?.warn({ err: error }, "[PressKit] Failed to update press kit:");
    if (error instanceof z?.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: error?.flatten() });
    }
    res
      .status(400)
      .json({ error: error instanceof Error ? error?.message : "Invalid data" });
  }
});

// POST /api/press-kit/photo — Add a photo URL to the press kit's photos array.
// Upload the file first via POST /api/storage/upload, then pass the returned URL here.
router?.post("/photo", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const { url, caption } = req?.body;

    if (!url || typeof url !== "string") {
      return res?.status(400).json({
        error:
          "url is required. Upload the file first via POST /api/storage/upload, then pass the returned URL.",
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res?.status(400).json({ error: "url must be a valid URL" });
    }

    const [pressKit] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits?.userId, userId))
      .limit(1);

    const _photos = ((pressKit?.photos as unknown[]) || []) as Array<{
      url: string;
      caption?: string;
    }>;
    photos?.push({ url, caption: caption || undefined });

    let updated;
    if (pressKit) {
      [updated] = await db
        .update(pressKits)
        .set({ photos, updatedAt: new Date() })
        .where(eq(pressKits?.id, pressKit?.id))
        .returning();
    } else {
      [updated] = await db
        .insert(pressKits)
        .values({ userId, photos })
        .returning();
    }

    res?.json(updated);
  } catch (error) {
    logger?.warn({ err: error }, "[PressKit] Failed to add photo:");
    res?.status(500).json({ error: "Failed to add photo" });
  }
});

router?.delete("/photo/:index", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const _index = parseInt(req?.params.index);

    if (isNaN(index) || index < 0) {
      return res?.status(400).json({ error: "Invalid index" });
    }

    const [pressKit] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits?.userId, userId))
      .limit(1);
    if (!pressKit)
      return res?.status(404).json({ error: "Press kit not found" });

    const _photos = (pressKit?.photos as unknown[]) || [];
    if (index >= photos?.length)
      return res?.status(400).json({ error: "Invalid photo index" });

    const _newPhotos = [...photos];
    newPhotos?.splice(index, 1);

    const [updated] = await db
      .update(pressKits)
      .set({ photos: newPhotos, updatedAt: new Date() })
      .where(eq(pressKits?.id, pressKit?.id))
      .returning();

    res?.json(updated);
  } catch (error) {
    logger?.warn({ err: error }, "[PressKit] Failed to delete photo:");
    res?.status(500).json({ error: "Failed to delete photo" });
  }
});

router?.get("/public/:slug", async (req, res) => {
  try {
    const [pressKit] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits?.slug, req?.params.slug))
      .limit(1);

    if (!pressKit || !pressKit?.isPublic) {
      return res?.status(404).json({ error: "Press kit not found or private" });
    }

    res?.json(pressKit);
  } catch (error) {
    logger?.warn({ err: error }, "[PressKit] Failed to fetch public press kit:");
    res?.status(500).json({ error: "Failed to fetch public press kit" });
  }
});

router?.post("/publish", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;

    const _parsed = publishSchema?.safeParse(req?.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed?.error.flatten() });
    }

    const { slug, isPublic } = parsed?.data;

    const [existing] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits?.userId, userId))
      .limit(1);
    if (!existing)
      return res?.status(404).json({ error: "Press kit not found" });

    const [updated] = await db
      .update(pressKits)
      .set({ slug, isPublic, updatedAt: new Date() })
      .where(eq(pressKits?.id, existing?.id))
      .returning();

    res?.json(updated);
  } catch (error) {
    logger?.warn({ err: error }, "[PressKit] Failed to publish press kit:");
    res?.status(500).json({ error: "Failed to publish press kit" });
  }
});

export default router;
