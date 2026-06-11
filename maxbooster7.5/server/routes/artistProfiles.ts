import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { artistProfileService } from "../services/artistProfileService.js";
import type { ClaimState } from "../services/artistProfileService.js";
import { CLAIM_STATES } from "../services/artistProfileService.js";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { requireUUIDParam } from "../middleware/requestValidation.js";
import { labelGridService } from "../services/labelgrid-service.js";
import { storage } from "../storage.js";

const router = Router();

const createProfileSchema = z.object({
  artistName: z.string().min(1).max(255),
  isNewArtist: z.boolean().default(true),
  spotifyArtistId: z.string().max(255).optional(),
  spotifyArtistUri: z.string().max(255).optional(),
  appleArtistId: z.string().max(255).optional(),
  youtubeChannelId: z.string().max(255).optional(),
  tidalArtistId: z.string().max(255).optional(),
  deezerArtistId: z.string().max(255).optional(),
  soundcloudArtistId: z.string().max(255).optional(),
  amazonMusicArtistId: z.string().max(255).optional(),
  profileImageUrl: z.string().url().max(500).optional(),
  genres: z.array(z.string()).max(10).optional(),
});

const fixerSchema = z.object({
  targetSpotifyUri: z.string().regex(/^spotify:artist:[A-Za-z0-9]+$/, {
    message: "Must be a valid Spotify artist URI (spotify:artist:<ID>)",
  }),
  notes: z.string().max(1000).optional().default(""),
});

router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  try {
    const profiles = await artistProfileService.getUserProfiles(req.user!.id);
    res.json({ profiles });
  } catch (err) {
    logger.warn({ err: err }, "[ArtistProfiles] GET / error:");
    res.status(500).json({ error: "Failed to fetch artist profiles" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const { spotifyArtistUri, spotifyArtistId, ...rest } = parsed.data;

    let resolvedSpotifyId = spotifyArtistId;
    let resolvedSpotifyUri = spotifyArtistUri;

    if (spotifyArtistUri && !spotifyArtistId) {
      resolvedSpotifyId = spotifyArtistUri.startsWith("spotify:artist:")
        ? spotifyArtistUri.replace("spotify:artist:", "")
        : spotifyArtistUri;
    } else if (spotifyArtistId && !spotifyArtistUri) {
      resolvedSpotifyUri = `spotify:artist:${spotifyArtistId}`;
    }

    const profile = await artistProfileService.createProfile({
      userId: req.user!.id,
      ...rest,
      spotifyArtistId: resolvedSpotifyId,
      spotifyArtistUri: resolvedSpotifyUri,
    });

    res.status(201).json({ profile });
  } catch (err) {
    const cause = err?.cause;
    const causeMsg: string =
      cause?.message ?? (typeof cause === "string" ? cause : "") ?? "";
    logger.warn(
      "[ArtistProfiles] POST / error:",
      err,
      cause ? { cause: causeMsg } : {},
    );

    if (
      causeMsg.includes("project size limit") ||
      causeMsg.includes("storage limit") ||
      causeMsg.includes("could not extend file")
    ) {
      return res.status(507).json({
        error: "Database storage limit reached",
        message:
          "Your Neon database has reached its 512 MB free-tier limit and cannot accept new records. Please visit console.neon.tech to upgrade your plan or free up storage before creating artist profiles.",
        code: "DB_STORAGE_LIMIT",
      });
    }

    res.status(500).json({ error: "Failed to create artist profile" });
  }
});

router.get("/search", async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query || query.length < 2) {
      return res
        .status(400)
        .json({ error: "Search query must be at least 2 characters" });
    }
    if (query.length > 100) {
      return res.status(400).json({ error: "Search query too long" });
    }

    const platform = String(req.query.platform || "all");
    const validPlatforms = ["all", "spotify", "apple", "deezer"];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({
        error: `Invalid platform. Valid options: ${validPlatforms.join(", ")}`,
      });
    }

    let results;
    if (platform === "spotify") {
      results = {
        spotify: await artistProfileService.searchSpotifyArtists(query),
        apple: [],
        deezer: [],
      };
    } else if (platform === "apple") {
      results = {
        spotify: [],
        apple: await artistProfileService.searchAppleArtists(query),
        deezer: [],
      };
    } else if (platform === "deezer") {
      results = {
        spotify: [],
        apple: [],
        deezer: await artistProfileService.searchDeezerArtists(query),
      };
    } else {
      results = await artistProfileService.searchAllPlatforms(query);
    }

    res.json({ query, platform, results });
  } catch (err) {
    logger.warn({ err: err }, "[ArtistProfiles] GET /search error:");
    res.status(500).json({ error: "Artist search failed" });
  }
});

router.get("/by-release/:releaseId", async (req: Request, res: Response) => {
  try {
    const { releaseId } = req.params;
    const profiles = await artistProfileService.getProfilesByRelease(releaseId);
    res.json({ profiles });
  } catch (err) {
    logger.warn({ err: err }, "[ArtistProfiles] GET /by-release error:");
    res.status(500).json({ error: "Failed to fetch profiles for release" });
  }
});

router.get(
  "/:id",
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const profile = await artistProfileService.getProfile(
        req.params.id,
        req.user!.id,
      );
      if (!profile)
        return res.status(404).json({ error: "Artist profile not found" });
      res.json({ profile });
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfiles] GET /:id error:");
      res.status(500).json({ error: "Failed to fetch artist profile" });
    }
  },
);

router.patch(
  "/:id",
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const parsed = createProfileSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const profile = await artistProfileService.updateProfile(
        req.params.id,
        req.user!.id,
        parsed.data,
      );
      if (!profile)
        return res.status(404).json({ error: "Artist profile not found" });
      res.json({ profile });
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfiles] PATCH /:id error:");
      res.status(500).json({ error: "Failed to update artist profile" });
    }
  },
);

router.delete(
  "/:id",
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const deleted = await artistProfileService.deleteProfile(
        req.params.id,
        req.user!.id,
      );
      if (!deleted)
        return res.status(404).json({ error: "Artist profile not found" });
      res.json({ success: true });
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfiles] DELETE /:id error:");
      res.status(500).json({ error: "Failed to delete artist profile" });
    }
  },
);

router.post(
  "/:id/fixer",
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const parsed = fixerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      const profile = await artistProfileService.submitFixerRequest(
        req.params.id,
        req.user!.id,
        parsed.data.targetSpotifyUri,
        parsed.data.notes,
      );

      if (!profile)
        return res.status(404).json({ error: "Artist profile not found" });
      res.json({
        profile,
        message:
          "Fixer request submitted. Re-mapping will be applied to future releases.",
      });
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfiles] POST /:id/fixer error:");
      if (err.message?.includes("Invalid Spotify artist URI")) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: "Failed to submit fixer request" });
    }
  },
);

router.get(
  "/:id/profile-hub",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const result = await artistProfileService.profileHub(
        req.params.id,
        req.user!.id,
      );
      res.json(result);
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfiles] GET /:id/profile-hub error:");
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Profile hub failed" });
    }
  },
);

router.post(
  "/:id/auto-discover",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      // Optional UPC from DistroKid / distributor — bypasses name-search for exact platform IDs
      const upc =
        typeof req.body?.upc === "string"
          ? req.body.upc.replace(/[^0-9]/g, "")
          : undefined;
      const result = await artistProfileService.autoDiscover(
        req.params.id,
        req.user!.id,
        upc || undefined,
      );
      res.json(result);
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] POST /:id/auto-discover error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Auto-discover failed" });
    }
  },
);

router.post(
  "/:id/auto-sync",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const result = await artistProfileService.autoSync(
        req.params.id,
        req.user!.id,
      );
      res.json(result);
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfiles] POST /:id/auto-sync error:");
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Auto-sync failed" });
    }
  },
);

router.post(
  "/:id/link-release/:releaseId",
  requireUUIDParam("id"),
  requireUUIDParam("releaseId"),
  async (req: Request, res: Response) => {
    try {
      const profile = await artistProfileService.getProfile(
        req.params.id,
        req.user!.id,
      );
      if (!profile)
        return res.status(404).json({ error: "Artist profile not found" });

      await artistProfileService.linkProfileToRelease(
        req.params.id,
        req.params.releaseId,
      );
      res.json({ success: true });
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] POST /:id/link-release error:",
      );
      res
        .status(500)
        .json({ error: "Failed to link release to artist profile" });
    }
  },
);

router.post(
  "/:id/verify",
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const profile = await artistProfileService.getProfile(
        req.params.id,
        req.user!.id,
      );
      if (!profile)
        return res.status(404).json({ error: "Artist profile not found" });
      if (!profile.spotifyArtistId) {
        return res
          .status(400)
          .json({ error: "No Spotify artist ID to verify" });
      }

      const spotifyData = await artistProfileService.verifySpotifyArtist(
        profile.spotifyArtistId,
      );
      if (!spotifyData) {
        return res.status(422).json({
          error:
            "Spotify artist ID could not be verified. Check that the ID is correct.",
        });
      }

      const verified = await artistProfileService.updateProfile(
        req.params.id,
        req.user!.id,
        {
          isVerified: true,
          verifiedAt: new Date(),
          verifiedPlatforms: ["spotify"],
          profileImageUrl:
            spotifyData.imageUrl ?? profile.profileImageUrl ?? undefined,
          genres:
            spotifyData.genres.length > 0
              ? spotifyData.genres
              : (profile.genres ?? undefined),
        },
      );

      res.json({ profile: verified, spotifyData });
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfiles] POST /:id/verify error:");
      res.status(500).json({ error: "Verification failed" });
    }
  },
);

// ── Phase 1: ISRC Chain Discovery ─────────────────────────────────────────────
router.post(
  "/:id/isrc-discover",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const result = await artistProfileService.isrcChainDiscover(
        req.params.id,
        req.user!.id,
      );
      res.json(result);
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] POST /:id/isrc-discover error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "ISRC chain discovery failed" });
    }
  },
);

// ── Phase 1: Split Profile Scanner ────────────────────────────────────────────
router.post(
  "/:id/scan-splits",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const result = await artistProfileService.scanForSplitProfiles(
        req.params.id,
        req.user!.id,
      );
      res.json(result);
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] POST /:id/scan-splits error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Split profile scan failed" });
    }
  },
);

// ── Phase 1: Claim Pipeline — Get full pipeline state ────────────────────────
router.get(
  "/:id/claim-pipeline",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const result = await artistProfileService.getClaimPipeline(
        req.params.id,
        req.user!.id,
      );
      res.json(result);
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] GET /:id/claim-pipeline error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Failed to get claim pipeline" });
    }
  },
);

// ── Phase 1: Claim Pipeline — Update state for a platform ────────────────────
const claimStateSchema = z.object({
  platform: z.string().min(1).max(80),
  state: z.enum(CLAIM_STATES),
  notes: z.string().max(1000).optional(),
  triggeredBy: z.enum(["user", "system"]).optional().default("user"),
});

router.patch(
  "/:id/claim-state",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const parsed = claimStateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }
      const { platform, state, notes, triggeredBy } = parsed.data;
      const result = await artistProfileService.updateClaimState(
        req.params.id,
        req.user!.id,
        platform,
        state as ClaimState,
        triggeredBy as "user" | "system",
        notes,
      );
      res.json({ pipelineRow: result });
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] PATCH /:id/claim-state error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Failed to update claim state" });
    }
  },
);

// ── Phase 2: Profile Health Score ─────────────────────────────────────────────
router.get(
  "/:id/health",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const result = await artistProfileService.calculateHealthScore(
        req.params.id,
        req.user!.id,
      );
      res.json(result);
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfiles] GET /:id/health error:");
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Health score calculation failed" });
    }
  },
);

// ── Phase 2: Artist Identity Graph ─────────────────────────────────────────────
router.get(
  "/:id/identity-graph",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const result = await artistProfileService.getIdentityGraph(
        req.params.id,
        req.user!.id,
      );
      res.json(result);
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] GET /:id/identity-graph error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Failed to get identity graph" });
    }
  },
);

// ── Phase 3: DNA Snapshot ──────────────────────────────────────────────────────
router.post(
  "/:id/dna-snapshot",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const { releaseId, upc, isrcs } = req.body ?? {};
      const snapshot = await artistProfileService.snapshotArtistDNA(
        req.params.id,
        req.user!.id,
        releaseId,
        upc,
        Array.isArray(isrcs) ? isrcs : undefined,
      );
      res.json({ snapshot });
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] POST /:id/dna-snapshot error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "DNA snapshot failed" });
    }
  },
);

router.get(
  "/:id/dna-snapshots",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const snapshots = await artistProfileService.getDnaSnapshots(
        req.params.id,
        req.user!.id,
      );
      res.json({ snapshots });
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] GET /:id/dna-snapshots error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Failed to fetch DNA snapshots" });
    }
  },
);

// ── Phase 3: Multi-platform Fixer ─────────────────────────────────────────────
const multiFixerSchema = z.object({
  targetPlatformIds: z
    .record(z.string(), z.string())
    .refine((obj) => Object.keys(obj).length > 0, {
      message: "At least one platform target required",
    }),
  notes: z.string().max(1000).optional(),
});

router.post(
  "/:id/fixer-multi",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const parsed = multiFixerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }
      const profile = await artistProfileService.submitMultiPlatformFixer(
        req.params.id,
        req.user!.id,
        parsed.data.targetPlatformIds,
        parsed.data.notes,
      );
      if (!profile)
        return res.status(404).json({ error: "Artist profile not found" });
      res.json({
        profile,
        message:
          "Multi-platform fixer submitted. Re-mapping will apply to future releases.",
      });
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] POST /:id/fixer-multi error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      if (err.message?.includes("Invalid Spotify"))
        return res.status(400).json({ error: err.message });
      res.status(500).json({ error: "Multi-platform fixer failed" });
    }
  },
);

// ── Phase 2: Cross-distributor History Import ──────────────────────────────────
const importHistorySchema = z.object({
  sourceDistributor: z.string().min(1).max(100),
  isrcList: z.array(z.string()).max(200).default([]),
  upcList: z.array(z.string()).max(200).default([]),
});

router.post(
  "/:id/import-history",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const parsed = importHistorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }
      const result = await artistProfileService.importDistributorHistory(
        req.params.id,
        req.user!.id,
        parsed.data.sourceDistributor,
        parsed.data.isrcList,
        parsed.data.upcList,
      );
      res.json(result);
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] POST /:id/import-history error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "History import failed" });
    }
  },
);

// ── Phase 3: Distributor Portability Report ────────────────────────────────────
router.get(
  "/:id/portability-report",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const report = await artistProfileService.exportPortabilityReport(
        req.params.id,
        req.user!.id,
      );
      res.json(report);
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] GET /:id/portability-report error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Portability report generation failed" });
    }
  },
);

// ── Phase 3: Social Handle → DSP Bridging ─────────────────────────────────────
const resolveHandleSchema = z.object({
  platform: z.enum([
    "instagram",
    "tiktok",
    "twitter",
    "youtube",
    "soundcloud",
    "bandcamp",
  ]),
  handle: z.string().min(1).max(100),
});

router.post(
  "/:id/resolve-handle",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const parsed = resolveHandleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }
      const result = await artistProfileService.resolveHandleToDSP(
        req.params.id,
        req.user!.id,
        parsed.data.platform,
        parsed.data.handle,
      );
      res.json(result);
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfiles] POST /:id/resolve-handle error:",
      );
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Handle resolution failed" });
    }
  },
);

// ── Phase 1: Profile Watch ─────────────────────────────────────────────────────
router.post(
  "/:id/watch",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const result =
        await artistProfileService.watchProfileForUnauthorizedReleases(
          req.params.id,
          req.user!.id,
        );
      res.json(result);
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfiles] POST /:id/watch error:");
      if (err.message === "Artist profile not found")
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: "Profile watch failed" });
    }
  },
);

// ── Catalog Scanner: fetch collected releases from LabelGrid ───────────────────
// Returns the artist's LabelGrid catalog, cross-referenced against locally
// stored distro releases so the UI knows which ones are already distributed.
router.get(
  "/:id/catalog",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const profile = await artistProfileService.getProfile(
        req.params.id,
        req.user!.id,
      );
      if (!profile)
        return res.status(404).json({ error: "Artist profile not found" });

      // Fetch LabelGrid catalog and local releases in parallel
      const [lgReleases, localReleases] = await Promise.all([
        labelGridService.getUserCatalog(),
        storage.getDistroReleasesByArtist(req.user!.id),
      ]);

      // Build a set of UPCs and titles already in local distro releases
      const localUpcs = new Set(
        localReleases
          .map(
            (r) =>
              (r.metadata as Record<string, unknown>)?.upc as
                | string
                | undefined,
          )
          .filter(Boolean),
      );
      const localTitles = new Set(
        localReleases.map((r) => (r.title ?? "").toLowerCase().trim()),
      );

      // Annotate each catalog release with whether it's already distributed locally
      const annotated = lgReleases
        .filter((r) => {
          // Only include releases that belong to this artist (by name match)
          const artistMatch =
            !r.artist ||
            r.artist.toLowerCase().trim() ===
              profile.artistName.toLowerCase().trim();
          return artistMatch;
        })
        .map((r) => ({
          id: r.id,
          title: r.title,
          artist: r.artist,
          releaseDate: r.releaseDate,
          upc: r.upc,
          coverUrl: r.coverUrl ?? null,
          releaseType: r.releaseType,
          trackCount: r.trackCount,
          genre: r.genre,
          platforms: r.platforms ?? [],
          tracks: (r.tracks ?? []).map((t) => ({
            id: t.id,
            title: t.title,
            isrc: t.isrc,
            trackNumber: t.trackNumber,
            duration: t.duration,
          })),
          alreadyDistributed:
            (r.upc && localUpcs.has(r.upc)) ||
            localTitles.has((r.title ?? "").toLowerCase().trim()),
        }));

      res.json({ releases: annotated, total: annotated.length });
    } catch (err) {
      logger.warn({ err }, "[ArtistProfiles] GET /:id/catalog error:");
      res.status(500).json({ error: "Catalog fetch failed" });
    }
  },
);

// ── Distribute a collected catalog release ─────────────────────────────────────
// Creates a local distribution draft from a LabelGrid catalog release so the
// artist can complete and submit it without re-entering metadata manually.
const distributeCatalogReleaseSchema = z.object({
  title: z.string().min(1),
  releaseType: z.enum(["single", "EP", "album"]).default("single"),
  releaseDate: z.string().optional(),
  upc: z.string().optional(),
  coverUrl: z.string().url().optional(),
  genre: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  tracks: z
    .array(
      z.object({
        title: z.string(),
        isrc: z.string().optional(),
        trackNumber: z.number().int().optional(),
        duration: z.number().optional(),
      }),
    )
    .optional(),
});

router.post(
  "/:id/distribute-release",
  requireAuth,
  requireUUIDParam("id"),
  async (req: Request, res: Response) => {
    try {
      const profile = await artistProfileService.getProfile(
        req.params.id,
        req.user!.id,
      );
      if (!profile)
        return res.status(404).json({ error: "Artist profile not found" });

      const data = distributeCatalogReleaseSchema.parse(req.body);

      const release = await storage.createDistroRelease({
        artistId: req.user!.id,
        title: data.title,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
        metadata: {
          artistName: profile.artistName,
          releaseType: data.releaseType,
          primaryGenre: data.genre ?? "",
          upc: data.upc ?? null,
          coverUrl: data.coverUrl ?? null,
          selectedPlatforms: data.platforms ?? [],
          // Pre-fill artist platform IDs gathered by the sync system so the
          // distributor routes the release to the correct existing profiles.
          spotifyArtistId: profile.spotifyArtistId ?? null,
          appleArtistId: profile.appleArtistId ?? null,
          deezerArtistId: profile.deezerArtistId ?? null,
          source: "catalog_import",
        },
        tracks: (data.tracks ?? []).map((t, idx) => ({
          title: t.title,
          isrc: t.isrc ?? null,
          trackNumber: t.trackNumber ?? idx + 1,
          duration: t.duration ?? null,
        })),
      });

      logger.info(
        `[ArtistProfiles] Catalog release imported: profile=${req.params.id} release=${release.id} title="${data.title}"`,
      );
      res.json({
        releaseId: release.id,
        title: release.title,
        status: "draft",
      });
    } catch (err) {
      if (err instanceof z.ZodError)
        return res
          .status(400)
          .json({ error: "Invalid release data", details: err.errors });
      logger.warn(
        { err },
        "[ArtistProfiles] POST /:id/distribute-release error:",
      );
      res.status(500).json({ error: "Failed to create distribution draft" });
    }
  },
);

export default router;
