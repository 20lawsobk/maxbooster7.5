import type { RequestHandler } from "express";

/** Awareness serves live signals; it has no dependency on generation weights. */
export function inspectAwarenessReadiness(status: Record<string, unknown>, now = Date.now()) {
  const sources = status.source_health;
  const healthySources = sources && typeof sources === "object" && !Array.isArray(sources)
    ? Object.values(sources).filter(source => source && typeof source === "object" &&
      "ok" in source && source.ok === true).length : 0;
  const fresh = typeof status.snapshot_id === "string" && status.snapshot_id.length > 0 &&
    typeof status.expires_at === "number" && Number.isFinite(status.expires_at) &&
    status.expires_at * 1000 > now;
  const ready = status.ready === true && fresh && healthySources > 0;
  return {
    scope: "awareness" as const,
    ready,
    reason: ready ? "fresh_live_signals" : !fresh ? "snapshot_missing_or_expired" :
      healthySources === 0 ? "live_sources_unavailable" : "awareness_not_ready",
    healthySources,
    expiresAt: typeof status.expires_at === "number" && Number.isFinite(status.expires_at)
      ? status.expires_at : null,
  };
}

export function createAwarenessReadinessHandler(
  getStatus: () => Promise<Record<string, unknown>>,
  clock: () => number = Date.now,
): RequestHandler {
  return async (_req, res) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    try {
      const result = inspectAwarenessReadiness(await getStatus(), clock());
      res.status(result.ready ? 200 : 503).json(result);
    } catch {
      // Provider bodies and transport errors can contain private configuration.
      res.status(503).json({ scope: "awareness", ready: false, reason: "awareness_unavailable" });
    }
  };
}
