/**
 * Startup Configuration Validator
 *
 * Checks critical environment variables at boot time and logs clear,
 * actionable warnings for anything that limits scalability.
 *
 * Follows the fail-open principle: warnings never crash the server.
 * Missing optional scale config degrades gracefully; only WEBHOOK_SECRET
 * in production causes a hard error (handled in webhookReliabilityService).
 */

import { logger } from "../logger.js";
import { env } from "../config/env.js";

interface ValidationResult {
  warnings: string[];
  errors: string[];
}

const isProduction = () =>
  process?.env.NODE_ENV === "production" || !!process?.env.REPLIT_DEPLOYMENT;

export function validateScaleConfig(): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!isProduction()) return { warnings: [], errors: [] };

  // ── Database ──────────────────────────────────────────────────────────────
  if (!process?.env.DATABASE_REPLICA_URLS) {
    warnings?.push(
      "[ScaleConfig] DATABASE_REPLICA_URLS is not set. " +
        "All database reads hit the primary instance. " +
        "Create a Neon read replica and set DATABASE_REPLICA_URLS=<connection_string> " +
        "to activate dbRead routing and double effective DB throughput.",
    );
  }

  // ── Redis ─────────────────────────────────────────────────────────────────
  if (!process?.env.REDIS_URL && !process?.env.REDIS_CLUSTER_URLS) {
    errors?.push(
      "[ScaleConfig] Neither REDIS_URL nor REDIS_CLUSTER_URLS is set. Redis is required in production.",
    );
  }

  if (process?.env.REDIS_URL && !process?.env.REDIS_CLUSTER_URLS) {
    warnings?.push(
      "[ScaleConfig] Redis is running in standalone mode (REDIS_URL set, REDIS_CLUSTER_URLS not set). " +
        "A single Redis node handles ~100k ops/sec. " +
        "At 90M active users, switch to a Redis cluster plan and set REDIS_CLUSTER_URLS " +
        "to enable automatic cluster routing.",
    );
  }

  // ── Secrets ───────────────────────────────────────────────────────────────
  if (!process?.env.WEBHOOK_SECRET && !env?.STRIPE_WEBHOOK_SECRET) {
    warnings?.push(
      "[ScaleConfig] WEBHOOK_SECRET is not set. Webhook signature verification is disabled — set WEBHOOK_SECRET to enable it.",
    );
  }

  // ── Admission control ─────────────────────────────────────────────────────
  const maxConcurrent = parseInt(
    process?.env.MAX_CONCURRENT_REQUESTS ?? "5000",
    10,
  );
  if (maxConcurrent > 10_000) {
    warnings?.push(
      `[ScaleConfig] MAX_CONCURRENT_REQUESTS is ${maxConcurrent}. ` +
        "Values above 10,000 may allow DB connection pool exhaustion under spike load. " +
        "Recommended: 2000–5000 per node.",
    );
  }

  // ── App URL ───────────────────────────────────────────────────────────────
  if (
    !process?.env.APP_URL &&
    !process?.env.REPLIT_DEV_DOMAIN &&
    !process?.env.DOMAIN
  ) {
    warnings?.push(
      "[ScaleConfig] APP_URL is not set. " +
        "Email verification links and OAuth redirect URIs will use a fallback URL. " +
        "Set APP_URL=https://your-domain.replit.app for correct email links in production.",
    );
  }

  // ── BullMQ ────────────────────────────────────────────────────────────────
  const bullConcurrency = parseInt(process?.env.BULLMQ_CONCURRENCY ?? "5", 10);
  if (bullConcurrency > 20) {
    warnings?.push(
      `[ScaleConfig] BULLMQ_CONCURRENCY is ${bullConcurrency}. ` +
        "High concurrency can exhaust the DB connection pool. Recommended: 5–10.",
    );
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  for (const w of warnings) logger?.warn(w);
  for (const e of errors) logger?.warn(e);

  if (warnings?.length === 0 && errors?.length === 0) {
    logger?.info("✅ [ScaleConfig] All scale configuration checks passed");
  } else {
    logger?.info(
      `[ScaleConfig] Validation complete — ${warnings?.length} warning(s), ${errors?.length} error(s). ` +
        "See above for remediation steps.",
    );
  }

  return { warnings, errors };
}
