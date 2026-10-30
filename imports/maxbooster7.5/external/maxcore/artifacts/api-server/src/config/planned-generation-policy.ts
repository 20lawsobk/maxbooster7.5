/** Exact Python planned targets, never a prefix-wide readiness exception. */
export const PLANNED_GENERATION_DEADLINES: Readonly<Record<string, number>> = Object.freeze({
  "/content/generate": 60000,
  "/platform/social/generate": 60000,
  "/platform/social/autopilot": 60000,
  // Preserve the existing DAW/video platform route budgets.
  "/platform/daw/generate": 600000,
  "/platform/distribution/plan": 60000,
  "/platform/video/generate": 600000,
  "/analyze": 60000,
  "/generate/text": 60000,
  "/generate/image": 60000,
  "/generate/audio": 60000,
  "/generate/video": 60000,
  "/platform/ads/generate": 60000,
  "/platform/ads/autopilot": 60000,
  "/platform/ads/audience": 60000,
  "/platform/ads/optimize": 60000,
  "/api/generate/content": 60000,
  "/api/generate/campaign": 60000,
  "/api/generate/text": 60000,
  "/api/content/score": 60000,
  "/api/analyze": 60000,
  "/api/analyze/sentiment": 60000,
  "/api/optimize/ad": 60000,
  "/api/predict/engagement": 60000,
  "/api/generate/image": 600000,
  "/api/generate/audio": 600000,
  "/api/generate-video": 600000,
  "/api/video/extend": 600000,
  "/api/video/generate-ai": 600000,
  "/api/warm": 60000,
});

/** Python remains the authority for auth, awareness and actual capability. */
export function plannedGenerationDeadlineMs(path: string, body?: unknown): number | undefined {
  if (!Object.hasOwn(PLANNED_GENERATION_DEADLINES, path)) return undefined;
  if (["/generate/text", "/api/generate/text"].includes(path)
      && body && typeof body === "object" && !Array.isArray(body)
      && (body as Record<string, unknown>).mode === "planner") return 30_000;
  return PLANNED_GENERATION_DEADLINES[path];
}
