/**
 * Thin, safe accessor for the live ContentGenerationAwarenessService
 * ("awareness layer/ContentGenerationAwarenessService.ts").
 *
 * The awareness layer aggregates live RSS/Tavily/Exa industry + trend
 * signals into per-mode generation context (trending genres/moods, viral
 * hook patterns, CTA/emotional-trigger libraries, platform algorithm notes).
 * It already powers server/routes/maxcoreProxy.ts, outreach.ts and
 * arIntelligence.ts. This helper exposes the same capability to any other
 * generation call site (social media, advertising, beat generation, ...)
 * without hard-coupling them to the file's on-disk path.
 *
 * Awareness enrichment is always additive and best-effort: a slow or failed
 * fetch NEVER blocks or fails the caller's generation request — callers get
 * `null` and proceed without enrichment.
 */

import { logger } from "../logger.js";

export type AwarenessMode =
  | "social"
  | "ad_copy"
  | "video_script"
  | "email"
  | "press_release"
  | "blog"
  | "melody"
  | "music"
  | "songwriting"
  | "content"
  | "advertising";

export interface AwarenessContext {
  contextString: string;
  confidence: number;
  signalCount: number;
  trendingGenres: string[];
  trendingMoods: string[];
  contentAngles: string[];
  ctaPatterns: string[];
  emotionalTriggers: string[];
  platformAlgorithmNotes: string[];
  [key: string]: unknown;
}

const AWARENESS_TIMEOUT_MS = 2500;

let cachedService: {
  getContextForMode: (mode: AwarenessMode) => Promise<AwarenessContext>;
} | null = null;
let loadAttempted = false;

async function loadAwarenessService(): Promise<typeof cachedService> {
  if (loadAttempted) return cachedService;
  loadAttempted = true;
  const candidates = [
    "../../awareness layer/ContentGenerationAwarenessService.js",
    "../services/contentAwarenessService.js",
  ];
  for (const p of candidates) {
    try {
      // @ts-ignore dynamic import — path resolved at runtime
      const mod = await import(p);
      const svc = mod?.contentAwarenessService || mod?.default?.contentAwarenessService || mod?.default;
      if (svc && typeof svc.getContextForMode === "function") {
        cachedService = svc;
        logger.info(`[Awareness] Loaded awareness layer from ${p}`);
        return cachedService;
      }
    } catch (e) {
      // try next candidate
    }
  }
  logger.warn("[Awareness] No awareness layer module found — generation will proceed without live trend enrichment");
  return null;
}

/**
 * Fetches live awareness context for the given generation mode. Returns
 * `null` on any failure, timeout, or low-confidence result — callers must
 * treat this as optional enrichment, never a hard dependency.
 */
export async function getAwarenessContext(
  mode: AwarenessMode,
): Promise<AwarenessContext | null> {
  try {
    const svc = await loadAwarenessService();
    if (!svc) return null;
    const ctx = await Promise.race([
      svc.getContextForMode(mode),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), AWARENESS_TIMEOUT_MS)),
    ]);
    if (ctx && ctx.confidence > 0 && ctx.contextString) {
      return ctx;
    }
    return null;
  } catch (e) {
    logger.debug({ err: e }, "[Awareness] getAwarenessContext failed (non-fatal)");
    return null;
  }
}
