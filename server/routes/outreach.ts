// @ts-nocheck
/**
 * Outreach CRM API
 *
 * Tracks pitch campaigns (blog, playlist, sync supervisor, PR outlet, radio)
 * from draft → sent → opened → replied → added/declined.
 *
 * Routes mounted at /api/outreach
 */

import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import {
  outreachCampaigns,
  outreachPitches,
  insertOutreachCampaignSchema,
  insertOutreachPitchSchema,
} from "@shared/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { MaxCoreAIClient } from "../services/maxcoreClient.js";
import { getAwarenessContext } from "../services/awarenessContext.js";

const router = Router();
router.use(requireAuth);

// ─── Campaigns ────────────────────────────────────────────────────────────────

router.get("/campaigns", async (req, res) => {
  try {
    const userId = req.user!.id;
    const rawPage = parseInt(String(req.query.page ?? "1"), 10);
    const rawLimit = parseInt(String(req.query.limit ?? "20"), 10);
    const page =
      Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
    const limit =
      Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(100, rawLimit) : 20;
    const offset = Math.min((page - 1) * limit, 100_000);

    const campaigns = await db
      .select()
      .from(outreachCampaigns)
      .where(eq(outreachCampaigns.userId, userId))
      .orderBy(desc(outreachCampaigns.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(campaigns);
  } catch (err) {
    logger.warn({ err }, "[Outreach] GET /campaigns failed");
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  campaignType: z.enum([
    "blog",
    "playlist",
    "sync_supervisor",
    "pr_outlet",
    "radio",
  ]),
  releaseId: z.string().optional(),
  beatId: z.string().optional(),
  notes: z.string().max(5000).optional(),
});

router.post("/campaigns", async (req, res) => {
  try {
    const userId = req.user!.id;
    const body = createCampaignSchema.safeParse(req.body);
    if (!body.success)
      return res.status(400).json({ error: body.error.format() });

    const [campaign] = await db
      .insert(outreachCampaigns)
      .values({ userId, ...body.data })
      .returning();

    res.status(201).json(campaign);
  } catch (err) {
    logger.warn({ err }, "[Outreach] POST /campaigns failed");
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.delete("/campaigns/:id", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(outreachCampaigns)
      .where(
        and(eq(outreachCampaigns.id, id), eq(outreachCampaigns.userId, userId)),
      )
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Campaign not found" });

    await db
      .update(outreachCampaigns)
      .set({ status: "archived" })
      .where(eq(outreachCampaigns.id, id));

    res.json({ ok: true });
  } catch (err) {
    logger.warn({ err }, "[Outreach] DELETE /campaigns/:id failed");
    res.status(500).json({ error: "Failed to archive campaign" });
  }
});

// ─── Pitches ──────────────────────────────────────────────────────────────────

router.get("/campaigns/:campaignId/pitches", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { campaignId } = req.params;

    // Verify ownership
    const [campaign] = await db
      .select()
      .from(outreachCampaigns)
      .where(
        and(
          eq(outreachCampaigns.id, campaignId),
          eq(outreachCampaigns.userId, userId),
        ),
      )
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const pitches = await db
      .select()
      .from(outreachPitches)
      .where(eq(outreachPitches.campaignId, campaignId))
      .orderBy(desc(outreachPitches.createdAt));

    res.json(pitches);
  } catch (err) {
    logger.warn({ err }, "[Outreach] GET /campaigns/:id/pitches failed");
    res.status(500).json({ error: "Failed to fetch pitches" });
  }
});

const createPitchSchema = z.object({
  recipientName: z.string().min(1).max(200),
  recipientEmail: z.string().email().max(320).optional(),
  recipientUrl: z.string().url().max(500).optional(),
  pitchBody: z.string().max(50_000).optional(),
  followUpAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

router.post("/campaigns/:campaignId/pitches", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { campaignId } = req.params;

    // Verify ownership
    const [campaign] = await db
      .select()
      .from(outreachCampaigns)
      .where(
        and(
          eq(outreachCampaigns.id, campaignId),
          eq(outreachCampaigns.userId, userId),
        ),
      )
      .limit(1);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const body = createPitchSchema.safeParse(req.body);
    if (!body.success)
      return res.status(400).json({ error: body.error.format() });

    const [pitch] = await db
      .insert(outreachPitches)
      .values({
        campaignId,
        userId,
        ...body.data,
        followUpAt: body.data.followUpAt
          ? new Date(body.data.followUpAt)
          : null,
      })
      .returning();

    // Increment campaign totalPitches
    await db
      .update(outreachCampaigns)
      .set({
        totalPitches: sql`${outreachCampaigns.totalPitches} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(outreachCampaigns.id, campaignId));

    res.status(201).json(pitch);
  } catch (err) {
    logger.warn({ err }, "[Outreach] POST /campaigns/:id/pitches failed");
    res.status(500).json({ error: "Failed to create pitch" });
  }
});

const VALID_STATUSES = [
  "draft",
  "sent",
  "opened",
  "replied",
  "added",
  "declined",
  "no_response",
] as const;

const updatePitchSchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  notes: z.string().max(2000).optional(),
  followUpAt: z.string().datetime().nullable().optional(),
  pitchBody: z.string().max(50_000).optional(),
});

router.patch("/pitches/:pitchId", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { pitchId } = req.params;

    const [existing] = await db
      .select()
      .from(outreachPitches)
      .where(
        and(eq(outreachPitches.id, pitchId), eq(outreachPitches.userId, userId)),
      )
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Pitch not found" });

    const body = updatePitchSchema.safeParse(req.body);
    if (!body.success)
      return res.status(400).json({ error: body.error.format() });

    const now = new Date();
    const updates: Record<string, unknown> = {
      updatedAt: now,
      ...(body.data.notes !== undefined && { notes: body.data.notes }),
      ...(body.data.pitchBody !== undefined && { pitchBody: body.data.pitchBody }),
      ...(body.data.followUpAt !== undefined && {
        followUpAt: body.data.followUpAt ? new Date(body.data.followUpAt) : null,
      }),
    };

    // Status transition timestamps
    if (body.data.status && body.data.status !== existing.status) {
      updates.status = body.data.status;
      if (body.data.status === "sent" && !existing.sentAt)
        updates.sentAt = now;
      if (body.data.status === "opened" && !existing.openedAt)
        updates.openedAt = now;
      if (body.data.status === "replied" && !existing.repliedAt)
        updates.repliedAt = now;
      if (
        (body.data.status === "added" || body.data.status === "declined") &&
        !existing.resolvedAt
      )
        updates.resolvedAt = now;

      // These are funnel counters, not counts of pitches currently in each
      // status. Increment only the first time the associated event is
      // recorded; moving a pitch back and forth must not inflate them.
      const counterForStatus: Record<
        string,
        { field: "openCount" | "replyCount" | "placementCount"; wasRecorded: boolean }
      > = {
        opened: { field: "openCount", wasRecorded: !!existing.openedAt },
        replied: { field: "replyCount", wasRecorded: !!existing.repliedAt },
        // resolvedAt is also set for a decline, so it cannot tell us whether
        // this pitch has previously produced a placement.
        added: { field: "placementCount", wasRecorded: false },
      };
      const counter = counterForStatus[body.data.status];
      if (counter && !counter.wasRecorded) {
        await db
          .update(outreachCampaigns)
          .set({
            [counter.field]: sql`${outreachCampaigns[counter.field]} + 1`,
            updatedAt: now,
          })
          .where(eq(outreachCampaigns.id, existing.campaignId));
      }
    }

    const [updated] = await db
      .update(outreachPitches)
      .set(updates)
      .where(eq(outreachPitches.id, pitchId))
      .returning();

    res.json(updated);
  } catch (err) {
    logger.warn({ err }, "[Outreach] PATCH /pitches/:id failed");
    res.status(500).json({ error: "Failed to update pitch" });
  }
});

// ─── AI Pitch Writer (uses awareness layer + MaxCore) ─────────────────────────

/**
 * POST /api/outreach/generate-pitch
 * Generate a personalised pitch body using the awareness layer for industry
 * context. This endpoint never substitutes a template for AI output: callers
 * get a clear unavailable response when the configured AI service cannot
 * generate a pitch.
 */
const generatePitchSchema = z.object({
  recipientName: z.string().min(1).max(200),
  recipientType: z.enum([
    "blog",
    "playlist",
    "sync_supervisor",
    "pr_outlet",
    "radio",
  ]),
  trackTitle: z.string().min(1).max(300),
  trackGenre: z.string().max(100).optional(),
  trackMood: z.string().max(100).optional(),
  artistName: z.string().max(200).optional(),
  artistBio: z.string().max(1000).optional(),
});

router.post("/generate-pitch", async (req, res) => {
  try {
    const body = generatePitchSchema.safeParse(req.body);
    if (!body.success)
      return res.status(400).json({ error: body.error.format() });

    const {
      recipientName,
      recipientType,
      trackTitle,
      trackGenre,
      trackMood,
      artistName,
      artistBio,
    } = body.data;

    const awareness = await getAwarenessContext("email");
    const prompt = [
      `Write a professional, personalized pitch email for a ${recipientType.replace("_", " ")}.`,
      `Recipient: ${recipientName}`,
      `Track: "${trackTitle}"`,
      trackGenre ? `Genre: ${trackGenre}` : "",
      trackMood ? `Mood: ${trackMood}` : "",
      artistName ? `Artist: ${artistName}` : "",
      artistBio ? `Bio: ${artistBio}` : "",
      "Keep it under 200 words. Professional, warm, specific. No generic filler.",
    ]
      .filter(Boolean)
      .join("\n");

    const generated = await MaxCoreAIClient.generate<{
      text?: string;
      content?: string;
      output?: string;
    }>("/generate/text", { ...awareness, prompt, maxTokens: 300 });
    const pitchBody =
      generated?.text ?? generated?.content ?? generated?.output ?? "";

    if (!pitchBody.trim()) {
      logger.warn("[Outreach] MaxCore did not return a pitch");
      return res.status(503).json({
        error:
          "AI pitch generation is temporarily unavailable. Please try again shortly.",
      });
    }

    res.json({ pitchBody, trendContextUsed: !!awareness?.contextString });
  } catch (err) {
    logger.warn({ err }, "[Outreach] POST /generate-pitch failed");
    res.status((err as { status?: number }).status === 503 ? 503 : 500).json({ error: "Failed to generate pitch" });
  }
});

// ─── Follow-up reminders (upcoming) ──────────────────────────────────────────

/**
 * GET /api/outreach/follow-ups
 * Returns pitches that are past their follow-up date and still open.
 */
router.get("/follow-ups", async (req, res) => {
  try {
    const userId = req.user!.id;
    const now = new Date();

    const overdue = await db
      .select()
      .from(outreachPitches)
      .where(
        and(
          eq(outreachPitches.userId, userId),
          sql`${outreachPitches.followUpAt} <= ${now}`,
          sql`${outreachPitches.status} IN ('sent', 'opened')`,
        ),
      )
      .orderBy(outreachPitches.followUpAt)
      .limit(50);

    res.json(overdue);
  } catch (err) {
    logger.warn({ err }, "[Outreach] GET /follow-ups failed");
    res.status(500).json({ error: "Failed to fetch follow-ups" });
  }
});

export default router;
