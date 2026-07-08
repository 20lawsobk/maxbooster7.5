/**
 * Central typed environment configuration with Zod validation.
 * Import `env` from this module throughout the server instead of
 * reading process?.env directly — provides compile-time types, runtime
 * validation, and prevents undefined crashes caused by typos.
 *
 * Usage:
 *   import { env } from './config/env.js';
 *   const _key = env?.STRIPE_SECRET_KEY;
 */
import { z } from "zod";

const envSchema = z.object({
  // ── Core ──────────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "production", "test", "staging"])
    .default("development"),
  PORT: z.coerce.number().min(1).max(65535).default(5000),

  // ── Database ──────────────────────────────────────────────────────────────
  // Optional here — the app prefers NEON_DATABASE_URL (see config/defaults.ts).
  // db.ts enforces that at least one is present at pool-creation time.
  DATABASE_URL: z.string().url().startsWith("postgresql://").optional(),

  // ── Session / Auth ────────────────────────────────────────────────────────
  SESSION_SECRET: z.string().min(32),

  // ── Stripe ────────────────────────────────────────────────────────────────
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  STRIPE_PRICE_ID_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ID_PRO_ANNUAL: z.string().optional(),
  STRIPE_PRICE_ID_ELITE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ID_ELITE_ANNUAL: z.string().optional(),
  TESTING_STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_CONNECT_CLIENT_ID: z.string().optional(),

  // ── Email ─────────────────────────────────────────────────────────────────
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),

  // ── Storage ───────────────────────────────────────────────────────────────
  REPLIT_OBJECT_STORAGE_BUCKET: z.string().optional(),

  // ── Monitoring ────────────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),

  // ── OAuth ─────────────────────────────────────────────────────────────────
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_BUSINESS_CLIENT_ID: z.string().optional(),
  GOOGLE_BUSINESS_CLIENT_SECRET: z.string().optional(),

  // ── AI / ML ───────────────────────────────────────────────────────────────
  OPENAI_API_KEY: z.string().startsWith("sk-").optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // ── App config ────────────────────────────────────────────────────────────
  BASE_URL: z.string().url().optional(),
  BASE_DOMAIN: z.string().optional(),
  APP_NAME: z.string().default("Max Booster"),
  APP_URL: z.string().optional(),
  DOMAIN: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),

  // ── Database aliases ──────────────────────────────────────────────────────
  NEON_DATABASE_URL: z.string().url().optional(),

  // ── Feature flags ─────────────────────────────────────────────────────────
  SKIP_BOOSTERSTATE: z.string().optional(),
  DEPLOYMENT_PHASES: z.string().optional(),

  // ── Redis / PDIM ──────────────────────────────────────────────────────────
  REDIS_URL: z.string().optional(),
  POCKET_DIMENSION_KEY: z.string().optional(),
});

// Parse eagerly at startup so any misconfiguration surfaces immediately.
// Missing required vars will throw with a descriptive error.
function parseEnv() {
  const result = envSchema?.safeParse(process?.env);
  if (!result?.success) {
    const issues = result?.error.issues
      .map((i) => `  ${i?.path.join(".")}: ${i?.message}`)
      .join("\n");
    // Log but don't crash for optional vars — only crash on required ones
    const required = ["SESSION_SECRET"];
    const criticalFail = result?.error.issues?.some((i) =>
      required?.includes(String(i?.path[0])),
    );
    if (criticalFail) {
      throw new Error(
        `[env] Critical environment variables missing:\n${issues}`,
      );
    }
    // Warn for non-critical issues
    console?.warn(`[env] Optional env vars have issues:\n${issues}`);
  }
  // Return the parsed data if successful, otherwise the raw process?.env with defaults applied
  return result?.success
    ? result?.data
    : (envSchema?.partial().parse(process?.env) as z.infer<typeof envSchema>);
}

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
