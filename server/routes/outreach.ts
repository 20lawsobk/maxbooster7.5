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

      // Update campaign counters
      if (body.data.status === "opened") {
        await db
          .update(outreachCampaigns)
          .set({
            openCount: sql`${outreachCampaigns.openCount} + 1`,
            updatedAt: now,
          })
          .where(eq(outreachCampaigns.id, existing.campaignId));
      }
      if (body.data.status === "replied") {
        await db
          .update(outreachCampaigns)
          .set({
            replyCount: sql`${outreachCampaigns.replyCount} + 1`,
            updatedAt: now,
          })
          .where(eq(outreachCampaigns.id, existing.campaignId));
      }
      if (body.data.status === "added") {
        await db
          .update(outreachCampaigns)
          .set({
            placementCount: sql`${outreachCampaigns.placementCount} + 1`,
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
 * context. Falls back to a template-based pitch if MaxCore is unavailable.
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

    // Load awareness context for industry-relevant hooks
    let trendContext = "";
    try {
      const candidates = [
        "../services/contentAwarenessService.js",
        "../../awareness layer/ContentGenerationAwarenessService.js",
        "../awareness layer/ContentGenerationAwarenessService.js",
      ];
      for (const p of candidates) {
        try {
          // @ts-ignore
          const mod = await import(p);
          const svc =
            mod?.contentAwarenessService ??
            mod?.default?.contentAwarenessService ??
            mod?.default;
          if (svc && typeof svc.getContextForMode === "function") {
            const ctx = await Promise.race([
              svc.getContextForMode("content"),
              new Promise<null>((r) => setTimeout(() => r(null), 3000)),
            ]);
            if (ctx?.contextString) {
              trendContext = ctx.contextString.slice(0, 400);
            }
            break;
          }
        } catch {
          // try next
        }
      }
    } catch {
      // non-fatal
    }

    // Attempt MaxCore generation
    const MAXCORE_URL = process.env.MAXCORE_URL ?? "http://localhost:8090";
    let pitchBody = "";

    try {
      const prompt = [
        `Write a professional, personalized pitch email for a ${recipientType.replace("_", " ")}.`,
        `Recipient: ${recipientName}`,
        `Track: "${trackTitle}"`,
        trackGenre ? `Genre: ${trackGenre}` : "",
        trackMood ? `Mood: ${trackMood}` : "",
        artistName ? `Artist: ${artistName}` : "",
        artistBio ? `Bio: ${artistBio}` : "",
        trendContext
          ? `Current industry context (use naturally, do not quote verbatim): ${trendContext}`
          : "",
        "Keep it under 200 words. Professional, warm, specific. No generic filler.",
      ]
        .filter(Boolean)
        .join("\n");

      const mcRes = await fetch(`${MAXCORE_URL}/generate/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, maxTokens: 300 }),
        signal: AbortSignal.timeout(8000),
      });

      if (mcRes.ok) {
        const mc = await mcRes.json();
        pitchBody = mc.text ?? mc.content ?? mc.output ?? "";
      }
    } catch {
      // MaxCore unavailable — use template fallback
    }

    if (!pitchBody) {
      // Template fallback
      const recipientLabel = {
        blog: "blog editorial team",
        playlist: "playlist curator",
        sync_supervisor: "music supervisor",
        pr_outlet: "press team",
        radio: "music director",
      }[recipientType];

      pitchBody = [
        `Hi ${recipientName},`,
        "",
        `I wanted to reach out because I think my latest track "${trackTitle}" would resonate strongly with your audience${trackGenre ? ` — it's a ${trackGenre} piece` : ""}${trackMood ? ` with a ${trackMood} feel` : ""}.`,
        "",
        artistBio
          ? `${artistBio}`
          : `I'm ${artistName ?? "an independent artist"} focused on delivering quality music that connects.`,
        "",
        `I'd love for you to give it a listen. I've attached the press kit and would be happy to send a direct link to the master stems or any assets you need.`,
        "",
        `Thank you for your time — I appreciate everything you do for the music community.`,
        "",
        `Best,`,
        `${artistName ?? "[Your Name]"}`,
      ].join("\n");
    }

    res.json({ pitchBody, trendContextUsed: !!trendContext });
  } catch (err) {
    logger.warn({ err }, "[Outreach] POST /generate-pitch failed");
    res.status(500).json({ error: "Failed to generate pitch" });
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
