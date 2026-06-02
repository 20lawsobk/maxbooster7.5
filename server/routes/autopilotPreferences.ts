import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { autopilotPreferences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const postingScheduleSchema = z
  .object({
    timezone: z.string().max(64).optional(),
    preferredHours: z.array(z.number().int().min(0).max(23)).optional(),
    preferredDays: z.array(z.string().max(20)).optional(),
    avoidHours: z.array(z.number().int().min(0).max(23)).optional(),
    avoidDays: z.array(z.string().max(20)).optional(),
  })
  .optional();

const contentExamplesSchema = z
  .object({
    goodPosts: z.array(z.string().max(500)).optional(),
    badPosts: z.array(z.string().max(500)).optional(),
    inspirationalAccounts: z.array(z.string().max(100)).optional(),
  })
  .optional();

const preferencesSchema = z.object({
  artistName: z.string().max(200).optional(),
  artistBio: z.string().max(2000).optional(),
  genre: z.string().max(100).optional(),
  subGenres: z.array(z.string().max(100)).optional(),
  brandVoice: z.string().max(50).optional(),
  targetAudience: z.string().max(500).optional(),
  uniqueSellingPoints: z.array(z.string().max(200)).optional(),
  contentTone: z.string().max(50).optional(),
  preferredEmojis: z.array(z.string().max(10)).optional(),
  avoidEmojis: z.boolean().optional(),
  preferredHashtags: z.array(z.string().max(100)).optional(),
  avoidHashtags: z.array(z.string().max(100)).optional(),
  contentThemes: z.array(z.string().max(100)).optional(),
  avoidTopics: z.array(z.string().max(100)).optional(),
  callToActionStyle: z.string().max(50).optional(),
  platformSettings: z.record(z.string(), z.unknown()).optional(),
  postingSchedule: postingScheduleSchema,
  adAutopilotEnabled: z.boolean().optional(),
  organicGrowthPriority: z.string().max(50).optional(),
  crossPostingEnabled: z.boolean().optional(),
  viralOptimizationLevel: z.string().max(50).optional(),
  contentExamples: contentExamplesSchema,
  currentReleases: z.array(z.unknown()).optional(),
  customInstructions: z.string().max(5000).optional(),
  isActive: z.boolean().optional(),
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const [preferences] = await db
      .select()
      .from(autopilotPreferences)
      .where(eq(autopilotPreferences.userId, req.user.id))
      .limit(1);

    if (!preferences) {
      return res.json({
        userId: req.user.id,
        artistName: "",
        artistBio: "",
        genre: "",
        subGenres: [],
        brandVoice: "casual",
        targetAudience: "",
        uniqueSellingPoints: [],
        contentTone: "casual",
        preferredEmojis: [],
        avoidEmojis: false,
        preferredHashtags: [],
        avoidHashtags: [],
        contentThemes: [],
        avoidTopics: [],
        callToActionStyle: "direct",
        platformSettings: {},
        postingSchedule: {
          timezone: "America/New_York",
          preferredHours: [9, 12, 18, 21],
          preferredDays: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
          ],
          avoidHours: [],
          avoidDays: [],
        },
        adAutopilotEnabled: false,
        organicGrowthPriority: "engagement",
        crossPostingEnabled: true,
        viralOptimizationLevel: "moderate",
        contentExamples: {
          goodPosts: [],
          badPosts: [],
          inspirationalAccounts: [],
        },
        currentReleases: [],
        customInstructions: "",
        isActive: true,
      });
    }

    res.json(preferences);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching autopilot preferences:");
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message || "Invalid input";
      logger.warn(
        { validationErrors: parsed.error.errors },
        "Autopilot preferences validation failed",
      );
      return res.status(400).json({ error: msg });
    }

    const updatePayload = {
      ...parsed.data,
      isActive: parsed.data.isActive ?? true,
      lastUpdated: new Date(),
    };

    const insertPayload = {
      userId: req.user.id,
      ...updatePayload,
    };

    const [result] = await db
      .insert(autopilotPreferences)
      .values(insertPayload)
      .onConflictDoUpdate({
        target: autopilotPreferences.userId,
        set: updatePayload,
      })
      .returning();

    logger.info(`Autopilot preferences saved for user ${req.user.id}`);
    res.json(result);
  } catch (error) {
    logger.warn(
      { err: error, message: error?.message, code: error?.code },
      "Error saving autopilot preferences",
    );
    res
      .status(500)
      .json({ error: "Failed to save preferences", detail: error?.message });
  }
});

router.patch("/", async (req: Request, res: Response) => {
  try {
    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.errors[0]?.message || "Invalid input" });
    }

    const [existing] = await db
      .select()
      .from(autopilotPreferences)
      .where(eq(autopilotPreferences.userId, req.user.id))
      .limit(1);

    if (!existing) {
      return res
        .status(404)
        .json({ error: "Preferences not found. Create them first." });
    }

    const updateData = {
      ...parsed.data,
      lastUpdated: new Date(),
    };

    const [result] = await db
      .update(autopilotPreferences)
      .set(updateData)
      .where(eq(autopilotPreferences.userId, req.user.id))
      .returning();

    logger.info(`Autopilot preferences updated for user ${req.user.id}`);
    res.json(result);
  } catch (error) {
    logger.warn(
      { err: error, message: error?.message, code: error?.code },
      "Error updating autopilot preferences",
    );
    res
      .status(500)
      .json({ error: "Failed to update preferences", detail: error?.message });
  }
});

export default router;
