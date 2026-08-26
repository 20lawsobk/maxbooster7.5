/**
 * BOOT-TIME ENVIRONMENT VALIDATION
 *
 * Validates all required environment variables and secrets at startup.
 * Server MUST NOT start if critical variables are missing.
 */

import { logger } from "../logger.js";

interface EnvRequirement {
  name: string;
  required: boolean;
  category:
    | "critical"
    | "payment"
    | "email"
    | "ai"
    | "storage"
    | "social"
    | "push"
    | "sms"
    | "search"
    | "monitoring"
    | "geo"
    | "dns"
    | "github"
    | "distribution"
    | "optional";
  description: string;
  validator?: (value: string) => boolean;
}

const ENV_REQUIREMENTS: EnvRequirement[] = [
  // ── Critical ──────────────────────────────────────────────────────────────
  {
    name: "DATABASE_URL",
    required: true,
    category: "critical",
    description: "PostgreSQL database connection string",
    validator: (v) => v?.startsWith("postgres"),
  },
  {
    name: "NEON_DATABASE_URL",
    required: false,
    category: "critical",
    description: "Neon primary PostgreSQL URL (preferred over DATABASE_URL)",
    validator: (v) => v?.startsWith("postgres"),
  },
  {
    name: "NEON_PRIMARY_URL",
    required: false,
    category: "critical",
    description: "Neon primary URL alias",
    validator: (v) => v?.startsWith("postgres"),
  },
  {
    name: "DATABASE_REPLICA_URLS",
    required: false,
    category: "critical",
    description: "Comma-separated Neon read-replica URLs",
    validator: (v) => v?.startsWith("postgres"),
  },
  {
    name: "SESSION_SECRET",
    required: false,
    category: "critical",
    description: "Session encryption secret (min 32 chars)",
    validator: (v) => v?.length >= 32,
  },
  {
    name: "TOKEN_ENCRYPTION_KEY",
    required: false,
    category: "critical",
    description: "Token encryption key for OAuth token storage",
  },
  {
    name: "BOOSTERSTATE_SECRET",
    required: false,
    category: "critical",
    description: "Internal server-to-server bearer token (CSRF bypass)",
  },
  {
    name: "NODE_ENV",
    required: false,
    category: "critical",
    description: "Runtime environment (development | production | test)",
  },
  {
    name: "PORT",
    required: false,
    category: "critical",
    description: "Server listen port (default 5000)",
  },
  {
    name: "BOOSTERSTATE_SIDECAR_PORT",
    required: false,
    category: "critical",
    description: "BoosterState loopback sidecar port",
    validator: (v) => !isNaN(parseInt(v)) && parseInt(v) > 0,
  },
  {
    name: "APP_URL",
    required: false,
    category: "critical",
    description: "Public app URL (used in CSP and OAuth callbacks)",
    validator: (v) => v?.startsWith("http"),
  },
  {
    name: "DOMAIN",
    required: false,
    category: "critical",
    description: "Public domain with protocol",
    validator: (v) => v?.startsWith("http"),
  },
  {
    name: "BASE_DOMAIN",
    required: false,
    category: "critical",
    description: "Root domain (e.g. max-booster.com)",
  },
  {
    name: "BASE_URL",
    required: false,
    category: "critical",
    description: "Base URL for email links and OAuth redirects",
  },
  {
    name: "SITE_URL",
    required: false,
    category: "critical",
    description: "Site URL alias",
  },
  {
    name: "CORS_ORIGIN",
    required: false,
    category: "critical",
    description: "Comma-separated allowed CORS origins",
  },
  {
    name: "MAX_CONCURRENT_REQUESTS",
    required: false,
    category: "critical",
    description: "Admission control ceiling (default 5000)",
  },
  {
    name: "NODE_OPTIONS",
    required: false,
    category: "critical",
    description: "Node.js CLI options (e.g. --max-old-space-size=4096)",
  },
  {
    name: "UV_THREADPOOL_SIZE",
    required: false,
    category: "critical",
    description: "libuv thread pool size",
  },
  {
    name: "ENABLE_SELF_EVOLUTION",
    required: false,
    category: "critical",
    description: "Enable autonomous self-improvement loop",
  },
  {
    name: "STOREFRONT_URL_FORMAT",
    required: false,
    category: "critical",
    description: "Storefront URL format (slug | subdomain)",
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  {
    name: "ADMIN_EMAIL",
    required: false,
    category: "critical",
    description: "Admin account email",
  },
  {
    name: "ADMIN_USERNAME",
    required: false,
    category: "critical",
    description: "Admin account display name",
  },
  {
    name: "ADMIN_PASSWORD",
    required: false,
    category: "critical",
    description: "Admin account password",
  },

  // ── Payment ───────────────────────────────────────────────────────────────
  {
    name: "STRIPE_SECRET_KEY",
    required: true,
    category: "payment",
    description: "Stripe secret API key",
    validator: (v) => v?.startsWith("sk_"),
  },
  {
    name: "STRIPE_PUBLISHABLE_KEY",
    required: true,
    category: "payment",
    description: "Stripe publishable API key",
    validator: (v) => v?.startsWith("pk_"),
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    required: true,
    category: "payment",
    description: "Stripe webhook signing secret",
    validator: (v) => v?.startsWith("whsec_"),
  },
  {
    name: "VITE_STRIPE_PUBLIC_KEY",
    required: false,
    category: "payment",
    description: "Stripe publishable key exposed to Vite frontend",
    validator: (v) => v?.startsWith("pk_"),
  },

  // ── Email ─────────────────────────────────────────────────────────────────
  {
    name: "SENDGRID_API_KEY",
    required: true,
    category: "email",
    description: "SendGrid API key for email delivery",
    validator: (v) => v?.startsWith("SG."),
  },
  {
    name: "SENDGRID_FROM_EMAIL",
    required: false,
    category: "email",
    description: "Verified SendGrid sender address",
  },
  {
    name: "RESEND_API_KEY",
    required: false,
    category: "email",
    description: "Resend API key (email fallback)",
    validator: (v) => v?.startsWith("re_"),
  },

  // ── AI / MaxCore ──────────────────────────────────────────────────────────
  {
    name: "AI_SERVER_URL",
    required: false,
    category: "ai",
    description: "MaxCore AI server base URL",
    validator: (v) => v?.startsWith("http"),
  },
  {
    name: "AI_SERVER_KEY",
    required: false,
    category: "ai",
    description: "Bearer token for MaxCore generation endpoints",
    validator: (v) => v?.startsWith("mbs_"),
  },
  {
    name: "MAXCORE_ADMIN_KEY",
    required: false,
    category: "ai",
    description: "MaxCore admin key (model/reload + training routes)",
    validator: (v) => v?.startsWith("mbs_"),
  },
  {
    name: "MBS_AI_TRAINING_URL",
    required: false,
    category: "ai",
    description: "AI training server URL",
    validator: (v) => v?.startsWith("http"),
  },
  {
    name: "MBS_AI_TRAINING_KEY",
    required: false,
    category: "ai",
    description: "AI training server bearer token",
    validator: (v) => v?.startsWith("mbs_"),
  },
  {
    name: "AI_Training_Server",
    required: false,
    category: "ai",
    description: "AI training server key alias",
  },
  {
    name: "PEER_TRAINING_NODE",
    required: false,
    category: "ai",
    description: "Peer training node URL",
    validator: (v) => v?.startsWith("http"),
  },

  // ── Storage / PDIM ────────────────────────────────────────────────────────
  {
    name: "STORAGE_HTTP_URL",
    required: false,
    category: "storage",
    description: "Pocket Dimension HTTP exec endpoint URL",
    validator: (v) => v?.startsWith("http"),
  },
  {
    name: "STORAGE_BEARER_TOKEN",
    required: false,
    category: "storage",
    description: "Pocket Dimension bearer token (current)",
  },
  {
    name: "STORAGE_PROVIDER",
    required: false,
    category: "storage",
    description: "Storage provider (pocket-dimension | pg)",
  },
  {
    name: "PDIM_EXEC_URL",
    required: false,
    category: "storage",
    description: "PDIM exec endpoint URL",
    validator: (v) => v?.startsWith("http"),
  },
  {
    name: "PDIM_HTTP_EXEC_URL",
    required: false,
    category: "storage",
    description: "PDIM HTTP exec URL alias",
    validator: (v) => v?.startsWith("http"),
  },
  {
    name: "PDIM_EXEC_TOKEN",
    required: false,
    category: "storage",
    description: "PDIM exec bearer token",
  },
  {
    name: "PDIM_BEARER_TOKEN",
    required: false,
    category: "storage",
    description: "PDIM bearer token alias",
  },
  {
    name: "POCKET_DIMENSION_KEY",
    required: false,
    category: "storage",
    description: "Pocket Dimension auth key alias",
  },
  {
    name: "REPLIT_BUCKET_ID",
    required: false,
    category: "storage",
    description: "Replit bucket / PDIM instance ID",
  },
  {
    name: "REDIS_URL",
    required: false,
    category: "storage",
    description: "Redis URL (PDIM instance base URL)",
    validator: (v) => v?.startsWith("http") || v?.startsWith("redis"),
  },
  {
    name: "REDIS_CLUSTER_URLS",
    required: false,
    category: "storage",
    description: "Redis cluster URLs",
  },

  // ── Social OAuth ──────────────────────────────────────────────────────────
  {
    name: "TWITTER_API_KEY",
    required: false,
    category: "social",
    description: "Twitter/X API key",
  },
  {
    name: "TWITTER_API_SECRET",
    required: false,
    category: "social",
    description: "Twitter/X API secret",
  },
  {
    name: "TWITTER_CLIENT_ID",
    required: false,
    category: "social",
    description: "Twitter/X OAuth 2.0 client ID",
  },
  {
    name: "TWITTER_CLIENT_SECRET",
    required: false,
    category: "social",
    description: "Twitter/X OAuth 2.0 client secret",
  },
  {
    name: "FACEBOOK_APP_ID",
    required: false,
    category: "social",
    description: "Facebook App ID",
  },
  {
    name: "FACEBOOK_APP_SECRET",
    required: false,
    category: "social",
    description: "Facebook App secret",
  },
  {
    name: "INSTAGRAM_APP_ID",
    required: false,
    category: "social",
    description: "Instagram App ID",
  },
  {
    name: "INSTAGRAM_APP_SECRET",
    required: false,
    category: "social",
    description: "Instagram App secret",
  },
  {
    name: "TIKTOK_CLIENT_KEY",
    required: false,
    category: "social",
    description: "TikTok client key",
  },
  {
    name: "TIKTOK_CLIENT_SECRET",
    required: false,
    category: "social",
    description: "TikTok client secret",
  },
  {
    name: "TIKTOK_ENV",
    required: false,
    category: "social",
    description: "TikTok environment (sandbox | production)",
  },
  {
    name: "TIKTOK_SANDBOX_CLIENT_KEY",
    required: false,
    category: "social",
    description: "TikTok sandbox client key",
  },
  {
    name: "TIKTOK_SANDBOX_CLIENT_SECRET",
    required: false,
    category: "social",
    description: "TikTok sandbox client secret",
  },
  {
    name: "TIKTOK_SANDBOX_REDIRECT_URI",
    required: false,
    category: "social",
    description: "TikTok sandbox OAuth redirect URI",
  },
  {
    name: "TIKTOK_SANDBOX_SCOPES",
    required: false,
    category: "social",
    description: "TikTok sandbox OAuth scopes",
  },
  {
    name: "YOUTUBE_CLIENT_ID",
    required: false,
    category: "social",
    description: "YouTube/Google OAuth client ID",
  },
  {
    name: "YOUTUBE_CLIENT_SECRET",
    required: false,
    category: "social",
    description: "YouTube/Google OAuth client secret",
  },
  {
    name: "GOOGLE_CLIENT_ID",
    required: false,
    category: "social",
    description: "Google OAuth client ID",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    required: false,
    category: "social",
    description: "Google OAuth client secret",
  },
  {
    name: "GOOGLE_BUSINESS_CLIENT_ID",
    required: false,
    category: "social",
    description: "Google Business OAuth client ID",
  },
  {
    name: "GOOGLE_BUSINESS_CLIENT_SECRET",
    required: false,
    category: "social",
    description: "Google Business OAuth client secret",
  },
  {
    name: "LINKEDIN_CLIENT_ID",
    required: false,
    category: "social",
    description: "LinkedIn client ID",
  },
  {
    name: "LINKEDIN_CLIENT_SECRET",
    required: false,
    category: "social",
    description: "LinkedIn client secret",
  },
  {
    name: "THREADS_APP_ID",
    required: false,
    category: "social",
    description: "Threads App ID",
  },
  {
    name: "THREADS_APP_SECRET",
    required: false,
    category: "social",
    description: "Threads App secret",
  },
  {
    name: "SPOTIFY_CLIENT_ID",
    required: false,
    category: "social",
    description: "Spotify OAuth client ID",
  },
  {
    name: "SPOTIFY_CLIENT_SECRET",
    required: false,
    category: "social",
    description: "Spotify OAuth client secret",
  },

  // ── Push Notifications ────────────────────────────────────────────────────
  {
    name: "VAPID_PUBLIC_KEY",
    required: false,
    category: "push",
    description: "VAPID public key for Web Push",
  },
  {
    name: "VAPID_PRIVATE_KEY",
    required: false,
    category: "push",
    description: "VAPID private key for Web Push",
  },
  {
    name: "VAPID_SUBJECT",
    required: false,
    category: "push",
    description: "VAPID subject (mailto: or URL)",
  },
  {
    name: "FCM_PROJECT_ID",
    required: false,
    category: "push",
    description: "Firebase project ID for FCM push",
  },
  {
    name: "FCM_CLIENT_EMAIL",
    required: false,
    category: "push",
    description: "Firebase service account client email",
  },
  {
    name: "FCM_SERVICE_ACCOUNT_KEY",
    required: false,
    category: "push",
    description: "Firebase service account private key (PEM)",
  },

  // ── SMS / Twilio ──────────────────────────────────────────────────────────
  {
    name: "TWILIO_ACCOUNT_SID",
    required: false,
    category: "sms",
    description: "Twilio account SID",
    validator: (v) => v?.startsWith("AC"),
  },
  {
    name: "TWILIO_AUTH_TOKEN",
    required: false,
    category: "sms",
    description: "Twilio auth token",
  },
  {
    name: "TWILIO_PHONE_NUMBER",
    required: false,
    category: "sms",
    description: "Twilio outbound phone number",
    validator: (v) => v?.startsWith("+"),
  },
  {
    name: "TWILIO_VERIFY_SERVICE_SID",
    required: false,
    category: "sms",
    description: "Twilio Verify service SID",
    validator: (v) => v?.startsWith("VA"),
  },

  // ── Search / Research ─────────────────────────────────────────────────────
  {
    name: "EXA_API_KEY",
    required: false,
    category: "search",
    description: "Exa AI search API key",
  },
  {
    name: "TAVILY_API_KEY",
    required: false,
    category: "search",
    description: "Tavily search API key",
    validator: (v) => v?.startsWith("tvly-"),
  },

  // ── Monitoring ────────────────────────────────────────────────────────────
  {
    name: "SENTRY_DSN",
    required: false,
    category: "monitoring",
    description: "Sentry DSN for error tracking",
    validator: (v) => v?.includes("sentry.io"),
  },
  {
    name: "VITE_SENTRY_DSN",
    required: false,
    category: "monitoring",
    description: "Sentry DSN exposed to Vite frontend",
    validator: (v) => v?.includes("sentry.io"),
  },

  // ── GeoIP / DNS ───────────────────────────────────────────────────────────
  {
    name: "MAXMIND_ACCOUNT_ID",
    required: false,
    category: "geo",
    description: "MaxMind account ID for GeoLite2 downloads",
  },
  {
    name: "MAXMIND_LICENSE_KEY",
    required: false,
    category: "geo",
    description: "MaxMind license key",
  },
  {
    name: "GEODB_PATH",
    required: false,
    category: "geo",
    description: "Local path to GeoLite2-Country.mmdb",
  },
  {
    name: "GEODNS_ENABLED",
    required: false,
    category: "geo",
    description: "Enable GeoDNS routing",
  },
  {
    name: "REGION_MAP",
    required: false,
    category: "dns",
    description: "JSON map of region codes to DNS IPs",
  },
  {
    name: "DNS_SERVER_IP",
    required: false,
    category: "dns",
    description: "Authoritative DNS server IP",
  },
  {
    name: "DNS_PORT",
    required: false,
    category: "dns",
    description: "DNS server port (default 5353)",
  },
  {
    name: "DNSSEC_ENABLED",
    required: false,
    category: "dns",
    description: "Enable DNSSEC signing",
  },

  // ── ACME / TLS ────────────────────────────────────────────────────────────
  {
    name: "ACME_ENABLED",
    required: false,
    category: "optional",
    description: "Enable ACME (Let's Encrypt) auto-TLS",
  },
  {
    name: "ACME_CONTACT_EMAIL",
    required: false,
    category: "optional",
    description: "ACME registration email",
  },
  {
    name: "ACME_DIRECTORY_URL",
    required: false,
    category: "optional",
    description: "ACME directory URL",
    validator: (v) => v?.startsWith("http"),
  },

  // ── GitHub ────────────────────────────────────────────────────────────────
  {
    name: "GITHUB_TOKEN",
    required: false,
    category: "github",
    description: "GitHub personal access token",
    validator: (v) => v?.startsWith("ghp_"),
  },
  {
    name: "GITHUB_PAT",
    required: false,
    category: "github",
    description: "GitHub PAT alias",
    validator: (v) => v?.startsWith("ghp_"),
  },
  {
    name: "GITHUB_PERSONAL_ACCESS_TOKEN",
    required: false,
    category: "github",
    description: "GitHub personal access token alias",
    validator: (v) => v?.startsWith("ghp_"),
  },
  {
    name: "GITHUB_REPO",
    required: false,
    category: "github",
    description: "GitHub repo (owner/repo format)",
  },

  // ── Distribution / LabelGrid ──────────────────────────────────────────────
  {
    name: "LABELGRID_API_URL",
    required: false,
    category: "distribution",
    description: "LabelGrid API base URL",
    validator: (v) => v?.startsWith("http"),
  },
  {
    name: "LABELGRID_API_TOKEN",
    required: false,
    category: "distribution",
    description: "LabelGrid API JWT token",
  },
  {
    name: "LABELGRID_WEBHOOK_URL",
    required: false,
    category: "distribution",
    description: "LabelGrid webhook callback URL",
    validator: (v) => v?.startsWith("http"),
  },
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    total: number;
    valid: number;
    missing: number;
    invalid: number;
  };
}

export function validateEnvironment(
  strictMode: boolean = true,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let valid = 0;
  let missing = 0;
  let invalid = 0;

  logger.info("════════════════════════════════════════════════════════");
  logger.info("🔐 ENVIRONMENT VALIDATION");
  logger.info("════════════════════════════════════════════════════════");

  for (const req of ENV_REQUIREMENTS) {
    const value = process.env[req.name];

    if (!value) {
      if (req.required) {
        errors?.push(`MISSING: ${req.name} - ${req.description}`);
        missing++;
        logger.warn(`   ✗ ${req.name} - MISSING (required)`);
      } else {
        warnings?.push(`Optional: ${req.name} not set - ${req.description}`);
        logger.warn(`   ⚠ ${req.name} - not set (optional)`);
      }
      continue;
    }

    if (req.validator && !req.validator(value)) {
      if (req.required) {
        errors?.push(
          `INVALID: ${req.name} - ${req.description} (validation failed)`,
        );
        invalid++;
        logger.warn(`   ✗ ${req.name} - INVALID format`);
      } else {
        warnings?.push(`Invalid format: ${req.name} - ${req.description}`);
        logger.warn(`   ⚠ ${req.name} - invalid format`);
      }
      continue;
    }

    valid++;
    logger.info(`   ✓ ${req.name}`);
  }

  const isValid = errors?.length === 0;

  logger.info("────────────────────────────────────────────────────────");
  logger.info(`   Valid: ${valid} | Missing: ${missing} | Invalid: ${invalid}`);

  if (isValid) {
    logger.info("   ✅ Environment validation PASSED");
  } else {
    logger.warn("   ❌ Environment validation FAILED");
    logger.warn("");
    logger.warn("   Critical errors:");
    errors?.forEach((e) => logger.warn(`     - ${e}`));
  }

  logger.info("════════════════════════════════════════════════════════");

  if (!isValid && strictMode) {
    throw new Error(
      `Environment validation failed. Missing/invalid required variables:\n${errors?.join("\n")}`,
    );
  }

  return {
    valid: isValid,
    errors,
    warnings,
    summary: {
      total: ENV_REQUIREMENTS.length,
      valid,
      missing,
      invalid,
    },
  };
}

/**
 * Quick check for a specific env var
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Get env var with fallback
 */
export function getEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
