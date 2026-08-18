// @ts-nocheck
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { syncSubmissions, syncLicenseInquiries } from "@shared/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { z } from "zod";
import { parsePaginationParams } from "../middleware/pagination.js";

const router = Router();

const insertSyncSchema = z.object({
  trackTitle: z.string().min(1),
  artistName: z.string().min(1),
  genre: z.string().optional(),
  mood: z.string().optional(),
  bpm: z.number().optional(),
  duration: z.number().optional(),
  description: z.string().optional(),
  usageType: z.string().optional(),
  isExclusive: z.boolean().default(false),
  price: z.string().optional(),
  previewUrl: z.string().optional(),
  submissionTarget: z.string().optional(),
});

// GET /api/sync-licensing - list user's sync catalog (paginated)
router.get("/", requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const catalog = await db
      .select()
      .from(syncSubmissions)
      .where(eq(syncSubmissions.userId, req.user!.id))
      .orderBy(desc(syncSubmissions.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(catalog);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sync catalog" });
  }
});

// GET /api/sync-licensing/stats - aggregate stats via SQL (no full-table JS scan)
router.get("/stats", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const [stats] = await db
      .select({
        totalTracks: count(),
        licensedCount: sql<number>`count(*) filter (where status = 'licensed')`,
        pendingCount: sql<number>`count(*) filter (where status in ('under_review', 'submitted'))`,
        revenue: sql<number>`coalesce(sum(license_fee), 0)`,
      })
      .from(syncSubmissions)
      .where(eq(syncSubmissions.userId, userId));

    res.json({
      totalTracks: Number(stats?.totalTracks),
      licensedCount: Number(stats?.licensedCount),
      pendingCount: Number(stats?.pendingCount),
      revenue: Number(stats?.revenue),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sync stats" });
  }
});

// GET /api/sync-licensing/:id - get single listing
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(syncSubmissions)
      .where(
        and(
          eq(syncSubmissions.id, (req.params.id as string)),
          eq(syncSubmissions.userId, req.user!.id),
        ),
      )
      .limit(1);
    if (!item) return res.status(404).json({ error: "Listing not found" });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch listing" });
  }
});

// POST /api/sync-licensing - add track to sync catalog
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = insertSyncSchema?.parse(req.body);
    const [submission] = await db
      .insert(syncSubmissions)
      .values({
        ...data,
        userId,
        status: "available",
      })
      .returning();
    res.status(201).json(submission);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: error.issues });
    }
    res.status(500).json({ error: "Failed to add to sync catalog" });
  }
});

// PUT /api/sync-licensing/:id - update listing
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;
    const data = insertSyncSchema?.partial().parse(req.body);
    const [updated] = await db
      .update(syncSubmissions)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(syncSubmissions.id, id), eq(syncSubmissions.userId, userId)),
      )
      .returning();
    if (!updated) return res.status(404).json({ error: "Listing not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: error.issues });
    }
    res.status(500).json({ error: "Failed to update listing" });
  }
});

// PATCH /api/sync-licensing/:id/status - update license status and optional deal terms
router.patch("/:id/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;
    const statusSchema = z.object({
      status: z.enum([
        "available",
        "under_review",
        "negotiating",
        "licensed",
        "rejected",
        "withdrawn",
      ]),
      licensedTo: z.string().max(200).optional(),
      licenseFee: z.number().min(0).optional(),
    });
    const { status, licensedTo, licenseFee } = statusSchema?.parse(req.body);

    const setFields: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };
    if (licensedTo !== undefined) setFields.licensedTo = licensedTo;
    if (licenseFee !== undefined) setFields.licenseFee = licenseFee;
    if (status === "licensed") setFields.licensedAt = new Date();

    const [updated] = await db
      .update(syncSubmissions)
      .set(setFields)
      .where(
        and(eq(syncSubmissions.id, id), eq(syncSubmissions.userId, userId)),
      )
      .returning();

    if (!updated) return res.status(404).json({ error: "Listing not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: error.issues });
    }
    res.status(500).json({ error: "Failed to update license status" });
  }
});

// DELETE /api/sync-licensing/:id - remove from catalog
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;
    const [deleted] = await db
      .delete(syncSubmissions)
      .where(
        and(eq(syncSubmissions.id, id), eq(syncSubmissions.userId, userId)),
      )
      .returning();
    if (!deleted) return res.status(404).json({ error: "Listing not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove from catalog" });
  }
});

export default router;

// ── Music Supervisor Inbox ────────────────────────────────────────────────────
//
// These routes are NOT requireAuth-gated on the public browse+inquiry endpoints
// (supervisors browse anonymously), but owner endpoints ARE auth-gated.

// Public: GET /api/sync-licensing/supervisor/browse
// Browse available sync catalog — filterable by mood, tempo, BPM, key, genre,
// hasVocals. Used by music supervisors landing on the platform.
router.get("/supervisor/browse", async (req, res) => {
  try {
    const { limit = "20", offset = "0", genre, mood, bpm } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof eq>[] = [
      eq(syncSubmissions.status, "active"),
    ];
    if (genre) conditions.push(eq(syncSubmissions.genre, genre));
    if (mood) conditions.push(eq(syncSubmissions.mood, mood));

    const rows = await db
      .select({
        id: syncSubmissions.id,
        trackTitle: syncSubmissions.trackTitle,
        artistName: syncSubmissions.artistName,
        genre: syncSubmissions.genre,
        mood: syncSubmissions.mood,
        bpm: syncSubmissions.bpm,
        duration: syncSubmissions.duration,
        isExclusive: syncSubmissions.isExclusive,
        previewUrl: syncSubmissions.previewUrl,
        price: syncSubmissions.price,
      })
      .from(syncSubmissions)
      .where(and(...conditions))
      .orderBy(desc(syncSubmissions.createdAt))
      .limit(Math.min(100, parseInt(limit, 10) || 20))
      .offset(Math.max(0, parseInt(offset, 10) || 0));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to browse sync catalog" });
  }
});

// Public: POST /api/sync-licensing/:syncId/inquire
// Music supervisor submits an inquiry / quote request for a specific track.
const inquirySchema = z.object({
  inquirerName: z.string().min(1).max(200),
  inquirerEmail: z.string().email().max(320),
  inquirerCompany: z.string().max(200).optional(),
  projectType: z
    .enum(["film", "tv", "ad", "game", "podcast", "trailer", "other"])
    .optional(),
  projectDescription: z.string().max(2000).optional(),
  proposedUsage: z.string().max(500).optional(),
  proposedFee: z.number().min(0).optional(),
  proposedTerritory: z.string().max(200).optional(),
  proposedDuration: z.string().max(100).optional(),
});

router.post("/:syncId/inquire", async (req, res) => {
  try {
    const { syncId } = req.params as Record<string, string>;

    const [listing] = await db
      .select({ id: syncSubmissions.id, userId: syncSubmissions.userId })
      .from(syncSubmissions)
      .where(
        and(
          eq(syncSubmissions.id, syncId),
          eq(syncSubmissions.status, "active"),
        ),
      )
      .limit(1);

    if (!listing)
      return res.status(404).json({ error: "Track not found or unavailable" });

    const body = inquirySchema.safeParse(req.body);
    if (!body.success)
      return res.status(400).json({ error: body.error.format() });

    const [inquiry] = await db
      .insert(syncLicenseInquiries)
      .values({
        syncLicenseId: syncId,
        userId: listing.userId,
        ...body.data,
        status: "pending",
      })
      .returning();

    res.status(201).json({ ok: true, inquiryId: inquiry.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit inquiry" });
  }
});

// Auth: GET /api/sync-licensing/inquiries
// Track owner views their supervisor inbox.
router.get("/inquiries", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(100, parseInt(String(req.query.limit ?? "20"), 10));

    const rows = await db
      .select()
      .from(syncLicenseInquiries)
      .where(eq(syncLicenseInquiries.userId, userId))
      .orderBy(desc(syncLicenseInquiries.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch inquiries" });
  }
});

// Auth: PATCH /api/sync-licensing/inquiries/:inquiryId
// Artist responds to inquiry (approve / decline / counter-offer).
router.patch("/inquiries/:inquiryId", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { inquiryId } = req.params as Record<string, string>;

    const [existing] = await db
      .select()
      .from(syncLicenseInquiries)
      .where(
        and(
          eq(syncLicenseInquiries.id, inquiryId),
          eq(syncLicenseInquiries.userId, userId),
        ),
      )
      .limit(1);

    if (!existing)
      return res.status(404).json({ error: "Inquiry not found" });

    const updateSchema = z.object({
      status: z.enum(["pending", "approved", "declined", "negotiating"]),
      responseNotes: z.string().max(5000).optional(),
    });

    const body = updateSchema.safeParse(req.body);
    if (!body.success)
      return res.status(400).json({ error: body.error.format() });

    const [updated] = await db
      .update(syncLicenseInquiries)
      .set({
        status: body.data.status,
        responseNotes: body.data.responseNotes ?? null,
        respondedAt: new Date(),
      })
      .where(eq(syncLicenseInquiries.id, inquiryId))
      .returning();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update inquiry" });
  }
});

// Auth: POST /api/sync-licensing/:syncId/generate-license
// One-click parameterized license PDF stub — returns structured license text
// that the client can render as PDF (e.g. via jsPDF or html-to-pdf).
router.post("/:syncId/generate-license", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { syncId } = req.params as Record<string, string>;

    const [listing] = await db
      .select()
      .from(syncSubmissions)
      .where(
        and(
          eq(syncSubmissions.id, syncId),
          eq(syncSubmissions.userId, userId),
        ),
      )
      .limit(1);

    if (!listing)
      return res.status(404).json({ error: "Track not found" });

    const licenseSchema = z.object({
      licenseeCompany: z.string().min(1).max(300),
      licenseeEmail: z.string().email().max(320),
      projectType: z
        .enum(["film", "tv", "ad", "game", "podcast", "trailer", "other"])
        .default("other"),
      territory: z.string().max(200).default("Worldwide"),
      term: z.string().max(200).default("In perpetuity"),
      exclusive: z.boolean().default(false),
      feeCents: z.number().int().min(0).default(0),
      currency: z.string().length(3).default("usd"),
    });

    const body = licenseSchema.safeParse(req.body);
    if (!body.success)
      return res.status(400).json({ error: body.error.format() });

    const {
      licenseeCompany,
      licenseeEmail,
      projectType,
      territory,
      term,
      exclusive,
      feeCents,
      currency,
    } = body.data;

    const now = new Date();
    const licenseText = [
      "SYNC LICENSE AGREEMENT",
      "======================",
      `Date: ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      "",
      `LICENSOR: ${listing.artistName} (ID: ${userId})`,
      `LICENSEE: ${licenseeCompany} (${licenseeEmail})`,
      "",
      `TRACK: "${listing.trackTitle}"`,
      listing.genre ? `Genre: ${listing.genre}` : "",
      listing.bpm ? `BPM: ${listing.bpm}` : "",
      "",
      `PROJECT TYPE: ${projectType}`,
      `TERRITORY: ${territory}`,
      `TERM: ${term}`,
      `EXCLUSIVITY: ${exclusive ? "Exclusive" : "Non-exclusive"}`,
      `FEE: ${currency.toUpperCase()} ${(feeCents / 100).toFixed(2)}`,
      "",
      "GRANT OF RIGHTS",
      "The Licensor hereby grants the Licensee a limited, non-transferable",
      `license to synchronize the Track with the above project type in`,
      `the specified territory for the specified term.`,
      "",
      "This license does not transfer ownership of the master recording or",
      "composition. The Licensor retains all underlying rights.",
      "",
      "SIGNATURES",
      `Licensor: ___________________________  Date: ________________`,
      `Licensee: ___________________________  Date: ________________`,
    ]
      .filter((l) => l !== null)
      .join("\n");

    res.json({
      licenseText,
      metadata: {
        trackTitle: listing.trackTitle,
        artistName: listing.artistName,
        licenseeCompany,
        projectType,
        territory,
        term,
        exclusive,
        feeCents,
        currency,
        generatedAt: now.toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate license" });
  }
});
