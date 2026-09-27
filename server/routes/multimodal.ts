import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { requireAuthOnly } from "../middleware/auth.js";
import { AIUnavailableError } from "../lib/aiSource.js";
import { logger } from "../logger.js";
import { handleGeneration } from "../services/multimodalGenerationService.js";
import { assertPublicHttpUrl } from "../services/safeUrlFetch.js";
import {
  type GenerationRequest,
  type Platform,
  type PackId,
  PACK_DEFINITIONS,
} from "@shared/types/multimodalGeneration.js";
import { PLATFORM_RULES } from "@shared/config/platformRules.js";

const router = Router();

const VALID_PLATFORMS = new Set<Platform>([
  "facebook",
  "instagram",
  "threads",
  "tiktok",
  "youtube",
  "google_business",
  "linkedin",
  "twitter",
]);

const VALID_PACKS = new Set<PackId>(Object.keys(PACK_DEFINITIONS) as PackId[]);
const VALID_INPUT_MODALITIES = new Set(["text", "url", "image", "audio", "video"]);
const VALID_OUTPUT_MODALITIES = new Set(["text", "image", "audio", "video"]);

const SPOTIFY_URI_RE =
  /^spotify:(?:track|album|artist|playlist):[A-Za-z0-9]+$/i;

// POST /api/multimodal/generate
// Full multimodal content generation: normalise → plan → workers → package
router.post(
  "/generate",
  requireAuthOnly,
  async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<GenerationRequest> & { userId?: string };
      // Generation context is user-owned. Never trust a caller-supplied userId
      // (the external MaxCore contract includes one, but this authenticated
      // route must bind it to the session identity).
      const userId: string = req.user?.id || "";
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (
        !body?.input ||
        typeof body.input.payload !== "string" ||
        !body.input.payload.trim()
      ) {
        return res.status(400).json({ error: "input.payload is required" });
      }
      if (
        typeof body.input.modality !== "string" ||
        !VALID_INPUT_MODALITIES.has(body.input.modality)
      ) {
        return res.status(400).json({
          error: "input.modality must be one of text, url, image, audio, or video",
        });
      }
      if (
        body.id !== undefined &&
        (typeof body.id !== "string" ||
          !/^[A-Za-z0-9._:-]{1,128}$/.test(body.id))
      ) {
        return res.status(400).json({
          error: "id must be a 1–128 character request identifier",
        });
      }
      if (
        body.constraints !== undefined &&
        (!body.constraints ||
          typeof body.constraints !== "object" ||
          Array.isArray(body.constraints))
      ) {
        return res.status(400).json({ error: "constraints must be an object" });
      }
      const requestedOutputModality = body.constraints?.outputModality;
      if (
        requestedOutputModality !== undefined &&
        (typeof requestedOutputModality !== "string" ||
          !VALID_OUTPUT_MODALITIES.has(requestedOutputModality))
      ) {
        return res.status(400).json({
          error:
            "constraints.outputModality must be one of text, image, audio, or video",
        });
      }
      if (!Array.isArray(body?.platforms) || body?.platforms.length === 0) {
        return res
          .status(400)
          .json({ error: "platforms array is required and must not be empty" });
      }

      const invalidPlatforms = body.platforms.filter(
        (p) => !VALID_PLATFORMS.has(p as Platform),
      );
      if (invalidPlatforms.length > 0) {
        return res.status(400).json({
          error: `Invalid platforms: ${invalidPlatforms.join(", ")}. Accepted: ${[...VALID_PLATFORMS].join(", ")}`,
        });
      }
      const platforms = body.platforms as Platform[];
      let inputPayload = body.input.payload;

      if (body.input.modality === "url") {
        const payload = body.input.payload.trim();
        if (payload.length > 2048) {
          return res.status(400).json({
            error: "input.payload URL is too long (max 2048 characters)",
          });
        }
        inputPayload = payload;
        if (!SPOTIFY_URI_RE.test(payload)) {
          try {
            // This is the shared URL contract used by the outbound fetcher.
            // It rejects non-http(s), credentials and literal reserved hosts;
            // safeFetchText() performs the authoritative DNS and redirect
            // checks when metadata is fetched.
            inputPayload = assertPublicHttpUrl(payload).href;
          } catch {
            return res.status(400).json({
              error: "input.payload must target a public external URL",
            });
          }
        }
        if (inputPayload.length > 2048) {
          return res.status(400).json({
            error: "input.payload URL is too long (max 2048 characters)",
          });
        }
      }

      if (
        body.packId !== undefined &&
        (typeof body.packId !== "string" ||
          !VALID_PACKS.has(body.packId as PackId))
      ) {
        return res.status(400).json({ error: "packId is not supported" });
      }
      const packId = body.packId as PackId | undefined;

      const genRequest: GenerationRequest = {
        id: body.id ?? randomUUID(),
        userId,
        artistProfileId: body.artistProfileId,
        input: {
          modality: body.input.modality as GenerationRequest["input"]["modality"],
          payload: inputPayload,
          metadata: body.input.metadata,
        },
        platforms,
        packId,
        intent: body.intent,
        direction: body.direction,
        context: body.context,
        awareness: body.awareness,
        constraints: body.constraints,
      };

      const pkg = await handleGeneration(genRequest);
      if (!pkg || !Array.isArray(pkg.assets) || pkg.assets.length === 0) {
        throw new AIUnavailableError(
          "multimodal generation returned no validated assets",
        );
      }
      return res.json(pkg);
    } catch (err) {
      logger.warn(
        { errorType: err instanceof Error ? err.name : typeof err },
        "[POST /multimodal/generate]",
      );
      if (err instanceof AIUnavailableError) {
        return res
          .status(503)
          .json({ error: "AI generation is temporarily unavailable" });
      }
      return res.status(500).json({ error: "Generation failed" });
    }
  },
);

// GET /api/multimodal/platform-rules  — return all platform rules (for maxcore and frontend)
router.get(
  "/platform-rules",
  requireAuthOnly,
  (_req: Request, res: Response) => {
    return res.json({ platformRules: PLATFORM_RULES });
  },
);

// GET /api/multimodal/platform-rules/:platform  — rules for a single platform
router.get(
  "/platform-rules/:platform",
  requireAuthOnly,
  (req: Request, res: Response) => {
    const platform = req.params.platform as Platform;
    const rules = PLATFORM_RULES[platform];
    if (!rules) {
      return res.status(404).json({ error: `Unknown platform: ${platform}` });
    }
    return res.json({ platform, rules });
  },
);

// GET /api/multimodal/packs  — list available pack definitions
router.get("/packs", requireAuthOnly, (_req: Request, res: Response) => {
  const packs = Object.entries(PACK_DEFINITIONS).map(([id, slots]) => ({
    id,
    slotCount: slots.length,
    platforms: [...new Set(slots?.map((s) => s?.platform))],
    modalities: [...new Set(slots?.map((s) => s?.modality))],
    slots: slots.map((s) => ({
      id: s.id,
      platform: s.platform,
      modality: s.modality,
      purpose: s.purpose,
    })),
  }));
  return res.json({ packs });
});

export default router;
