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
      await (db as Record<string, unknown>).execute?.("SELECT 1");
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
      await (client as Record<string, unknown>).ping?.();
      return { status: "ok" };
    } catch (e) {
      return { status: "degraded", detail: (e as Error).message };
    }
  });

  // Audit subsystem probe
  healthRegistry?.register("audit", async () => {
    try {
      const mod = await import("../audit-system.js");
      const audit =
        (mod as Record<string, unknown>).default?.getInstance?.() ??
        (mod as Record<string, unknown>).AuditSystem?.getInstance?.();
      if (!audit) return { status: "unknown", detail: "not initialized" };
      const results = audit?.getAuditResults?.() ?? audit?.auditResults;
      const score = results?.overallScore ?? 0;
      if (score === 0) return { status: "degraded", detail: "no audit yet" };
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
        (mod as Record<string, unknown>).default?.getInstance?.() ??
        (mod as Record<string, unknown>).AutomationSystem?.getInstance?.();
      if (!auto) return { status: "unknown", detail: "not initialized" };
      const m = auto?.getMetrics?.();
      return { status: "ok", detail: `workflows=${m?.totalWorkflows ?? 0}` };
    } catch (e) {
      return { status: "unknown", detail: (e as Error).message };
    }
  });

  logger.info(
    "[Health] Core probes registered: database, redis, audit, automation",
  );
}
