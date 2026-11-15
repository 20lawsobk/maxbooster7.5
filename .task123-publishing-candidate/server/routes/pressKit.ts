import { Router } from "express";
import { db } from "../db";
import { pressKits, insertPressKitSchema } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { logger } from "../logger.js";
import { apiCache } from "../middleware/apiCache.js";
import { storageService } from "../services/storageService.js";
import path from "path";
import { z } from "zod";

const router = Router();

function invalidatePublicPressKitCache(): void {
  // Public kits are cached under the anonymous cache key. The generic
  // per-user invalidation performed for writes cannot evict that entry.
  apiCache.invalidatePattern("/api/press-kit/public/");
}

function publicPhotoUrl(slug: string, photoUrl: string, index: number): string {
  // Files uploaded through /api/storage/upload are deliberately private. A
  // public EPK is an explicit sharing grant, so proxy only those selected
  // photo records through the public-kit media endpoint.
  if (
    photoUrl.startsWith("/api/storage/file/") ||
    photoUrl.startsWith("http://") ||
    photoUrl.startsWith("https://")
  ) {
    try {
      const parsed = new URL(photoUrl, "http://localhost");
      if (parsed.pathname.startsWith("/api/storage/file/")) {
        return `/api/press-kit/public/${encodeURIComponent(slug)}/photo/${index}`;
      }
    } catch {
      // The client will render external URLs directly; malformed values are
      // not transformed into a storage request.
    }
  }
  return photoUrl;
}

function isOwnedStoragePhotoUrl(url: string, userId: string): boolean {
  try {
    const parsed = new URL(url, "http://localhost");
    if (!parsed.pathname.startsWith("/api/storage/file/")) return false;
    const key = decodeURIComponent(
      parsed.pathname.slice("/api/storage/file/".length),
    );
    return key.startsWith(`users/${userId}/`) && !key.includes("..");
  } catch {
    return false;
  }
}

function publicPressKitResponse(pressKit: typeof pressKits.$inferSelect) {
  return {
    artistName: pressKit.artistName,
    bio: pressKit.bio,
    shortBio: pressKit.shortBio,
    genres: pressKit.genres,
    contactEmail: pressKit.contactEmail,
    bookingEmail: pressKit.bookingEmail,
    website: pressKit.website,
    socialLinks: pressKit.socialLinks,
    photos: Array.isArray(pressKit.photos)
      ? pressKit.photos.map((photo, index) => {
          const value = photo as { url?: unknown; caption?: unknown };
          return {
            url:
              typeof value.url === "string"
                ? publicPhotoUrl(pressKit.slug!, value.url, index)
                : "",
            ...(typeof value.caption === "string"
              ? { caption: value.caption }
              : {}),
          };
        })
      : [],
    technicalRider: pressKit.technicalRider,
    hospitalityRider: pressKit.hospitalityRider,
  };
}

const publishSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must contain only lowercase letters, numbers, and hyphens",
    )
    .optional(),
  isPublic: z.boolean().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const [pressKit] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits.userId, req.user!.id))
      .limit(1);
    res.json(pressKit ?? null);
  } catch (error) {
    logger.warn({ err: error }, "[PressKit] Failed to fetch press kit:");
    res.status(500).json({ error: "Failed to fetch press kit" });
  }
});

router.put("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const validatedData = insertPressKitSchema?.parse({ ...req.body, userId });
    const photos = validatedData.photos;
    if (
      Array.isArray(photos) &&
      photos.some((photo) => {
        const url =
          photo &&
          typeof photo === "object" &&
          typeof (photo as { url?: unknown }).url === "string"
            ? (photo as { url: string }).url
            : undefined;
        return !!url?.startsWith("/") && !isOwnedStoragePhotoUrl(url, userId);
      })
    ) {
      return res.status(400).json({ error: "Photos must be your uploaded images" });
    }

    const [existing] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits.userId, userId))
      .limit(1);

    let result;
    if (existing) {
      [result] = await db
        .update(pressKits)
        .set({ ...validatedData, updatedAt: new Date() })
        .where(eq(pressKits.id, existing?.id))
        .returning();
    } else {
      [result] = await db.insert(pressKits).values(validatedData).returning();
    }

    invalidatePublicPressKitCache();
    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "[PressKit] Failed to update press kit:");
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: error.flatten() });
    }
    res
      .status(400)
      .json({ error: error instanceof Error ? error?.message : "Invalid data" });
  }
});

// POST /api/press-kit/photo — Add a photo URL to the press kit's photos array.
// Upload the file first via POST /api/storage/upload, then pass the returned URL here.
router.post("/photo", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { url, caption } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        error:
          "url is required. Upload the file first via POST /api/storage/upload, then pass the returned URL.",
      });
    }

    // Storage uploads return a same-origin relative URL. Accept it only when
    // it addresses a file in this user's private storage; external image URLs
    // must remain valid absolute URLs.
    try {
      if (!url.startsWith("/")) new URL(url);
    } catch {
      return res.status(400).json({ error: "url must be a valid URL" });
    }
    if (url.startsWith("/") && !isOwnedStoragePhotoUrl(url, userId)) {
      return res.status(400).json({ error: "url must be an uploaded image" });
    }

    const [pressKit] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits.userId, userId))
      .limit(1);

    const photos = ((pressKit?.photos as unknown[]) || []) as Array<{
      url: string;
      caption?: string;
    }>;
    photos?.push({ url, caption: caption || undefined });

    let updated;
    if (pressKit) {
      [updated] = await db
        .update(pressKits)
        .set({ photos, updatedAt: new Date() })
        .where(eq(pressKits.id, pressKit?.id))
        .returning();
    } else {
      [updated] = await db
        .insert(pressKits)
        .values({ userId, photos })
        .returning();
    }

    invalidatePublicPressKitCache();
    res.json(updated);
  } catch (error) {
    logger.warn({ err: error }, "[PressKit] Failed to add photo:");
    res.status(500).json({ error: "Failed to add photo" });
  }
});

router.delete("/photo/:index", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const index = parseInt((req.params.index as string));

    if (isNaN(index) || index < 0) {
      return res.status(400).json({ error: "Invalid index" });
    }

    const [pressKit] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits.userId, userId))
      .limit(1);
    if (!pressKit)
      return res.status(404).json({ error: "Press kit not found" });

    const photos = (pressKit?.photos as unknown[]) || [];
    if (index >= photos?.length)
      return res.status(400).json({ error: "Invalid photo index" });

    const newPhotos = [...photos];
    newPhotos?.splice(index, 1);

    const [updated] = await db
      .update(pressKits)
      .set({ photos: newPhotos, updatedAt: new Date() })
      .where(eq(pressKits.id, pressKit?.id))
      .returning();

    invalidatePublicPressKitCache();
    res.json(updated);
  } catch (error) {
    logger.warn({ err: error }, "[PressKit] Failed to delete photo:");
    res.status(500).json({ error: "Failed to delete photo" });
  }
});

router.get("/public/:slug/photo/:index", async (req, res) => {
  try {
    const index = Number.parseInt(req.params.index as string, 10);
    if (!Number.isSafeInteger(index) || index < 0) {
      return res.status(404).json({ error: "Press photo not found" });
    }

    const [pressKit] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits.slug, req.params.slug as string))
      .limit(1);
    if (!pressKit?.isPublic || !Array.isArray(pressKit.photos)) {
      return res.status(404).json({ error: "Press photo not found" });
    }

    const photo = pressKit.photos[index] as { url?: unknown } | undefined;
    if (typeof photo?.url !== "string") {
      return res.status(404).json({ error: "Press photo not found" });
    }

    const parsed = new URL(photo.url, "http://localhost");
    if (!parsed.pathname.startsWith("/api/storage/file/")) {
      return res.status(404).json({ error: "Press photo not found" });
    }
    const key = decodeURIComponent(
      parsed.pathname.slice("/api/storage/file/".length),
    );
    if (!key.startsWith(`users/${pressKit.userId}/`) || key.includes("..")) {
      return res.status(404).json({ error: "Press photo not found" });
    }

    const contentTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };
    const contentType = contentTypes[path.extname(key).toLowerCase()];
    if (!contentType) {
      return res.status(404).json({ error: "Press photo not found" });
    }

    const image = await storageService.downloadFile(key);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Length", image.length);
    res.send(image);
  } catch (error) {
    logger.warn({ err: error }, "[PressKit] Failed to fetch public press photo:");
    res.status(404).json({ error: "Press photo not found" });
  }
});

router.get("/public/:slug", async (req, res) => {
  try {
    const [pressKit] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits.slug, (req.params.slug as string)))
      .limit(1);

    if (!pressKit || !pressKit?.isPublic) {
      return res.status(404).json({ error: "Press kit not found or private" });
    }

    res.json(publicPressKitResponse(pressKit));
  } catch (error) {
    logger.warn({ err: error }, "[PressKit] Failed to fetch public press kit:");
    res.status(500).json({ error: "Failed to fetch public press kit" });
  }
});

router.post("/publish", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const parsed = publishSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const { slug, isPublic } = parsed?.data ?? {};

    const [existing] = await db
      .select()
      .from(pressKits)
      .where(eq(pressKits.userId, userId))
      .limit(1);
    if (!existing)
      return res.status(404).json({ error: "Press kit not found" });

    const [updated] = await db
      .update(pressKits)
      .set({ slug, isPublic, updatedAt: new Date() })
      .where(eq(pressKits.id, existing?.id))
      .returning();

    invalidatePublicPressKitCache();
    res.json(updated);
  } catch (error) {
    logger.warn({ err: error }, "[PressKit] Failed to publish press kit:");
    res.status(500).json({ error: "Failed to publish press kit" });
  }
});

export default router;
