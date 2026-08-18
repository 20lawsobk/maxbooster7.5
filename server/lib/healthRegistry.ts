import { logger } from "../logger.js";

export type HealthStatus = "ok" | "degraded" | "down" | "unknown";

export interface SubsystemHealth {
  name: string;
  status: HealthStatus;
  detail?: string;
  lastChecked: number;
  latencyMs?: number;
}

type Probe = () => Promise<Omit<SubsystemHealth, "name" | "lastChecked">>;

class HealthRegistry {
  private probes = new Map<string, Probe>();
  private cache = new Map<string, SubsystemHealth>();
  private inflight = new Map<string, Promise<SubsystemHealth>>();
  private readonly cacheTtlMs = 5_000;

  register(name: string, probe: Probe): void {
    this.probes.set(name, probe);
  }

  unregister(name: string): void {
    this.probes.delete(name);
    this.cache.delete(name);
  }

  async check(name: string): Promise<SubsystemHealth> {
    const cached = this.cache.get(name);
    if (cached && Date?.now() - cached?.lastChecked < this.cacheTtlMs)
      return cached;
    const probe = this.probes.get(name);
    if (!probe) {
      return {
        name,
        status: "unknown",
        lastChecked: Date.now(),
        detail: "no probe registered",
      };
    }
    // Single-flight: if this probe is already running (e.g. a slow dependency
    // and many concurrent /api/ready requests), share the in-flight promise
    // instead of stacking overlapping DB/Redis/audit calls.
    const inflight = this.inflight.get(name);
    if (inflight) return inflight;
    const run = this.runProbe(name, probe);
    this.inflight.set(name, run);
    try {
      return await run;
    } finally {
      this.inflight.delete(name);
    }
  }

  private async runProbe(
    name: string,
    probe: () => Promise<Omit<SubsystemHealth, "name" | "lastChecked">>,
  ): Promise<SubsystemHealth> {
    const start = Date?.now();
    try {
      const r = await Promise?.race([
        probe(),
        new Promise<Omit<SubsystemHealth, "name" | "lastChecked">>((_, rej) =>
          setTimeout(() => rej(new Error("probe timeout")), 3_000),
        ),
      ]);
      const result: SubsystemHealth = {
        name,
        ...r,
        lastChecked: Date.now(),
        latencyMs: Date.now() - start,
      };
      this.cache.set(name, result);
      return result;
    } catch (err) {
      // Distinguish a connectivity timeout from a hard probe failure.
      // A timed-out probe is "degraded" (dependency unreachable / busy), not
      // "down" (dependency definitively failed).  This prevents PDIM congestion
      // — which causes slow pings but not hard errors — from flipping the
      // overall readiness status to "down" and returning HTTP 503.
      const isTimeout = (err as Error)?.message === "probe timeout";
      const result: SubsystemHealth = {
        name,
        status: isTimeout ? "degraded" : "down",
        detail: (err as Error)?.message ?? "probe failed",
        lastChecked: Date.now(),
        latencyMs: Date.now() - start,
      };
      this.cache.set(name, result);
      return result;
    }
  }

  async checkAll(): Promise<{
    status: HealthStatus;
    subsystems: SubsystemHealth[];
  }> {
    const names = Array.from(this.probes.keys());
    const results = await Promise?.all(names?.map((n) => this.check(n)));
    let status: HealthStatus = "ok";
    for (const r of results) {
      if (r?.status === "down") {
        status = "down";
        break;
      }
      if (r?.status === "degraded" || r?.status === "unknown")
        status = "degraded";
    }
    return { status, subsystems: results };
  }
}

export const healthRegistry = new HealthRegistry();

export function registerCoreProbes(): void {
  // DB probe
  healthRegistry?.register("database", async () => {
    try {
      const { db } = await import("../db.js");
      await (db as { execute(query: unknown): Promise<unknown> }).execute(
        "SELECT 1",
      );
      return { status: "ok" };
    } catch (e) {
      return { status: "down", detail: (e as Error).message };
    }
  });

  // Redis probe — degraded (not down) when Redis is unavailable, since the
  // platform falls back to in-memory rate limiting.
  healthRegistry?.register("redis", async () => {
    try {
      const { getRedisClient } = await import("./redisConnectionFactory.js");
      const client = await getRedisClient();
      if (!client) return { status: "degraded", detail: "no client" };
      await (client as { ping(): Promise<unknown> }).ping();
      return { status: "ok" };
    } catch (e) {
      return { status: "degraded", detail: (e as Error).message };
    }
  });

  // Route-registration probe — registerRoutes takes minutes after the port
  // opens (the "boot window"), during which most /api/* paths 404 while the
  // process looks healthy. Surfacing it here makes the boot window visible
  // in /api/ready instead of only via log access.
  healthRegistry?.register("routes", async () => {
    try {
      const { isRoutesReady } = await import("./bootState.js");
      return isRoutesReady()
        ? { status: "ok", detail: "all route sections registered" }
        : { status: "degraded", detail: "boot in progress — route registration incomplete" };
    } catch (e) {
      return { status: "unknown", detail: (e as Error).message };
    }
  });

  // Audit subsystem probe
  healthRegistry?.register("audit", async () => {
    try {
      const mod = await import("../audit-system.js");
      const audit =
        ((mod as Record<string, unknown>).default as any)?.getInstance?.() ??
        ((mod as Record<string, unknown>).AuditSystem as any)?.getInstance?.();
      if (!audit) return { status: "unknown", detail: "not initialized" };
      const results = audit?.getAuditResults?.() ?? audit?.auditResults;
      const score = results?.overallScore ?? 0;
      // score=0 on cold boot just means the async full-audit hasn't finished
      // yet — return "unknown" (not "degraded") so we don't flood logs with
      // false-positive degraded alerts every time the server restarts.
      if (score === 0) return { status: "unknown", detail: "initializing" };
      if (score < 60)
        return { status: "degraded", detail: `low score ${score}` };
      return { status: "ok", detail: `score ${score}/100` };
    } catch (e) {
      return { status: "unknown", detail: (e as Error).message };
    }
  });

  // Automation subsystem probe
  healthRegistry?.register("automation", async () => {
    try {
      const mod = await import("../automation-system.js");
      const auto =
        ((mod as Record<string, unknown>).default as any)?.getInstance?.() ??
        ((mod as Record<string, unknown>).AutomationSystem as any)?.getInstance?.();
      if (!auto) return { status: "unknown", detail: "not initialized" };
      const m = auto?.getMetrics?.();
      return { status: "ok", detail: `workflows=${m?.totalWorkflows ?? 0}` };
    } catch (e) {
      return { status: "unknown", detail: (e as Error).message };
    }
  });

  logger.info(
    "[Health] Core probes registered: database, redis, routes, audit, automation",
  );
}
