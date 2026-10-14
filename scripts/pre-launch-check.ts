#!/usr/bin/env tsx
/**
 * Pre-launch readiness check.
 *
 * This is a fail-closed check, not a substitute for the dedicated build and
 * post-deployment smoke gates. A failed or timed-out typecheck is a failure;
 * an absent health URL is explicitly reported as unprobed rather than passed.
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DatabaseTarget {
  name: "NEON_DATABASE_URL" | "DATABASE_URL";
  url: string;
}

/** Prefer the application's actual Neon database; DATABASE_URL is the CI fallback. */
export function selectDatabaseTarget(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseTarget | null {
  const neonUrl = env.NEON_DATABASE_URL?.trim();
  if (neonUrl) return { name: "NEON_DATABASE_URL", url: neonUrl };
  const fallbackUrl = env.DATABASE_URL?.trim();
  if (fallbackUrl) return { name: "DATABASE_URL", url: fallbackUrl };
  return null;
}

export function isGeoDatabaseRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.GEODNS_ENABLED?.trim().toLowerCase() === "true";
}

/** Never classify timeouts, signals, spawn errors, or nonzero exits as a pass. */
export function evaluateTypecheckResult(
  status: number | null,
  errorCode?: string,
  output = "",
  timeoutMs = 600_000,
): CheckResult {
  if (!errorCode && status === 0) {
    return {
      name: "TypeScript compilation",
      ok: true,
      detail: "npm run check passed (server and client projects)",
    };
  }

  let reason: string;
  if (errorCode === "ETIMEDOUT") {
    reason = `timed out after ${Math.round(timeoutMs / 1000)} seconds`;
  } else if (errorCode) {
    reason = `could not complete (${errorCode})`;
  } else {
    reason = `exited with status ${status ?? "unknown"}`;
  }
  const excerpt = output.trim().slice(-1400);
  return {
    name: "TypeScript compilation",
    ok: false,
    detail: excerpt ? `${reason}: ${excerpt}` : reason,
  };
}

function runTypecheck(timeoutMs = 600_000): CheckResult {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", "check"], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      NODE_OPTIONS:
        process.env.NODE_OPTIONS || "--max-old-space-size=4096",
    },
  });
  return evaluateTypecheckResult(
    result.status,
    result.error?.code,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
    timeoutMs,
  );
}

function redactConnectionString(value: string): string {
  return value.replace(
    /(postgres(?:ql)?:\/\/)[^\s/@]+:[^\s/@]+@/gi,
    "$1[redacted]@",
  );
}

async function main(): Promise<void> {
  const results: CheckResult[] = [];
  let failed = 0;

  function check(name: string, ok: boolean, detail: string): void {
    results.push({ name, ok, detail });
    console.log(`  ${ok ? "✅" : "❌"} ${name} — ${detail}`);
    if (!ok) failed++;
  }

  console.log("\n── Environment variables ────────────────────────────────────────────");
  const database = selectDatabaseTarget();
  check(
    "Application database URL",
    !!database,
    database ? `${database.name} is set` : "NEON_DATABASE_URL or DATABASE_URL is missing",
  );

  const sessionSecret = process.env.SESSION_SECRET ?? "";
  const sessionIsLongEnough = sessionSecret.length >= 32;
  const productionPlaceholder =
    process.env.NODE_ENV === "production" &&
    /^(dev-secret-change-in-production|change-me|changeme|test-secret|placeholder)$/i.test(
      sessionSecret.trim(),
    );
  check(
    "SESSION_SECRET is valid",
    sessionIsLongEnough && !productionPlaceholder,
    !sessionSecret
      ? "MISSING"
      : !sessionIsLongEnough
        ? "must be at least 32 characters"
        : productionPlaceholder
          ? "known placeholder is not allowed in production"
          : "present (value redacted)",
  );

  for (const key of [
    "STRIPE_SECRET_KEY",
    "SENDGRID_API_KEY",
    "AI_SERVER_KEY",
    "AI_SERVER_URL",
  ]) {
    const present = !!process.env[key]?.trim();
    console.log(
      `  ℹ️ ${key} (optional) — ${present ? "present" : "not set; related features may be degraded"}`,
    );
  }

  console.log("\n── GeoDNS database ──────────────────────────────────────────────────");
  if (isGeoDatabaseRequired()) {
    const geoDb = resolve(
      process.cwd(),
      process.env.GEODB_PATH ?? "data/GeoLite2-Country.mmdb",
    );
    let valid = false;
    let detail = geoDb;
    try {
      valid = existsSync(geoDb) && statSync(geoDb).isFile() && statSync(geoDb).size > 0;
      if (!valid) detail = `missing or empty: ${geoDb}`;
      else {
        const { default: maxmind } = await import("maxmind");
        await maxmind.open(geoDb);
        detail = `present and readable: ${geoDb}`;
      }
    } catch (err) {
      valid = false;
      detail = `invalid or unreadable GeoLite2 database: ${String(err).slice(0, 240)}`;
    }
    check("GeoLite2 database (GeoDNS enabled)", valid, detail);
  } else {
    console.log("  ℹ️ GeoLite2 database — not required because GEODNS_ENABLED is not true");
  }

  console.log("\n── TypeScript compilation ───────────────────────────────────────────");
  const typecheck = runTypecheck();
  check(typecheck.name, typecheck.ok, typecheck.detail);

  console.log("\n── Database connectivity ────────────────────────────────────────────");
  if (database) {
    let pool: import("pg").Pool | undefined;
    try {
      const { Pool } = await import("pg");
      pool = new Pool({
        connectionString: database.url,
        max: 1,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 5_000,
      });
      const client = await pool.connect();
      try {
        const { rows } = await client.query("SELECT 1 AS ok");
        check(
          "PostgreSQL connection",
          rows[0]?.ok === 1,
          `${database.name} connected`,
        );
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      check(
        "PostgreSQL connection",
        false,
        redactConnectionString(String(err)).slice(0, 240),
      );
    } finally {
      await pool?.end().catch(() => undefined);
    }
  } else {
    check("PostgreSQL connection", false, "no application database URL configured");
  }

  console.log("\n── Application readiness endpoint ───────────────────────────────────");
  const baseUrl = (
    process.env.TEST_BASE_URL ||
    process.env.APP_URL ||
    process.env.BASE_URL ||
    ""
  ).trim().replace(/\/+$/, "");
  if (!baseUrl) {
    if (process.env.REQUIRE_HEALTH_CHECK === "true") {
      check(
        "GET /ready",
        false,
        "REQUIRE_HEALTH_CHECK=true but TEST_BASE_URL, APP_URL, and BASE_URL are unset",
      );
    } else {
      console.log(
        "  ℹ️ GET /ready — not probed: set TEST_BASE_URL to require an endpoint check; run deployed smoke tests before release",
      );
    }
  } else {
    const isLocalCheck =
      /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(
        baseUrl,
      );
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const response = await fetch(`${baseUrl}/ready`, {
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });
      check(
        `GET ${baseUrl}/ready`,
        response.ok,
        `HTTP ${response.status}`,
      );
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : String(err);
      if (isLocalCheck) {
        check(`GET ${baseUrl}/ready`, false, `unreachable: ${detail}`);
      } else {
        console.log(
          `  ℹ️ GET ${baseUrl}/ready (remote) — unreachable before deployment: ${detail.slice(0, 180)}; post-deployment smoke test is still required`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log(
    `  PRE-LAUNCH CHECK — ${failed === 0 ? "PASSED ✅" : `FAILED ❌ (${failed} issue${failed > 1 ? "s" : ""})`}`,
  );
  console.log("═".repeat(60) + "\n");
  process.exitCode = failed > 0 ? 1 : 0;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  await main();
}
