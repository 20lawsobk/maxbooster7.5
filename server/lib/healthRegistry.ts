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
    // MaxCore is primary-owned in cluster mode. Never serve its cached `ok`
    // after the primary IPC channel has disconnected; each application
    // readiness request must re-confirm authority (the primary itself still
    // coalesces and TTL-caches the underlying Python health fetch).
    if (
      name !== "maxcore" &&
      cached &&
      Date?.now() - cached?.lastChecked < this.cacheTtlMs
    )
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
      // "unknown" (e.g. MaxCore intentionally not configured) is an honest
      // absence signal, not a fault — it must not drag an otherwise-healthy
      // system down to "degraded".
      if (r?.status === "degraded") status = "degraded";
    }
    return { status, subsystems: results };
  }
}

export const healthRegistry = new HealthRegistry();

export async function probeMaxcoreReadiness(): Promise<
  Omit<SubsystemHealth, "name" | "lastChecked">
> {
  const { checkMaxcoreLocalReady, getMaxcoreLocalStatus } = await import(
    "../services/maxcoreLocalSupervisor.js"
  );
  const local = getMaxcoreLocalStatus();
  if (local.enabled) {
    const ready = await checkMaxcoreLocalReady();
    const current = getMaxcoreLocalStatus();
    return ready
      ? {
          status: "ok",
          detail: "supervised Python model loaded",
        }
      : {
          status: "degraded",
          detail:
            current.error ??
            `supervised Python model not ready (running=${current.running}, restarts=${current.restarts})`,
        };
  }

  const { MaxCoreAIClient } = await import("../services/maxcoreClient.js");
  const cb = MaxCoreAIClient.getCircuitBreakerState();
  if (!cb.configured) {
    return { status: "unknown", detail: "MaxCore not configured (no URL/key)" };
  }
  if (cb.open) {
    const retryInSec = cb.openUntil
      ? Math.max(0, Math.round((cb.openUntil - Date.now()) / 1000))
      : null;
    return {
      status: "down",
      detail: `circuit breaker OPEN — ${cb.consecutiveFailures} consecutive failures, retry in ~${retryInSec}s`,
    };
  }
  if (cb.halfOpen) {
    return {
      status: "degraded",
      detail: "circuit breaker half-open — probing recovery",
    };
  }
  return { status: "ok", detail: `${cb.consecutiveFailures} consecutive failures` };
}

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

  // Redis/PDIM probe. Not configured → "unknown" (honest absence signal, same
  // pattern as the MaxCore probe below). Configured but unreachable → let the
  // error propagate to runProbe()'s wrapper, which already distinguishes a
  // timeout ("degraded" — dependency busy/congested, matches the in-memory
  // rate-limit fallback that's actually in effect) from a hard failure
  // ("down"). Catching every error here to "degraded" would hide a genuine
  // outage behind the same label as ordinary PDIM congestion.
  healthRegistry?.register("redis", async () => {
    const { isPdimConfigured } = await import("./pdimClient.js");
    if (!isPdimConfigured()) {
      return { status: "unknown", detail: "PDIM not configured" };
    }
    const { getRedisClient } = await import("./redisConnectionFactory.js");
    const client = await getRedisClient();
    await (client as { ping(): Promise<unknown> }).ping();
    return { status: "ok" };
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

  // Local MaxCore readiness is the supervised Python model-loaded gate, not
  // merely the request circuit's lack of observed failures. Remote mode keeps
  // the circuit-breaker signal because there is no locally owned child.
  healthRegistry?.register("maxcore", async () => {
    try {
      return await probeMaxcoreReadiness();
    } catch (e) {
      return { status: "down", detail: (e as Error).message };
    }
  });

  logger.info(
    "[Health] Core probes registered: database, redis, routes, audit, automation, maxcore",
  );
}
