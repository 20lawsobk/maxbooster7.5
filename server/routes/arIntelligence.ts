// @ts-nocheck
/**
 * A&R Intelligence API
 *
 * Uses the ContentGenerationAwarenessService (live music industry RSS + search
 * intelligence) to deliver three types of insight:
 *
 *   GET /api/ar-intelligence/trend-forecast
 *     → Rising BPMs, keys, and genres from live industry signals
 *
 *   GET /api/ar-intelligence/catalog-gap
 *     → Compares the user's beat catalog against live detected genres
 *
 *   GET /api/ar-intelligence/release-timing
 *     → Returns unavailable until audience-performance data is connected
 *
 * Endpoints must not present static suggestions as live intelligence. When a
 * requested capability lacks a data source, they report that honestly.
 */

import { Router } from "express";
import { db } from "../db.js";
import { beats } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { requirePremium } from "../middleware/requirePremium.js";
import { logger } from "../logger.js";

const router = Router();
router.use(requireAuth, requirePremium);

// ─── Awareness layer loader (same pattern as maxcoreProxy) ────────────────────

async function getAwarenessContext(mode: string) {
  const candidates = [
    "../services/contentAwarenessService.js",
    "../../awareness layer/ContentGenerationAwarenessService.js",
    "../awareness layer/ContentGenerationAwarenessService.js",
  ];
  for (const p of candidates) {
    try {
      // @ts-ignore dynamic import
      const mod = await import(p);
      const svc =
        mod?.contentAwarenessService ??
        mod?.default?.contentAwarenessService ??
        mod?.default;
      if (svc && typeof svc.getContextForMode === "function") {
        return await Promise.race([
          svc.getContextForMode(mode),
          new Promise<null>((r) => setTimeout(() => r(null), 3000)),
        ]);
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

// ─── Trend Forecast ──────────────────────────────────────────────────────────

/**
 * GET /api/ar-intelligence/trend-forecast
 *
 * This capability requires stored performance data and is unavailable until
 * that source is connected.
 */
router.get("/trend-forecast", (_req, res) => {
  // The awareness layer does not supply performance data from which a forecast
  // can be calculated. Returning fixed genre/BPM/key suggestions previously
  // made this endpoint look data-backed when it was not.
  res.status(501).json({
    error: "Trend forecasting is not yet available",
    detail:
      "No stored performance-data source is currently configured for this forecast.",
  });
});

// ─── Catalog Gap Analysis ─────────────────────────────────────────────────────

/**
 * GET /api/ar-intelligence/catalog-gap
 *
 * Compares the authenticated user's beat catalog (genres, BPMs, keys) against
 * genres detected by the live awareness layer and returns uncovered genres.
 */
router.get("/catalog-gap", async (req, res) => {
  try {
    const userId = req.user!.id;

    // Fetch user's catalog
    const catalog = await db
      .select({
        genre: beats.genre,
        bpm: beats.bpm,
        key: beats.key,
        tags: beats.tags,
        plays: beats.plays,
        downloads: beats.downloads,
      })
      .from(beats)
      .where(and(eq(beats.userId, userId), eq(beats.isPublished, true)));

    // Genre frequency map from catalog
    const catalogGenres: Record<string, number> = {};
    for (const b of catalog) {
      const g = (b.genre ?? "Unknown").toLowerCase().trim();
      catalogGenres[g] = (catalogGenres[g] ?? 0) + 1;
    }

    // Only compare a catalog with genres actually detected by the live
    // awareness layer. Fixed "high-demand" genres would make this look like
    // a live analysis when the feed is unavailable.
    const ctx = await getAwarenessContext("music");
    const liveGenres = Array.isArray(ctx?.trendingGenres)
      ? ctx.trendingGenres
      : [];
    const trendingGenres = [...new Set(
      liveGenres
        .filter((genre) => typeof genre === "string")
        .map((genre) => genre.toLowerCase().trim())
        .filter(Boolean),
    )];

    if (trendingGenres.length === 0) {
      res.status(503).json({
        error: "Live trend data is currently unavailable",
        detail:
          "Catalog gaps are shown only when the live industry feed returns detected genres.",
      });
      return;
    }

    // A gap is a genre detected in the live feed that the user has not yet
    // covered. The feed provides no defensible demand volume, so this endpoint
    // intentionally does not manufacture demand or opportunity scores.
    const gaps = trendingGenres
      .map((genre) => {
        const catalogCount = catalogGenres[genre] ?? 0;
        return { genre, catalogCount };
      })
      .filter((g) => g.catalogCount === 0)
      .slice(0, 10);

    // Catalog summary
    const avgBpm =
      catalog.length > 0
        ? Math.round(
            catalog.reduce((s, b) => s + (b.bpm ?? 0), 0) / (catalog.length || 1),
          )
        : 0;

    const topGenre =
      Object.entries(catalogGenres).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "N/A";

    res.json({
      catalog: {
        totalBeats: catalog.length,
        genreBreakdown: Object.entries(catalogGenres)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([genre, count]) => ({ genre, count })),
        avgBpm,
        topGenre,
      },
      gaps,
      message:
        gaps.length > 0
          ? `${gaps.length} genre${gaps.length > 1 ? "s are" : " is"} appearing in the live industry feed but not yet in your published catalog.`
          : "Your published catalog covers every genre detected in the live industry feed.",
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ err }, "[ARIntelligence] /catalog-gap failed");
    res.status(500).json({ error: "Failed to compute catalog gap" });
  }
});

// ─── Release Timing Optimizer ─────────────────────────────────────────────────

/**
 * GET /api/ar-intelligence/release-timing
 *
 * This capability requires creator audience and release-performance data and
 * is unavailable until that source is connected.
 */
router.get("/release-timing", (_req, res) => {
  // The awareness feed has industry topics, not this creator's audience and
  // release-performance history. Do not represent static best-practice times
  // as a personalized optimizer.
  res.status(501).json({
    error: "Release timing optimization is not yet available",
    detail:
      "Audience engagement and release-performance data must be connected before personalized timing recommendations can be calculated.",
  });
});

export default router;
