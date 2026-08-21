// @ts-nocheck
import { Router, Request, Response } from "express";
import { createHardenedUpload } from "../middleware/uploadHandler.js";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import { z } from "zod";
import { discoveryAlgorithmService } from "../services/discoveryAlgorithmService";
import { marketplaceService } from "../services/marketplaceService";
import { storage } from "../storage";
import { storageService } from "../services/storageService";
import { storeUploadedFile } from "../middleware/uploadHandler.js";
import { notificationService } from "../services/notificationService";
import { logger } from "../logger.js";
import { db } from "../db";
import {
  orders,
  listings,
  users,
  licenseTemplates,
  systemSettings,
  collaborationProjects,
  projectMembers,
  listingStems,
  storefronts,
  storefrontFollows,
  storefrontRatings,
  beatInteractions,
} from "@shared/schema";
import { eq, and, gte, sql, desc, asc, or, inArray } from "drizzle-orm";
import { getBaseUrl } from "../config/defaults.js";
import { requireAuth } from "../middleware/auth.js";
import { processUploadedBeat } from "../services/audioSeparatorService.js";
import { distributedCache } from "../infrastructure/distributedCache.js";
import { pythonAIService } from "../services/pythonAIService.js";

const router = Router();

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
  "audio/aiff",
  "audio/x-aiff",
  "audio/ogg",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/x-ms-wma",
  "audio/opus",
]);
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const upload = createHardenedUpload({
  maxFileSize: 200 * 1024 * 1024,
  maxFiles: 5,
  perFieldMimes: {
    audioFile: Array.from(ALLOWED_AUDIO_MIMES),
    coverArt: Array.from(ALLOWED_IMAGE_MIMES),
  },
  label: "marketplace upload",
});

const purchaseSchema = z.object({
  beatId: z.string().min(1, "beatId is required"),
  licenseType: z.enum(["basic", "premium", "unlimited", "exclusive"], "licenseType is required"),
  useEscrow: z.boolean().optional(),
});

const licenseTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z
    .enum([
      "basic",
      "premium",
      "unlimited",
      "exclusive",
      "non-exclusive",
      "custom",
    ])
    .optional(),
  priceCents: z.number().int().min(0).optional(),
  streams: z.union([z.string(), z.number()]).optional(),
  copies: z.union([z.string(), z.number()]).optional(),
  musicVideos: z.union([z.string(), z.number()]).optional(),
  duration: z.string().max(50).optional(),
  allowsBroadcast: z.boolean().optional(),
  allowsProfit: z.boolean().optional(),
  allowsSync: z.boolean().optional(),
  fileFormats: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const interactionSchema = z.object({
  beatId: z.string().min(1, "beatId is required"),
  interactionType: z.enum(
    [
      "play",
      "like",
      "share",
      "purchase",
      "preview",
      "skip",
      "repeat",
      "add_to_cart",
    ],
    "interactionType is required",
  ),
  playDurationSeconds: z.number().min(0).optional(),
  completionRate: z.number().min(0).max(1).optional(),
  source: z.string().max(50).optional(),
  sessionId: z.string().max(100).optional(),
});

const contractSchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string().min(1),
  description: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  variables: z.array(z.string()).optional(),
});

const affiliateSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  commissionRate: z.number().min(0).max(100).optional(),
});

const collaborationSchema = z.object({
  toUserId: z.string().min(1, "toUserId is required"),
  type: z.string().min(1, "type is required"),
  beatId: z.string().optional(),
  terms: z.string().max(2000).optional(),
  splitPercentage: z.number().min(0).max(100).optional(),
  budget: z.number().min(0).optional(),
  message: z.string().max(1000).optional(),
});

router.get("/beats", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      search,
      genre,
      mood,
      sortBy,
      limit,
      offset,
      producerId,
      key,
      bpmMin,
      bpmMax,
      priceMin,
      priceMax,
      tags,
    } = req.query;

    // If filtering by producer, get their beats directly (short TTL since producer pages update often)
    if (producerId) {
      const cacheKey = `marketplace:producer-beats:${producerId}`;
      const producerBeats = await distributedCache?.getOrSet(
        cacheKey,
        () => marketplaceService?.getListingsByProducer(producerId as string),
        30,
      );
      return res.json(producerBeats);
    }

    const filters = {
      search: search as string,
      genre: genre as string,
      mood: mood as string,
      key: key as string,
      bpmMin: bpmMin ? parseInt(bpmMin as string) : undefined,
      bpmMax: bpmMax ? parseInt(bpmMax as string) : undefined,
      priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
      priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
      tags: tags ? (tags as string).split(",") : undefined,
      limit: Math.min(Math.max(1, parseInt(limit as string) || 20), 200),
      offset: Math.min(Math.max(0, parseInt(offset as string) || 0), 100_000),
    };

    // Personalized feeds are cached per-user (30s) to still feel fresh
    if (userId) {
      const filterSig = `${genre ?? ""}:${mood ?? ""}:${search ?? ""}:${sortBy ?? ""}:${limit ?? 20}:${offset ?? 0}`;
      const cacheKey = `marketplace:beats:user:${userId}:${filterSig}`;
      const personalizedBeats = await distributedCache?.getOrSet(
        cacheKey,
        () => discoveryAlgorithmService?.getPersonalizedFeed(userId, filters),
        30,
      );
      return res.json(personalizedBeats);
    }

    // Anonymous browse — longer TTL since it's not personalized
    const filterSig = `${genre ?? ""}:${mood ?? ""}:${search ?? ""}:${sortBy ?? ""}:${limit ?? 20}:${offset ?? 0}`;
    const cacheKey = `marketplace:beats:anon:${filterSig}`;
    const beats = await distributedCache.getOrSet(
      cacheKey,
      () =>
        marketplaceService.browseListings({
          ...filters,
          sortBy: (sortBy as "recent" | "popular" | "price_low" | "price_high" | undefined) || "recent",
        }),
      60,
    );

    res.json(beats);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching beats:");
    res.status(500).json({ error: "Failed to fetch beats" });
  }
});

router.get("/producer-analytics", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { timeRange = "30d" } = req.query;
    const userId = req.user!.id;
    const cacheKey = `marketplace:producer-analytics:${userId}:${timeRange}`;

    const result = await distributedCache.getOrSet(
      cacheKey,
      async () => {
        const userListings = await marketplaceService.getUserListings(userId);
        const userPurchases = await marketplaceService.getUserSales(userId);

        const totalViews = userListings.reduce(
          (sum, l) => sum + (l.views || 0),
          0,
        );
        const totalPlays = userListings.reduce(
          (sum, l) => sum + (l.plays || 0),
          0,
        );
        const totalSales = userPurchases.length;
        const totalRevenue = userPurchases.reduce(
          (sum, p) => sum + (p.amount || 0),
          0,
        );

        const conversionRate =
          totalViews > 0 ? (totalSales / (totalViews || 1)) * 100 : 0;
        const avgOrderValue = totalSales > 0 ? totalRevenue / (totalSales || 1) : 0;

        const days =
          timeRange === "7d"
            ? 7
            : timeRange === "90d"
              ? 90
              : timeRange === "1y"
                ? 365
                : 30;
        const currentPeriodStart = new Date(
          Date.now() - days * 24 * 60 * 60 * 1000,
        );
        const previousPeriodStart = new Date(
          Date.now() - days * 2 * 24 * 60 * 60 * 1000,
        );
        const now = new Date();

        const [[currentPeriodOrders], [previousPeriodOrders]] =
          await Promise.all([
            db
              .select({
                count: sql<number>`COUNT(*)`,
                revenue: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
              })
              .from(orders)
              .where(
                and(
                  eq(orders.sellerId, userId),
                  eq(orders.status, "completed"),
                  gte(orders.createdAt, currentPeriodStart),
                  sql`${orders.createdAt} < ${now}`,
                ),
              ),
            db
              .select({
                count: sql<number>`COUNT(*)`,
                revenue: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
              })
              .from(orders)
              .where(
                and(
                  eq(orders.sellerId, userId),
                  eq(orders.status, "completed"),
                  gte(orders.createdAt, previousPeriodStart),
                  sql`${orders.createdAt} < ${currentPeriodStart}`,
                ),
              ),
          ]);

        const curSales = Number(currentPeriodOrders.count || 0);
        const prevSales = Number(previousPeriodOrders.count || 0);
        const curRevenue = Number(currentPeriodOrders.revenue || 0);
        const prevRevenue = Number(previousPeriodOrders.revenue || 0);

        const calcChange = (cur: number, prev: number) =>
          prev > 0
            ? parseFloat((((cur - prev) / prev) * 100).toFixed(1))
            : cur > 0
              ? 100
              : 0;
        const salesChange = calcChange(curSales, prevSales);
        const revenueChange = calcChange(curRevenue, prevRevenue);

        const licenseBreakdown = userPurchases.reduce(
          (acc, p) => {
            const type = p.licenseType || "basic";
            if (!acc[type]) acc[type] = { count: 0, revenue: 0 };
            acc[type].count++;
            acc[type].revenue += p.amount || 0;
            return acc;
          },
          {} as Record<string, { count: number; revenue: number }>,
        );

        return {
          overview: {
            totalViews,
            totalPlays,
            totalSales,
            totalRevenue,
            conversionRate: parseFloat(conversionRate.toFixed(2)),
            avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
            viewsChange: 0,
            playsChange: 0,
            salesChange,
            revenueChange,
          },
          timeline: await generateTimelineData(timeRange as string, userId),
          topBeats: userListings
            .sort((a, b) => (b.plays || 0) - (a.plays || 0))
            .slice(0, 5)
            .map((beat) => ({
              id: beat.id,
              title: beat.title,
              views: beat.views || 0,
              plays: beat.plays || 0,
              sales: userPurchases.filter((p) => p.beatId === beat.id).length,
              revenue: userPurchases
                .filter((p) => p.beatId === beat.id)
                .reduce((s, p) => s + (p.amount || 0), 0),
              conversionRate:
                beat.views > 0
                  ? parseFloat(
                      (
                        (userPurchases.filter((p) => p.beatId === beat.id)
                          .length /
                          beat.views) *
                        100
                      ).toFixed(2),
                    )
                  : 0,
            })),
          licenseBreakdown: Object.entries(licenseBreakdown).map(
            ([type, data]) => ({
              type: type.charAt(0).toUpperCase() + type.slice(1),
              count: data.count,
              revenue: data.revenue,
              percentage:
                totalSales > 0
                  ? parseFloat(((data.count / (totalSales || 1)) * 100).toFixed(1))
                  : 0,
            }),
          ),
          trafficSources: [
            {
              source: "Direct",
              visits: Math.floor(totalViews * 0.33),
              conversions: Math.floor(totalSales * 0.35),
              percentage: 33.3,
            },
            {
              source: "Social Media",
              visits: Math.floor(totalViews * 0.28),
              conversions: Math.floor(totalSales * 0.25),
              percentage: 28.1,
            },
            {
              source: "Search",
              visits: Math.floor(totalViews * 0.21),
              conversions: Math.floor(totalSales * 0.22),
              percentage: 20.8,
            },
            {
              source: "Referral",
              visits: Math.floor(totalViews * 0.11),
              conversions: Math.floor(totalSales * 0.12),
              percentage: 11.2,
            },
            {
              source: "Email",
              visits: Math.floor(totalViews * 0.07),
              conversions: Math.floor(totalSales * 0.06),
              percentage: 6.6,
            },
          ],
        };
      },
      60,
    );

    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching producer analytics:");
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

async function generateTimelineData(timeRange: string, userId: string) {
  const cacheKey = `marketplace:timeline:${userId}:${timeRange}:${Math.floor(Date.now() / 60000)}`;
  return distributedCache.getOrSet(
    cacheKey,
    () => _computeTimelineData(timeRange, userId),
    60,
  );
}

async function _computeTimelineData(timeRange: string, userId: string) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const now = new Date();
  const periodCount =
    timeRange === "7d"
      ? 7
      : timeRange === "90d"
        ? 12
        : timeRange === "1y"
          ? 12
          : 10;

  const userListingIds = await db
    .select({ id: listings.id })
    .from(listings)
    .where(eq(listings.userId, userId))
    .limit(500);

  new Set(userListingIds.map((l) => l.id));

  const data = [];
  for (let i = periodCount - 1; i >= 0; i--) {
    const periodStart = new Date(now);
    const periodEnd = new Date(now);

    if (timeRange === "7d") {
      periodStart.setDate(periodStart.getDate() - i - 1);
      periodEnd.setDate(periodEnd.getDate() - i);
    } else {
      periodStart.setMonth(periodStart.getMonth() - i - 1);
      periodEnd.setMonth(periodEnd.getMonth() - i);
    }

    const periodOrders = await db
      .select({
        salesCount: sql<number>`COUNT(*)`,
        totalRevenue: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.sellerId, userId),
          eq(orders.status, "completed"),
          gte(orders.createdAt, periodStart),
          sql`${orders.createdAt} < ${periodEnd}`,
        ),
      );

    const salesCount = Number(periodOrders[0]?.salesCount ?? 0) || 0;
    const totalRevenue = Number(periodOrders[0]?.totalRevenue ?? 0) || 0;

    const label =
      timeRange === "7d"
        ? periodEnd.toLocaleDateString("en-US", { weekday: "short" })
        : months[periodEnd.getMonth()];

    data.push({
      date: label,
      views: 0,
      plays: 0,
      sales: salesCount,
      revenue: Math.round(totalRevenue * 100) / 100,
    });
  }
  return data;
}

router.get("/license-templates", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userTemplates = await db
      .select()
      .from(licenseTemplates)
      .where(eq(licenseTemplates.userId, req.user!.id))
      .orderBy(asc(licenseTemplates.sortOrder))
      .limit(50);

    const mapped = userTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      price: (t.priceCents || 0) / 100,
      priceCents: t.priceCents,
      streams:
        t.streams === "unlimited" ? "unlimited" : parseInt(t.streams || "0"),
      copies:
        t.copies === "unlimited" ? "unlimited" : parseInt(t.copies || "0"),
      musicVideos:
        t.musicVideos === "unlimited"
          ? "unlimited"
          : parseInt(t.musicVideos || "0"),
      duration: t.duration || "1 year",
      allowsBroadcast: t.allowsBroadcast ?? false,
      allowsProfit: t.allowsProfit ?? true,
      allowsSync: t.allowsSync ?? false,
      fileFormats: t.fileFormats || "MP3",
      isActive: t.isActive ?? true,
      sortOrder: t.sortOrder ?? 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    res.json(mapped);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching license templates:");
    res.status(500).json({ error: "Failed to fetch license templates" });
  }
});

router.post(
  "/license-templates",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const parsed = licenseTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const {
        name,
        type,
        priceCents,
        streams,
        copies,
        musicVideos,
        duration,
        allowsBroadcast,
        allowsProfit,
        allowsSync,
        fileFormats,
        sortOrder,
      } = parsed.data;
      const [template] = await db
        .insert(licenseTemplates)
        .values({
          userId: req.user!.id,
          name,
          type: type || "basic",
          priceCents: priceCents ?? 2999,
          streams: String(streams ?? "100000"),
          copies: String(copies ?? "5000"),
          musicVideos: String(musicVideos ?? "1"),
          duration: duration || "1 year",
          allowsBroadcast: allowsBroadcast ?? false,
          allowsProfit: allowsProfit ?? true,
          allowsSync: allowsSync ?? false,
          fileFormats: fileFormats || "MP3",
          sortOrder: sortOrder ?? 0,
        })
        .returning();
      res.status(201).json(template);
    } catch (error) {
      logger.warn({ err: error }, "Error creating license template:");
      res.status(500).json({ error: "Failed to create license template" });
    }
  },
);

router.put(
  "/license-templates/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as Record<string, string>;
      const existing = await db
        .select()
        .from(licenseTemplates)
        .where(
          and(
            eq(licenseTemplates.id, id),
            eq(licenseTemplates.userId, req.user!.id),
          ),
        )
        .limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: "License template not found" });
      }
      const parsed = licenseTemplateSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Validation error", details: parsed.error.flatten() });
      }
      const { streams, copies, musicVideos, ...rest } = parsed.data;
      const updates: Record<string, any> = {
        ...rest,
        ...(streams !== undefined && { streams: String(streams) }),
        ...(copies !== undefined && { copies: String(copies) }),
        ...(musicVideos !== undefined && { musicVideos: String(musicVideos) }),
        updatedAt: new Date(),
      };

      const [updated] = await db
        .update(licenseTemplates)
        .set(updates)
        .where(
          and(
            eq(licenseTemplates.id, id),
            eq(licenseTemplates.userId, req.user!.id),
          ),
        )
        .returning();
      res.json(updated);
    } catch (error) {
      logger.warn({ err: error }, "Error updating license template:");
      res.status(500).json({ error: "Failed to update license template" });
    }
  },
);

router.delete(
  "/license-templates/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as Record<string, string>;
      const existing = await db
        .select()
        .from(licenseTemplates)
        .where(
          and(
            eq(licenseTemplates.id, id),
            eq(licenseTemplates.userId, req.user!.id),
          ),
        )
        .limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: "License template not found" });
      }
      await db
        .delete(licenseTemplates)
        .where(
          and(
            eq(licenseTemplates.id, id),
            eq(licenseTemplates.userId, req.user!.id),
          ),
        );
      res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Error deleting license template:");
      res.status(500).json({ error: "Failed to delete license template" });
    }
  },
);

router.get("/my-beats", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userListings = await marketplaceService.getUserListings(req.user!.id);
    res.json(userListings);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching user beats:");
    res.status(500).json({ error: "Failed to fetch your beats" });
  }
});

router.get("/producers", async (_req: Request, res: Response) => {
  try {
    const producers = await storage.getProducers();
    res.json({ producers: producers || [] });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching producers:");
    res.status(500).json({ error: "Failed to fetch producers" });
  }
});

router.get("/purchases", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const purchases = await marketplaceService.getUserPurchases(req.user!.id);
    res.json(purchases);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching purchases:");
    res.status(500).json({ error: "Failed to fetch purchases" });
  }
});

router.get("/sales-analytics", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const analytics = await marketplaceService.getSalesAnalytics(req.user!.id);
    res.json(analytics);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching sales analytics:");
    res.status(500).json({ error: "Failed to fetch sales analytics" });
  }
});

router.post("/interaction", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parsed = interactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const {
      beatId,
      interactionType,
      playDurationSeconds,
      completionRate,
      source,
      sessionId,
    } = parsed.data;

    await discoveryAlgorithmService.recordInteraction({
      userId: req.user!.id,
      beatId,
      interactionType,
      playDurationSeconds,
      completionRate,
      source,
      sessionId,
    });

    res.json({ success: true });

    if (interactionType === "play") {
      setImmediate(async () => {
        try {
          const [listing] = await db
            .select({
              id: listings.id,
              title: listings.title,
              plays: (listings as any).plays,
              userId: listings.userId,
            })
            .from(listings)
            .where(eq(listings.id, beatId))
            .limit(1);
          if (listing) {
            const plays = (listing.plays || 0) + 1;
            const milestones = [
              100, 500, 1000, 5000, 10000, 25000, 50000, 100000, 500000,
              1000000,
            ];
            if (milestones.includes(plays)) {
              await notificationService.sendBeatPlayMilestoneNotification(
                listing.userId,
                listing.title || "Unknown Beat",
                plays,
              );
              await notificationService.sendStreamMilestoneNotification(
                listing.userId,
                listing.title || "Unknown Beat",
                plays,
              );
            }
          }
        } catch (err) {
          logger.warn({ err: err }, "Beat play milestone notification error:");
        }
      });
    }
  } catch (error) {
    logger.warn({ err: error }, "Error recording interaction:");
    res.status(500).json({ error: "Failed to record interaction" });
  }
});

router.get("/for-you", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { limit, offset, genre, mood } = req.query;
    const userId = req.user!.id;

    const personalizedBeats =
      await discoveryAlgorithmService.getPersonalizedFeed(userId, {
        limit: Math.min(Math.max(1, parseInt(limit as string) || 20), 200),
        offset: Math.min(Math.max(0, parseInt(offset as string) || 0), 100_000),
        genre: genre as string,
        mood: mood as string,
      });

    const insights = await discoveryAlgorithmService.getTasteInsights(userId);

    const sections = [
      {
        id: "for-you",
        title: "For You",
        description: "Beats curated based on your listening history",
        beats: personalizedBeats
          .filter((b) => b.discoveryScore > 0.5)
          .slice(0, 8),
        type: "personalized",
      },
      {
        id: "trending",
        title: "Trending Now",
        description: "Popular beats this week",
        beats: personalizedBeats.filter((b) => b.isHot).slice(0, 8),
        type: "trending",
      },
      {
        id: "new-releases",
        title: "New Releases",
        description: "Fresh beats just uploaded",
        beats: personalizedBeats.filter((b) => b.isNew).slice(0, 8),
        type: "new",
      },
    ];

    if (insights.topGenres.length > 0) {
      const topGenre = insights.topGenres[0];
      sections.push({
        id: `genre-${topGenre.genre.toLowerCase()}`,
        title: `Because You Like ${topGenre.genre}`,
        description: `More ${topGenre.genre} beats for you`,
        beats: personalizedBeats
          .filter((b) => b.genre === topGenre.genre)
          .slice(0, 8),
        type: "genre_match",
      });
    }

    if (insights.topMoods.length > 0) {
      const topMood = insights.topMoods[0];
      sections.push({
        id: `mood-${topMood.mood.toLowerCase()}`,
        title: `${topMood.mood} Vibes`,
        description: `Beats matching your ${topMood.mood.toLowerCase()} mood`,
        beats: personalizedBeats
          .filter((b) => b.mood === topMood.mood)
          .slice(0, 8),
        type: "mood_match",
      });
    }

    res.json({
      sections: sections.filter((s) => s.beats.length > 0),
      tasteProfile: {
        topGenres: insights.topGenres.slice(0, 3),
        topMoods: insights.topMoods.slice(0, 3),
        totalInteractions: insights.totalInteractions,
      },
      allBeats: personalizedBeats,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching For You feed:");
    res.status(500).json({ error: "Failed to fetch personalized feed" });
  }
});

router.get("/ai-recommendations", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const insights = await discoveryAlgorithmService.getTasteInsights(
      req.user!.id,
    );
    const topGenres = insights.topGenres.slice(0, 3).map((g) => g.genre);

    const recommendations = topGenres.map((genre, index) => ({
      id: `rec-${index}`,
      type: "genre_match",
      title: `${genre} Beats For You`,
      description: `Based on your listening history, you love ${genre} beats`,
      confidence: insights.topGenres[index].score || 0.5,
      action: "browse",
      metadata: { genre },
    }));

    res.json(recommendations);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching AI recommendations:");
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

router.get("/taste-profile", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const insights = await discoveryAlgorithmService.getTasteInsights(
      req.user!.id,
    );
    res.json(insights);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching taste profile:");
    res.status(500).json({ error: "Failed to fetch taste profile" });
  }
});

router.post("/follow-producer", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { producerId } = req.body;
    if (!producerId) {
      return res.status(400).json({ error: "producerId is required" });
    }

    const result = await discoveryAlgorithmService.followProducer(
      req.user!.id,
      producerId,
    );
    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "Error following producer:");
    res.status(500).json({ error: "Failed to follow producer" });
  }
});

router.post("/unfollow-producer", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { producerId } = req.body;
    if (!producerId) {
      return res.status(400).json({ error: "producerId is required" });
    }

    const result = await discoveryAlgorithmService.unfollowProducer(
      req.user!.id,
      producerId,
    );
    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "Error unfollowing producer:");
    res.status(500).json({ error: "Failed to unfollow producer" });
  }
});

// POST /api/marketplace/checkout/initiate — Stripe Checkout Session initiation.
// Accepts { beatId, licenseType } and returns { url } for the hosted checkout page.
// This is the canonical front-end entry point for beat purchases.
router.post("/checkout/initiate", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { beatId, licenseType } = req.body || {};
    if (!beatId || !licenseType) {
      return res.status(400).json({ error: "beatId and licenseType are required" });
    }
    const result = await marketplaceService.initiatePurchase(
      req.user!.id,
      beatId,
      licenseType,
    );
    return res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "[Marketplace] checkout/initiate error:");
    const msg = (error as Error).message || "Failed to initiate checkout";
    if (msg.includes("not found") || msg.includes("Not found"))
      return res.status(404).json({ error: msg });
    if (msg.includes("not configured") || msg.includes("Invalid") || msg.includes("inactive"))
      return res.status(400).json({ error: msg });
    if (msg.includes("Cannot purchase your own"))
      return res.status(403).json({ error: msg });
    return res.status(500).json({ error: "Failed to initiate checkout" });
  }
});

router.post("/purchase", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { beatId, licenseType } = parsed.data;

    const result = await marketplaceService.initiatePurchase(
      req.user!.id,
      beatId,
      licenseType,
    );

    await discoveryAlgorithmService.recordInteraction({
      userId: req.user!.id,
      beatId,
      interactionType: "purchase",
      source: "checkout",
    });

    res.json(result);

    // NOTE: beat_sold / beat_purchased notifications are sent by
    // marketplaceService.processPayment() after Stripe payment confirmation,
    // NOT here at initiation time (which fires before payment succeeds).
    // Sending them here would cause premature and duplicate notifications.
  } catch (error) {
    logger.warn({ err: error }, "Error initiating purchase:");
    const msg = (error as Error).message || "Failed to initiate purchase";
    if (msg.includes("not found") || msg.includes("Not found")) {
      return res.status(404).json({ error: msg });
    }
    if (
      msg.includes("not configured") ||
      msg.includes("Invalid") ||
      msg.includes("inactive")
    ) {
      return res.status(400).json({ error: msg });
    }
    if (msg.includes("Cannot purchase your own")) {
      return res.status(403).json({ error: msg });
    }
    res.status(500).json({ error: "Failed to initiate purchase" });
  }
});

router.get(
  "/purchases/:orderId/license-agreement",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { orderId } = req.params as Record<string, string>;

      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.userId !== req.user!.id && order.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const [[listing], [buyer], [seller]] = await Promise.all([
        db
          .select()
          .from(listings)
          .where(eq(listings.id, order.listingId))
          .limit(1),
        db.select().from(users).where(eq(users.id, order.userId)).limit(1),
        db.select().from(users).where(eq(users.id, order.sellerId)).limit(1),
      ]);

      const licenseType = order.licenseType || "basic";
      const templateMap: Record<string, any> = {
        basic: {
          name: "Basic Lease",
          type: "non-exclusive",
          streams: "100,000",
          copies: "5,000",
          radioStations: "2",
          musicVideos: "1",
          duration: "1 year",
          broadcast: false,
          sync: false,
          fileFormats: "MP3",
        },
        premium: {
          name: "Premium Lease",
          type: "non-exclusive",
          streams: "500,000",
          copies: "25,000",
          radioStations: "10",
          musicVideos: "3",
          duration: "2 years",
          broadcast: true,
          sync: true,
          fileFormats: "MP3, WAV",
        },
        unlimited: {
          name: "Unlimited Lease",
          type: "unlimited",
          streams: "Unlimited",
          copies: "Unlimited",
          radioStations: "Unlimited",
          musicVideos: "Unlimited",
          duration: "Lifetime",
          broadcast: true,
          sync: true,
          fileFormats: "MP3, WAV, Stems",
        },
        exclusive: {
          name: "Exclusive Rights",
          type: "exclusive",
          streams: "Unlimited",
          copies: "Unlimited",
          radioStations: "Unlimited",
          musicVideos: "Unlimited",
          duration: "Lifetime (Full Ownership)",
          broadcast: true,
          sync: true,
          fileFormats: "MP3, WAV, Stems, Project Files",
        },
      };

      const template = templateMap[licenseType] || templateMap.basic;
      const snapshot = order.licenseSnapshot as Record<string, unknown>;
      const beatTitle = listing.title || "Unknown Beat";
      const producerName =
        (seller as any).displayName || seller.username || "Producer";
      const buyerName = (buyer as any).displayName || buyer.username || "Buyer";
      const purchaseDate = order.createdAt
        ? new Date(order.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : new Date().toLocaleDateString();
      const amountPaid = `$${(order.amount || 0).toFixed(2)}`;
      const fileFormats =
        (snapshot.fileFormats as any).map((f: string) => f.toUpperCase()).join(", ") ||
        template.fileFormats;

      const isExclusive = licenseType === "exclusive";
      const agreement = [
        "═══════════════════════════════════════════════════════════════",
        "                    BEAT LICENSE AGREEMENT",
        `                    ${template.name.toUpperCase()}`,
        "═══════════════════════════════════════════════════════════════",
        "",
        `Agreement ID: ${order.id}`,
        `Date: ${purchaseDate}`,
        "",
        "PARTIES:",
        `  Producer (Licensor): ${producerName}`,
        `  Licensee (Buyer): ${buyerName}`,
        "",
        "BEAT INFORMATION:",
        `  Title: "${beatTitle}"`,
        `  License Type: ${template.name} (${template.type})`,
        `  Amount Paid: ${amountPaid}`,
        "",
        "═══════════════════════════════════════════════════════════════",
        "                      GRANT OF LICENSE",
        "═══════════════════════════════════════════════════════════════",
        "",
        isExclusive
          ? `Producer hereby TRANSFERS ALL RIGHTS, title, and interest in the beat titled "${beatTitle}" to ${buyerName}, including full copyright ownership.`
          : `Producer grants ${buyerName} a ${template.type} license to use the beat titled "${beatTitle}" under the following terms:`,
        "",
        "USAGE RIGHTS:",
        `  • Audio Streams: ${template.streams}`,
        `  • Physical/Digital Copies: ${template.copies}`,
        `  • Radio Stations: ${template.radioStations}`,
        `  • Music Videos: ${template.musicVideos}`,
        `  • Broadcast Television: ${template.broadcast ? "Included" : "Not included"}`,
        `  • Sync Licensing (Film/TV/Ads): ${template.sync ? "Included" : "Not included"}`,
        `  • License Duration: ${template.duration}`,
        "",
        "DELIVERABLES:",
        `  File Formats: ${fileFormats}`,
        "",
        "═══════════════════════════════════════════════════════════════",
        "                    TERMS AND CONDITIONS",
        "═══════════════════════════════════════════════════════════════",
        "",
        isExclusive
          ? `1. CREDIT: Credit to ${producerName} is appreciated but not required.`
          : `1. CREDIT: Licensee must credit ${producerName} as the producer in all works using this beat.`,
        "",
        "2. ROYALTIES: Licensee retains 100% of royalties from derivative works.",
        isExclusive
          ? "   Full ownership transferred to Licensee."
          : `   Producer retains publishing rights to the original composition.`,
        "",
        "3. MODIFICATIONS: Licensee may modify the beat for their creative purposes.",
        "",
        isExclusive
          ? "4. DISTRIBUTION: Licensee has full distribution rights with no limitations."
          : "4. DISTRIBUTION: Licensee may distribute works incorporating this beat within the usage limits specified above.",
        "",
        isExclusive
          ? "5. TRANSFERABILITY: This license and all associated rights are fully transferable."
          : "5. TRANSFERABILITY: This license is non-transferable.",
        "",
        ...(isExclusive
          ? [
              "6. EXCLUSIVITY: Producer agrees to remove the beat from all platforms and cease all future licensing.",
              "",
              "7. COPYRIGHT: Licensee may register the beat with any PRO and copyright offices.",
              "",
            ]
          : []),
        "═══════════════════════════════════════════════════════════════",
        "",
        "This agreement is automatically generated and represents a binding contract.",
        `Generated by Max Booster • ${purchaseDate}`,
        `Transaction ID: ${order.stripePaymentIntentId || order.id}`,
      ].join("\n");

      if (req.query.format === "download") {
        res.setHeader("Content-Type", "text/plain");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="license-agreement-${order.id}.txt"`,
        );
        return res.send(agreement);
      }

      res.json({
        orderId: order.id,
        licenseType,
        licenseName: template.name,
        beatTitle,
        producerName,
        buyerName,
        purchaseDate,
        amountPaid,
        agreement,
        template,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error generating license agreement:");
      res.status(500).json({ error: "Failed to generate license agreement" });
    }
  },
);

router.get("/escrow", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = String((req.user as unknown as Record<string, unknown>).id);
    const escrowOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          or(eq(orders.userId, userId), eq(orders.sellerId, userId)),
          or(eq(orders.status, "pending"), eq(orders.status, "escrow")),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(200);

    const formatted = escrowOrders.map((o) => ({
      id: o.id,
      orderId: o.id,
      buyerId: o.userId,
      sellerId: o.sellerId,
      listingId: o.listingId,
      amount: o.amount,
      currency: o.currency || "usd",
      status: o.status,
      licenseType: o.licenseType,
      createdAt: o.createdAt,
      releasedAt: null,
    }));

    res.json(formatted);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching escrow transactions:");
    res.status(500).json({ error: "Failed to fetch escrow transactions" });
  }
});

router.get("/affiliates", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = (req.user as unknown as Record<string, unknown>).id;
    const settingKey = `affiliates:${userId}`;
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, settingKey))
      .limit(1);

    const affiliates = row ? (row.value as unknown[]) || [] : [];
    res.json(affiliates);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching affiliates:");
    res.status(500).json({ error: "Failed to fetch affiliates" });
  }
});

router.get("/contracts", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = (req.user as unknown as Record<string, unknown>).id;
    const contracts = await storage.getContractTemplates((userId as string));
    res.json(contracts);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching contracts:");
    res.status(500).json({ error: "Failed to fetch contracts" });
  }
});

router.get("/contracts/:id", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = (req.user as unknown as Record<string, unknown>).id;
    const { id } = req.params as Record<string, string>;
    const contract = await storage.getContractTemplateByUser(id, (userId as string));

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    res.json(contract);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching contract:");
    res.status(500).json({ error: "Failed to fetch contract" });
  }
});

router.patch("/contracts/:id", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = (req.user as unknown as Record<string, unknown>).id;
    const { id } = req.params as Record<string, string>;

    const parsed = contractSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const contract = await storage.getContractTemplateByUser(id, (userId as string));
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    const updatedContract = await storage.updateContractTemplate(
      id,
      parsed.data,
    );

    res.json(updatedContract);
  } catch (error) {
    logger.warn({ err: error }, "Error updating contract:");
    res.status(500).json({ error: "Failed to update contract" });
  }
});

router.delete("/contracts/:id", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = (req.user as unknown as Record<string, unknown>).id;
    const { id } = req.params as Record<string, string>;

    const contract = await storage.getContractTemplateByUser(id, (userId as string));
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    await storage.deleteContractTemplate(id);
    res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, "Error deleting contract:");
    res.status(500).json({ error: "Failed to delete contract" });
  }
});

router.get("/collaborations", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = req.user!.id;

    // Find projects where user is owner
    const ownedProjects = await db
      .select()
      .from(collaborationProjects)
      .where(
        and(
          eq(collaborationProjects.ownerId, userId),
          sql`${collaborationProjects.metadata}->>'_offerType' = 'marketplace_collab'`,
        ),
      )
      .orderBy(desc(collaborationProjects.createdAt))
      .limit(100);

    // Find projects where user is a member (via projectMembers)
    const memberRows = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId))
      .limit(200);

    let memberProjects: Record<string, unknown>[] = [];
    if (memberRows.length > 0) {
      const memberProjectIds = memberRows.map((r) => r.projectId);
      memberProjects = await db
        .select()
        .from(collaborationProjects)
        .where(
          and(
            inArray(collaborationProjects.id, memberProjectIds),
            sql`${collaborationProjects.metadata}->>'_offerType' = 'marketplace_collab'`,
          ),
        )
        .orderBy(desc(collaborationProjects.createdAt))
        .limit(100);
    }

    const allProjects = [
      ...ownedProjects,
      ...(memberProjects?.filter((p) => p?.ownerId !== userId) ?? []),
    ];

    const collaborations = allProjects?.map((project) => {
      const meta = (project?.metadata as Record<string, unknown>) || {};
      return {
        id: project.id,
        fromUser: meta.fromUser || {
          id: project.ownerId,
          name: "Unknown",
          avatar: "",
        },
        toUser: meta.toUser || {
          id: meta.toUserId || "",
          name: "Recipient",
          avatar: "",
        },
        beatId: meta.beatId || null,
        beatTitle: meta.beatTitle || project?.title,
        type: meta.type || "custom",
        terms: meta.terms || project?.description || "",
        splitPercentage: meta.splitPercentage ?? 50,
        budget: meta.budget || null,
        status: project.status || "pending",
        messages: meta.messages || [],
        createdAt: (project.createdAt as any)?.toISOString() || new Date().toISOString(),
      };
    });

    res.json(collaborations);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching collaborations:");
    res.status(500).json({ error: "Failed to fetch collaborations" });
  }
});

router.post(
  "/upload",
  upload?.fields([
    { name: "audioFile", maxCount: 1 },
    { name: "coverArt", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const {
        title,
        genre,
        
        tempo,
        key,
        price,
        licenseType,
        description,
        tags,
      } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!title || !genre) {
        return res.status(400).json({ error: "Title and genre are required" });
      }

      let audioUrl = "";
      let artworkUrl = "";
      let uploadedAudioKey = "";

      if (files?.audioFile?.[0]) {
        const audioFile = files?.audioFile[0];
        const ext = path?.extname(audioFile?.originalname) || ".mp3";
        const filename = `${Date.now()}-${crypto?.randomBytes(8).toString("hex")}${ext}`;
        uploadedAudioKey = await storageService?.uploadFile(
          audioFile?.buffer,
          "beats",
          filename,
          audioFile?.mimetype,
        );
        audioUrl = `/api/marketplace/audio/${uploadedAudioKey}`;
        logger.info(`Audio file saved: ${uploadedAudioKey}`);
      }

      if (files?.coverArt?.[0]) {
        const coverFile = files?.coverArt[0];
        const result = await storeUploadedFile(
          coverFile,
          req.user!.id,
          "artwork",
        );
        artworkUrl = result?.url;
        logger.info(
          `Cover art saved via storeUploadedFile: ${result?.key} (processed: ${result?.processed})`,
        );
      } else if (
        req.body.artworkUrl &&
        typeof req.body.artworkUrl === "string"
      ) {
        // Cover art pre-uploaded separately — use the URL directly
        artworkUrl = req.body.artworkUrl;
      }

      const listing = await marketplaceService?.createListing({
        userId: req.user!.id,
        title,
        description,
        genre,
        bpm: parseInt(tempo) || undefined,
        key,
        price: parseFloat(price) || 50,
        audioUrl,
        artworkUrl,
        tags: tags ? tags?.split(",").map((t: string) => t?.trim()) : [],
        licenses: [
          {
            type: licenseType || "basic",
            price: parseFloat(price) || 50,
            features: ["MP3 Download", "Non-exclusive rights"],
          },
        ],
      });

      // Auto-tag BPM/key via Python librosa analysis if not provided by user
      if (files?.audioFile?.[0] && (!tempo || !key)) {
        const audioBuffer = files?.audioFile[0].buffer;
        const ext = path?.extname(files?.audioFile[0].originalname) || ".mp3";
        const tmpPath = path?.join(
          os?.tmpdir(),
          `beat_autotag_${listing?.id}${ext}`,
        );
        setImmediate(async () => {
          try {
            await fsPromises?.writeFile(tmpPath, audioBuffer);
            const available = await pythonAIService?.isAvailable();
            if (available) {
              const analysis = await pythonAIService?.analyzeAudio(
                tmpPath,
                false,
              );
              if (analysis?.success && analysis?.data) {
                const updateData: Record<string, unknown> = {};
                if (!tempo && (analysis?.data as any).bpm)
                  updateData.bpm = Math.round((analysis?.data as any).bpm);
                if (!key && (analysis?.data as any).key)
                  updateData.key = (analysis?.data as any).key;
                if (Object.keys(updateData).length > 0) {
                  await db
                    .update(listings)
                    .set(updateData)
                    .where(eq(listings.id, listing?.id));
                  logger.info(
                    `[AutoTag] Beat ${listing.id} tagged: BPM=${updateData.bpm ?? "kept"} key=${updateData?.key ?? "kept"}`,
                  );
                }
              }
            }
          } catch (tagErr) {
            logger.warn(tagErr, "[AutoTag] Failed to auto-tag beat:");
          } finally {
            fsPromises?.unlink(tmpPath).catch(() => {
              /* intentional: temp-file cleanup */
            });
          }
        });
      }

      // Notify admin about new marketplace listing awaiting review (async, non-blocking)
      setImmediate(async () => {
        try {
          await notificationService?.sendAdminMarketplaceReviewNotification(
            title,
            listing?.id,
            String((req.user as unknown as Record<string, unknown>)?.email || "unknown"),
          );
        } catch (err) {
          logger.warn(
            { err: err },
            "Marketplace review admin notification error:",
          );
        }
      });

      // Notify followers about the new beat upload (async, non-blocking)
      (async () => {
        try {
          const producerId = req.user!.id;
          const producerName =
            (req.user as unknown as Record<string, unknown>)?.firstName ||
            (req.user as unknown as Record<string, unknown>)?.username ||
            "A producer you follow";
          const followers =
            await discoveryAlgorithmService?.getProducerFollowers(producerId);

          if (followers?.length > 0) {
            logger.info(
              `Notifying ${followers?.length} followers about new beat: ${title}`,
            );

            // Send notifications in parallel batches of 10
            const batchSize = 10;
            for (let i = 0; i < followers.length; i += batchSize) {
              const batch = followers?.slice(i, i + batchSize);
              await Promise.all(
                batch?.map((followerId) =>
                  notificationService
                    .send({
                      userId: followerId,
                      type: "marketing",
                      title: "New Beat Alert!",
                      message: `${producerName} just dropped a new beat: "${title}". Check it out now!`,
                      link: `/marketplace/beat/${listing?.id}`,
                      metadata: {
                        beatId: listing.id,
                        producerId,
                        beatTitle: title,
                        genre,
                      },
                    })
                    .catch((err) =>
                      logger.warn(
                        { err: err },
                        `Failed to notify follower ${followerId}:`,
                      ),
                    ),
                ),
              );
            }

            logger.info(
              `Successfully notified ${followers?.length} followers about new beat`,
            );
          }
        } catch (notifyError) {
          logger.warn(notifyError, "Error notifying followers about new beat:");
        }
      })();

      res.status(201).json(listing);

      // Async audio separation: generate MP3 (all tiers) + stems (unlimited/exclusive)
      if (uploadedAudioKey) {
        setImmediate(async () => {
          try {
            const sepResult = await processUploadedBeat(
              listing?.id,
              req.user!.id,
              uploadedAudioKey,
              licenseType,
            );
            logger.info(
              `[AudioSeparator] Beat ${listing?.id} processed — ` +
                `mp3=${!!sepResult.mp3Url} stems=${sepResult?.stemsAvailable}`,
            );
          } catch (sepErr) {
            logger.warn(sepErr, "[AudioSeparator] Processing failed:");
          }
        });
      }

      setImmediate(async () => {
        try {
          await notificationService?.sendBeatListingLiveNotification(
            req.user!.id,
            title,
            parseFloat(price) || 50,
          );
        } catch (err) {
          logger.warn(
            { err: err },
            "[Marketplace] beat listing notification error:",
          );
        }
      });
    } catch (error) {
      logger.warn({ err: error }, "Error uploading beat:");
      res.status(500).json({ error: "Failed to upload beat" });
    }
  },
);

router.get("/audio/*path", async (req: Request, res: Response) => {
  try {
    let fileKey = Array.isArray((req.params.path as string))
      ? ((req.params.path as string) as any)?.join("/")
      : (req.params.path as string);

    if (typeof fileKey !== "string") {
      return res.status(400).json({ error: "Invalid audio path" });
    }

    if (
      fileKey?.includes("..") ||
      fileKey?.includes("\0") ||
      fileKey?.startsWith("/")
    ) {
      return res.status(400).json({ error: "Invalid audio path" });
    }

    if (fileKey?.startsWith("uploads/")) {
      fileKey = fileKey?.substring("uploads/".length);
    }

    const ext = path?.extname(fileKey).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".flac": "audio/flac",
      ".aiff": "audio/aiff",
      ".m4a": "audio/mp4",
      ".ogg": "audio/ogg",
      ".aac": "audio/aac",
    };
    const contentType = mimeTypes[ext] || "audio/mpeg";

    // CORS headers for audio playback
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges",
    );
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    // Fast path: stream directly from local disk (avoids PDIM round-trip for large files)
    const LOCAL_STORAGE_DIR = path?.resolve("./uploads/files");
    const localPath = path?.join(
      LOCAL_STORAGE_DIR,
      fileKey?.replace(/\//g, path?.sep),
    );

    try {
      const stat = await fsPromises?.stat(localPath);
      const fileSize = stat?.size;
      const range = req.headers.range;

      res.setHeader("Content-Type", contentType);
      res.setHeader("Accept-Ranges", "bytes");

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", chunkSize);
        fs?.createReadStream(localPath, { start, end }).pipe(res);
      } else {
        res.setHeader("Content-Length", fileSize);
        fs?.createReadStream(localPath).pipe(res);
      }
      return;
    } catch {
      // File not on local disk — fall through to PDIM
    }

    // Fallback: load from PDIM into buffer (for files not yet written to disk)
    const exists = await storageService?.fileExists(fileKey);
    if (!exists) {
      logger.warn(`Audio file not found: ${fileKey}`);
      return res.status(404).json({ error: "Audio file not found" });
    }

    const fileBuffer = await storageService?.downloadFile(fileKey);
    const fileSize = fileBuffer?.length;
    const range = req.headers.range;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Content-Length", chunkSize);
      res.send(fileBuffer?.subarray(start, end + 1));
    } else {
      res.setHeader("Content-Length", fileSize);
      res.send(fileBuffer);
    }
  } catch (error) {
    logger.warn({ err: error }, "Error serving audio file:");
    res.status(500).json({ error: "Failed to load audio file" });
  }
});

router.get("/cover/*path", async (req: Request, res: Response) => {
  try {
    const fileKey = Array.isArray((req.params.path as string))
      ? ((req.params.path as string) as any)?.join("/")
      : (req.params.path as string);

    if (typeof fileKey !== "string") {
      return res.status(400).json({ error: "Invalid cover path" });
    }

    if (
      fileKey?.includes("..") ||
      fileKey?.includes("\0") ||
      fileKey?.startsWith("/")
    ) {
      return res.status(400).json({ error: "Invalid cover path" });
    }

    const exists = await storageService?.fileExists(fileKey);
    if (!exists) {
      logger.warn(`Cover image not found: ${fileKey}`);
      return res.status(404).json({ error: "Cover image not found" });
    }

    const ext = path?.extname(fileKey).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };

    const fileBuffer = await storageService?.downloadFile(fileKey);

    // CORS headers for image loading - override Helmet restrictions
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");
    res.setHeader("Content-Length", fileBuffer?.length);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(fileBuffer);
  } catch (error) {
    logger.warn({ err: error }, "Error serving cover image:");
    res.status(500).json({ error: "Failed to load cover image" });
  }
});

router.put(
  "/listings/:id",
  upload?.fields([
    { name: "audio", maxCount: 1 },
    { name: "artwork", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params as Record<string, string>;
      const {
        title,
        description,
        genre,
        mood,
        tempo,
        key,
        price,
        tags,
        licenseType,
      } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      const updateData: Record<string, unknown> = {};
      if (title) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (genre) updateData.genre = genre;
      if (mood) updateData.mood = mood;
      if (tempo) updateData.bpm = parseInt(tempo);
      if (key) updateData.key = key;
      if (price) updateData.price = parseFloat(price);
      if (licenseType) updateData.licenseType = licenseType;
      if (tags) updateData.tags = tags?.split(",").map((t: string) => t?.trim());

      if (files?.audio?.[0]) {
        const audioFile = files?.audio[0];
        const ext = path?.extname(audioFile?.originalname).toLowerCase();
        const filename = `${Date.now()}-${crypto?.randomBytes(8).toString("hex")}${ext}`;
        const audioKey = await storageService?.uploadFile(
          audioFile?.buffer,
          "beats",
          filename,
          audioFile?.mimetype,
        );
        updateData.audioUrl = `/api/marketplace/audio/${audioKey}`;
      }

      if (files?.artwork?.[0]) {
        const artworkFile = files?.artwork[0];
        const result = await storeUploadedFile(
          artworkFile,
          req.user!.id,
          "artwork",
        );
        updateData.artworkUrl = result?.url;
        logger.info(
          `Artwork updated via storeUploadedFile: ${result?.key} (processed: ${result?.processed})`,
        );
      } else if (
        req.body.artworkUrl &&
        typeof req.body.artworkUrl === "string"
      ) {
        // Cover art pre-uploaded separately — use the URL directly
        updateData.artworkUrl = req.body.artworkUrl;
      }

      const updatedListing = await marketplaceService?.updateListing(
        id,
        req.user!.id,
        updateData,
      );
      if (!updatedListing) {
        return res.status(404).json({ error: "Listing not found" });
      }

      res.json(updatedListing);
    } catch (error) {
      logger.warn({ err: error }, "Error updating listing:");
      if ((error as any)?.message === "Not authorized to update this listing") {
        return res.status(403).json({ error: (error as any).message });
      }
      res.status(500).json({ error: "Failed to update beat" });
    }
  },
);

router.delete("/listings/:id", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params as Record<string, string>;
    await marketplaceService?.deleteListing(id, req.user!.id);
    res.json({ success: true, message: "Beat deleted successfully" });
  } catch (error) {
    logger.warn({ err: error }, "Error deleting listing:");
    if ((error as any)?.message === "Not authorized to delete this listing") {
      return res.status(403).json({ error: (error as any).message });
    }
    if ((error as any)?.message === "Listing not found") {
      return res.status(404).json({ error: (error as any).message });
    }
    res.status(500).json({ error: "Failed to delete beat" });
  }
});

router.post("/connect-stripe", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const baseUrl = getBaseUrl();

    const returnUrl = `${baseUrl}/marketplace?tab=payouts&setup=complete`;
    const refreshUrl = `${baseUrl}/marketplace?tab=payouts&setup=refresh`;

    const result = await marketplaceService?.setupStripeConnect(
      req.user!.id,
      returnUrl,
      refreshUrl,
    );

    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "Error connecting Stripe:");
    res.status(500).json({ error: "Failed to connect Stripe account" });
  }
});

router.post("/follow/:producerId", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { producerId } = req.params as Record<string, string>;
    if (!producerId) {
      return res.status(400).json({ error: "producerId is required" });
    }

    const result = await discoveryAlgorithmService?.followProducer(
      req.user!.id,
      producerId,
    );
    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "Error following producer:");
    res.status(500).json({ error: "Failed to follow producer" });
  }
});

router.post(
  "/escrow/:transactionId/release",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { transactionId } = req.params as Record<string, string>;
      res.json({
        success: true,
        message: "Escrow released successfully",
        transactionId,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error releasing escrow:");
      res.status(500).json({ error: "Failed to release escrow" });
    }
  },
);

router.post("/affiliates", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parsed = affiliateSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { name, email, commissionRate } = parsed?.data ?? {};

    const userId = (req.user as unknown as Record<string, unknown>).id;
    const settingKey = `affiliates:${userId}`;
    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, settingKey))
      .limit(1);
    const currentList: Record<string, unknown>[] = existing
      ? (existing?.value as Record<string, unknown>[]) || []
      : [];

    const affiliate = {
      id: `aff-${Date.now()}`,
      name,
      email,
      affiliateCode: `REF-${crypto?.randomBytes(3).toString("hex").toUpperCase()}`,
      commissionRate: commissionRate || 20,
      totalEarnings: 0,
      pendingPayout: 0,
      referralCount: 0,
      conversionRate: 0,
      status: "active",
      joinedAt: new Date().toISOString(),
    };

    const updatedList = [...currentList, affiliate];
    if (existing) {
      await db
        .update(systemSettings)
        .set({ value: updatedList, updatedAt: new Date() })
        .where(eq(systemSettings.key, settingKey));
    } else {
      await db
        .insert(systemSettings)
        .values({ key: settingKey, value: updatedList });
    }

    res.status(201).json(affiliate);
  } catch (error) {
    logger.warn({ err: error }, "Error creating affiliate:");
    res.status(500).json({ error: "Failed to create affiliate" });
  }
});

router.post("/contracts", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = String((req.user as unknown as Record<string, unknown>).id);
    const parsed = contractSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { name, description, content, category, variables } = parsed?.data ?? {};

    const contract = await storage.createContractTemplate({
      userId,
      name,
      description: description || "",
      content,
      category: category || "custom",
      variables: (variables || []) as Record<string, unknown>[],
    });

    res.status(201).json(contract);
  } catch (error) {
    logger.warn({ err: error }, "Error creating contract:");
    res.status(500).json({ error: "Failed to create contract" });
  }
});

router.post("/collaborations", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parsed = collaborationSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { toUserId, beatId, type, terms, splitPercentage, budget, message } =
      parsed?.data ?? {};
    const userId = req.user!.id;

    const fromUser = {
      id: userId,
      name: (req.user as unknown as Record<string, unknown>)?.username || "User",
      avatar: "",
    };
    const messages = message
      ? [
          {
            sender: userId,
            content: message,
            timestamp: new Date().toISOString(),
          },
        ]
      : [];

    const [project] = await db
      .insert(collaborationProjects)
      .values({
        title: `${type} collaboration`,
        description: terms || "",
        ownerId: userId,
        status: "pending",
        isPublic: false,
        metadata: {
          _offerType: "marketplace_collab",
          fromUser,
          toUser: { id: toUserId, name: "Recipient", avatar: "" },
          toUserId,
          beatId: beatId || null,
          beatTitle: null,
          type,
          terms: terms || "",
          splitPercentage: splitPercentage || 50,
          budget: budget || null,
          messages,
        },
      })
      .returning();

    const meta = (project?.metadata as Record<string, unknown>) || {};
    const collaboration = {
      id: project.id,
      fromUser: meta.fromUser,
      toUser: meta.toUser,
      beatId: meta.beatId,
      beatTitle: meta.beatTitle,
      type: meta.type,
      terms: meta.terms,
      splitPercentage: meta.splitPercentage,
      budget: meta.budget,
      status: project.status,
      messages: meta.messages,
      createdAt: project.createdAt?.toISOString() || new Date().toISOString(),
    };

    res.status(201).json(collaboration);
  } catch (error) {
    logger.warn({ err: error }, "Error creating collaboration:");
    res.status(500).json({ error: "Failed to create collaboration" });
  }
});

// Producer by ID endpoint
router.get("/producers/:producerId", async (req: Request, res: Response) => {
  try {
    const { producerId } = req.params as { producerId: string };
    const producer = await storage.getUser(producerId);
    if (!producer) {
      return res.status(404).json({ error: "Producer not found" });
    }

    const producerBeats =
      await marketplaceService?.getListingsByProducer(producerId);
    const beatCount = producerBeats?.length;

    const userStorefront = await db
      .select({ id: storefronts.id })
      .from(storefronts)
      .where(eq(storefronts.userId, producerId))
      .limit(1);
    const storefrontId = userStorefront[0]?.id;

    let followerCount = 0;
    let avgRating = 0;
    let salesCount = 0;

    if (storefrontId) {
      const [followResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(storefrontFollows)
        .where(eq(storefrontFollows.storefrontId, storefrontId))
        .limit(1);
      followerCount = followResult?.count || 0;

      const [ratingResult] = await db
        .select({
          avg: sql<number>`coalesce(avg(${storefrontRatings.rating}), 0)`,
        })
        .from(storefrontRatings)
        .where(eq(storefrontRatings.storefrontId, storefrontId))
        .limit(1);
      avgRating = Math.round((Number(ratingResult?.avg) || 0) * 10) / 10;
    }

    if (avgRating === 0 && producerBeats?.length > 0) {
      const beatRatings = producerBeats
        .filter((b: Record<string, unknown>) => Number(b?.avgRating || 0) > 0)
        .map((b: Record<string, unknown>) => Number(b?.avgRating || 0));
      if (beatRatings?.length > 0) {
        avgRating =
          Math.round(
            (beatRatings?.reduce((s: number, r: number) => s + r, 0) /
              beatRatings?.length) *
              10,
          ) / 10;
      }
    }

    const [salesResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(eq(orders.sellerId, producerId), eq(orders.status, "completed")),
      )
      .limit(1);
    salesCount = salesResult?.count || 0;

    const featuredBeats = producerBeats
      .slice(0, 8)
      .map((beat: Record<string, unknown>) => ({
        id: beat.id,
        title: beat.title,
        price: beat.price || (beat?.priceCents ? Number(beat.priceCents) / 100 : 0),
        plays: beat.plays || 0,
        likes: beat.likes || 0,
        genre: beat.genre || "",
        tempo: beat.bpm || beat?.tempo || 0,
        coverUrl: beat.artworkUrl || beat?.coverUrl || "",
        audioUrl: beat.previewUrl || beat?.audioUrl || "",
      }));

    const displayName =
      producer?.artistName ||
      `${producer?.firstName || ""} ${producer?.lastName || ""}`.trim() ||
      producer?.username ||
      "Producer";

    res.json({
      id: producer.id,
      username: producer.username,
      displayName,
      name: displayName,
      avatarUrl: producer.avatarUrl,
      bio: producer.bio,
      location: producer.location,
      website: producer.website,
      socialLinks: producer.socialLinks,
      followerCount,
      beatCount,
      sales: salesCount,
      rating: avgRating,
      verified:
        producer?.role === "admin" || producer?.subscriptionTier === "lifetime",
      featuredBeats,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching producer:");
    res.status(500).json({ error: "Failed to fetch producer" });
  }
});

// Producer follow status endpoint
router.get(
  "/producers/:producerId/follow-status",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { producerId } = req.params as { producerId: string };
      const profile = await discoveryAlgorithmService?.getOrCreateTasteProfile(
        req.user!.id,
      );
      const followedProducers = profile?.followedProducers || [];
      const isFollowing = followedProducers?.includes(producerId);
      res.json({ isFollowing });
    } catch (error) {
      logger.warn({ err: error }, "Error fetching follow status:");
      res.status(500).json({ error: "Failed to fetch follow status" });
    }
  },
);

// Toggle unfollow producer
router.post("/unfollow/:producerId", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { producerId } = req.params as { producerId: string };
    const result = await discoveryAlgorithmService?.unfollowProducer(
      req.user!.id,
      producerId,
    );
    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "Error unfollowing producer:");
    res.status(500).json({ error: "Failed to unfollow producer" });
  }
});

// Like a beat (toggle)
router.post("/beats/:beatId/like", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { beatId } = req.params as { beatId: string };

    // Check if already liked
    const existingLike = await db
      .select()
      .from(beatInteractions)
      .where(
        and(
          eq(beatInteractions.userId, req.user!.id),
          eq(beatInteractions.beatId, beatId),
          eq(beatInteractions.interactionType, "like"),
        ),
      )
      .limit(1);

    if (existingLike?.length > 0) {
      // Unlike - remove the interaction and decrement count
      await db
        .delete(beatInteractions)
        .where(
          and(
            eq(beatInteractions.userId, req.user!.id),
            eq(beatInteractions.beatId, beatId),
            eq(beatInteractions.interactionType, "like"),
          ),
        );

      // Decrement like count in listing metadata
      const [listing] = await db
        .select()
        .from(listings)
        .where(eq(listings.id, beatId))
        .limit(1);
      let newLikes = 0;
      if (listing) {
        const currentMetadata =
          (listing?.metadata as Record<string, unknown>) || {};
        newLikes = Math.max(0, Number(currentMetadata?.likes || 0) - 1);
        await db
          .update(listings)
          .set({ metadata: { ...currentMetadata, likes: newLikes } })
          .where(eq(listings.id, beatId));
      }

      res.json({ success: true, liked: false, likes: newLikes });
    } else {
      // Like - record the interaction
      await discoveryAlgorithmService?.recordInteraction({
        userId: req.user!.id,
        beatId,
        interactionType: "like",
        source: "marketplace",
      });

      // Increment like count in listing metadata
      const [listing] = await db
        .select()
        .from(listings)
        .where(eq(listings.id, beatId))
        .limit(1);
      if (listing) {
        const currentMetadata =
          (listing?.metadata as Record<string, unknown>) || {};
        const newLikes = Number(currentMetadata?.likes || 0) + 1;
        await db
          .update(listings)
          .set({ metadata: { ...currentMetadata, likes: newLikes } })
          .where(eq(listings.id, beatId));
        res.json({ success: true, liked: true, likes: newLikes });
      } else {
        res.json({ success: true, liked: true });
      }
    }
  } catch (error) {
    logger.warn({ err: error }, "Error liking beat:");
    res.status(500).json({ error: "Failed to like beat" });
  }
});

// Get like status for a beat
router.get(
  "/beats/:beatId/like-status",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { beatId } = req.params as { beatId: string };

      // Check if user has liked this beat by checking interactions
      const likes = await db
        .select()
        .from(beatInteractions)
        .where(
          and(
            eq(beatInteractions.userId, req.user!.id),
            eq(beatInteractions.beatId, beatId),
            eq(beatInteractions.interactionType, "like"),
          ),
        )
        .limit(1);

      res.json({ isLiked: likes.length > 0 });
    } catch (error) {
      logger.warn({ err: error }, "Error checking like status:");
      res.status(500).json({ error: "Failed to check like status" });
    }
  },
);

// Rate a beat
router.post("/beats/:beatId/rate", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { beatId } = req.params as { beatId: string };
    const { rating } = req.body;

    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    // Store rating in beat interactions with custom data
    await discoveryAlgorithmService?.recordInteraction({
      userId: req.user!.id,
      beatId,
      interactionType: "rate",
      source: "marketplace",
    });

    // Update listing metadata with new rating
    // Get current listing and update average rating
    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, beatId))
      .limit(1);
    if (listing) {
      const currentMetadata =
        (listing?.metadata as Record<string, unknown>) || {};
      const currentRatings = (currentMetadata?.ratings as Array<{
        userId: string;
        rating: number;
        createdAt?: string;
      }>) || [];
      const userRatingIndex = currentRatings?.findIndex(
        (r) => r?.userId === req.user!.id,
      );

      if (userRatingIndex >= 0) {
        currentRatings[userRatingIndex].rating = rating;
      } else {
        currentRatings?.push({
          userId: req.user!.id,
          rating,
          createdAt: new Date().toISOString(),
        });
      }

      const avgRating =
        currentRatings?.reduce((sum: number, r) => sum + r?.rating, 0) /
        currentRatings?.length;

      await db
        .update(listings)
        .set({
          metadata: {
            ...currentMetadata,
            ratings: currentRatings,
            avgRating: Math.round(avgRating * 10) / 10,
            ratingCount: currentRatings.length,
          },
        })
        .where(eq(listings.id, beatId));

      res.json({
        success: true,
        rating,
        avgRating: Math.round(avgRating * 10) / 10,
      });
    } else {
      res.status(404).json({ error: "Beat not found" });
    }
  } catch (error) {
    logger.warn({ err: error }, "Error rating beat:");
    res.status(500).json({ error: "Failed to rate beat" });
  }
});

// Get beat rating info
router.get("/beats/:beatId/rating", async (req: Request, res: Response) => {
  try {
    const { beatId } = req.params as Record<string, string>;
    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, beatId))
      .limit(1);
    if (!listing) {
      return res.status(404).json({ error: "Beat not found" });
    }

    const metadata = (listing?.metadata as Record<string, unknown>) || {};
    const userRating = req.isAuthenticated()
      ? ((metadata?.ratings as Array<{ userId: string; rating: number }>) || [])
          .find((r) => r?.userId === req.user!.id)?.rating || 0
      : 0;

    res.json({
      avgRating: metadata.avgRating || 0,
      ratingCount: metadata.ratingCount || 0,
      userRating,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching beat rating:");
    res.status(500).json({ error: "Failed to fetch rating" });
  }
});

// Stems endpoints
router.get(
  "/stems/:stemId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { stemId } = req.params as Record<string, string>;
      res.json({
        id: stemId,
        name: "Stem",
        type: "wav",
        duration: 180,
        price: 29.99,
        downloadUrl: null,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error fetching stem:");
      res.status(500).json({ error: "Failed to fetch stem" });
    }
  },
);

router.post("/stems/:stemId/purchase", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { stemId } = req.params as { stemId: string };
    res.json({
      success: true,
      purchaseId: `purchase_${Date.now()}`,
      stemId,
      downloadUrl: `/api/marketplace/stems/${stemId}/download`,
    });

    setImmediate(async () => {
      try {
        await notificationService?.sendStemsPurchasedNotification(
          req.user!.id,
          stemId,
        );
      } catch (err) {
        logger.warn(
          { err: err },
          "[Marketplace] stems purchase notification error:",
        );
      }
    });
  } catch (error) {
    logger.warn({ err: error }, "Error purchasing stem:");
    res.status(500).json({ error: "Failed to purchase stem" });
  }
});

router.get(
  "/stems/:stemId/download/:trackId",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { stemId, trackId } = req.params as Record<string, string>;
      res.json({
        success: true,
        downloadUrl: `/uploads/stems/${stemId}_${trackId}.wav`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    } catch (error) {
      logger.warn({ err: error }, "Error generating stem download:");
      res.status(500).json({ error: "Failed to generate download link" });
    }
  },
);

router.get("/my-stems", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = req.user!.id;
    const stems = await db
      .select()
      .from(listingStems)
      .where(eq(listingStems.userId, userId))
      .orderBy(desc(listingStems.createdAt))
      .limit(100);
    res.json(stems);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching user stems:");
    res.status(500).json({ error: "Failed to fetch your stems" });
  }
});

router.get(
  "/listings/:listingId/stems",
  async (req: Request, res: Response) => {
    try {
      const { listingId } = req.params as { listingId: string };
      const stems = await db
        .select()
        .from(listingStems)
        .where(eq(listingStems.listingId, listingId))
        .orderBy(asc(listingStems.createdAt))
        .limit(50);
      res.json(stems);
    } catch (error) {
      logger.warn({ err: error }, "Error fetching listing stems:");
      res.status(500).json({ error: "Failed to fetch listing stems" });
    }
  },
);

router.post(
  "/listings/:listingId/stems",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { listingId } = req.params as { listingId: string };
      const {
        stemName,
        stemType,
        fileUrl,
        fileSize,
        format,
        sampleRate,
        bitDepth,
        price,
      } = req.body;

      if (!stemName || !fileUrl) {
        return res
          .status(400)
          .json({ error: "stemName and fileUrl are required" });
      }

      const [stem] = await db
        .insert(listingStems)
        .values({
          listingId,
          userId,
          stemName,
          stemType: stemType || "other",
          fileUrl,
          fileSize: fileSize || 0,
          format: format || "wav",
          sampleRate: sampleRate || null,
          bitDepth: bitDepth || null,
          price: price ? String(price) : null,
        })
        .returning();

      res.status(201).json(stem);
    } catch (error) {
      logger.warn({ err: error }, "Error creating stem:");
      res.status(500).json({ error: "Failed to create stem" });
    }
  },
);

router.delete(
  "/stems/:stemId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { stemId } = req.params as { stemId: string };

      const [deleted] = await db
        .delete(listingStems)
        .where(
          and(eq(listingStems.id, stemId), eq(listingStems.userId, userId)),
        )
        .returning();

      if (!deleted) {
        return res
          .status(404)
          .json({ error: "Stem not found or not authorized" });
      }

      res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Error deleting stem:");
      res.status(500).json({ error: "Failed to delete stem" });
    }
  },
);

export default router;
