// server/diffusion-gateway/index.ts
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// server/config/env.ts
import { z } from "zod";
var envSchema = z.object({
  // ── Core ──────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "production", "test", "staging"]).default("development"),
  PORT: z.coerce.number().min(1).max(65535).default(5e3),
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
  SENTRY_DSN: z.string().url().optional().catch(void 0),
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
  BASE_URL: z.string().url().optional().catch(void 0),
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
  POCKET_DIMENSION_KEY: z.string().optional()
});
function parseEnv() {
  const result = envSchema?.safeParse(process.env);
  if (!result?.success) {
    const issues = result?.error.issues.map((i) => `  ${i?.path.join(".")}: ${i?.message}`).join("\n");
    const required = ["SESSION_SECRET"];
    const criticalFail = result?.error.issues?.some(
      (i) => required?.includes(String(i?.path[0]))
    );
    if (criticalFail) {
      throw new Error(
        `[env] Critical environment variables missing:
${issues}`
      );
    }
    console?.warn(`[env] Optional env vars have issues:
${issues}`);
  }
  return result?.success ? result?.data : envSchema?.partial().parse(process.env);
}
var env = parseEnv();

// server/logger.ts
import pino from "pino";
import { format } from "node:util";

// server/logSanitizer.ts
import { isIP } from "node:net";
var REDACTED = "[REDACTED]";
var sensitiveKey = /^(?:.*(?:password|secret|token|apikey|privatekey|authorization|cookie)|.*email(?:address)?|.*username|(?:client|remote|source|user)?ip(?:address)?|.*phone(?:number)?|cardnumber|cvc|cvv|xforwardedfor|xrealip|setcookie)$/i;
function sanitizeLogText(text) {
  return text.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=~:-]+/gi, REDACTED).replace(/((?:password|secret|access[_-]?token|refresh[_-]?token|api[_-]?key)\s*[=:]\s*)[^\s,;&]+/gi, `$1${REDACTED}`).replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED).replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (value) => isIP(value) ? REDACTED : value).replace(
    /(?<![a-zA-Z0-9])(?:[a-fA-F0-9]*:){2,}[a-fA-F0-9:.]*(?:%[a-zA-Z0-9]+)?/g,
    (value) => isIP(value) ? REDACTED : value
  );
}
function sanitizeLogValue(value, seen = /* @__PURE__ */ new WeakSet(), depth = 0) {
  if (typeof value === "string") return sanitizeLogText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= 12) return "[LOG_DEPTH_LIMIT]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  try {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return "[BINARY]";
    if (Array.isArray(value)) {
      const result2 = value.slice(0, 100).map((item) => sanitizeLogValue(item, seen, depth + 1));
      if (value.length > 100) result2.push("[LOG_ITEM_LIMIT]");
      return result2;
    }
    const result = /* @__PURE__ */ Object.create(null);
    if (value instanceof Error) {
      result.type = value.name;
      result.message = sanitizeLogText(value.message);
      result.stack = value.stack ? sanitizeLogText(value.stack) : void 0;
    }
    const keys = Object.getOwnPropertyNames(value).slice(0, 100);
    for (const key of keys) {
      if (["__proto__", "constructor", "prototype", "hasOwnProperty", "toJSON"].includes(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) continue;
      if (!("value" in descriptor)) {
        result[sanitizeLogText(key)] = "[ACCESSOR]";
      } else {
        result[sanitizeLogText(key)] = sensitiveKey.test(key.replace(/[-_]/g, "")) ? REDACTED : sanitizeLogValue(descriptor.value, seen, depth + 1);
      }
    }
    if (Object.getOwnPropertyNames(value).length > 100) result.logTruncated = true;
    return result;
  } finally {
    seen.delete(value);
  }
}

// server/logger.ts
var REDACT_PATHS = [
  // Headers
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'req.headers["x-csrf-token"]',
  "headers.authorization",
  "headers.cookie",
  'headers["x-api-key"]',
  'headers["x-csrf-token"]',
  // Auth payloads
  "*.password",
  "*.passwordHash",
  "*.currentPassword",
  "*.newPassword",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.idToken",
  "*.apiKey",
  "*.secret",
  "*.clientSecret",
  "*.privateKey",
  "*.twoFactorSecret",
  "*.totpSecret",
  // Stripe / payments
  "*.stripeSecretKey",
  "*.stripeWebhookSecret",
  "*.cardNumber",
  "*.cvc",
  "*.cvv",
  // Generic sensitive containers
  "body.password",
  "body.token",
  "body.secret",
  "body.apiKey"
];
var transport = process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT ? { target: "pino-pretty", options: { colorize: true } } : void 0;
function createAppLogger(destination) {
  const options = {
    level: process.env.LOG_LEVEL || "info",
    hooks: {
      logMethod(args, method) {
        const clean = args.map((value) => sanitizeLogValue(value));
        const messageIndex = typeof clean[0] === "string" ? 0 : 1;
        if (typeof clean[messageIndex] === "string") {
          const message = sanitizeLogText(format(...clean.slice(messageIndex)));
          clean.splice(messageIndex, clean.length - messageIndex, message);
        }
        method.apply(this, clean);
      }
    },
    formatters: {
      bindings: (bindings) => ({ ...sanitizeLogValue(bindings) }),
      log: (object) => ({ ...sanitizeLogValue(object) })
    },
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
      remove: false
    },
    transport: destination ? void 0 : transport
  };
  const instance = destination ? pino(options, destination) : pino(options);
  const child = instance.child;
  instance.child = function(bindings, childOptions) {
    return child.call(this, { ...sanitizeLogValue(bindings) }, childOptions);
  };
  const setBindings = instance.setBindings;
  instance.setBindings = function(bindings) {
    setBindings.call(this, { ...sanitizeLogValue(bindings) });
  };
  return instance;
}
var logger = createAppLogger();

// server/config/defaults.ts
import os from "os";

// server/config/ports.ts
var MIN_PORT = 1;
var MAX_PORT = 65535;
var defaultPorts = Object.freeze({
  app: 5e3,
  localPdim: 5556,
  diffusionGateway: 8008,
  maxcoreApi: 8090,
  boosterState: 9877,
  maxcoreModelApi: 9878,
  maxcoreModelHealth: 9879,
  legacyPythonAi: 9880
});
function readPort(name, defaultValue) {
  const raw = process.env[name];
  if (raw === void 0 || raw.trim() === "") return defaultValue;
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `[Ports] ${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}; received "${raw}"`
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < MIN_PORT || value > MAX_PORT) {
    throw new Error(
      `[Ports] ${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}; received "${raw}"`
    );
  }
  return value;
}
function assertUniquePorts(ports) {
  const owners = /* @__PURE__ */ new Map();
  for (const [name, port] of Object.entries(ports)) {
    const existing = owners.get(port);
    if (existing) {
      throw new Error(
        `[Ports] ${name} and ${existing} are both configured for port ${port}. Internal services must use distinct ports.`
      );
    }
    owners.set(port, name);
  }
  return Object.freeze(ports);
}
var runtimePorts = assertUniquePorts({
  app: readPort("PORT", defaultPorts.app),
  localPdim: readPort("LOCAL_PDIM_PORT", defaultPorts.localPdim),
  diffusionGateway: readPort(
    "VIDEO_DIFFUSION_PORT",
    defaultPorts.diffusionGateway
  ),
  maxcoreApi: readPort("MAXCORE_LOCAL_PORT", defaultPorts.maxcoreApi),
  boosterState: readPort(
    "BOOSTERSTATE_SIDECAR_PORT",
    defaultPorts.boosterState
  ),
  maxcoreModelApi: readPort(
    "MODEL_API_PORT",
    defaultPorts.maxcoreModelApi
  ),
  maxcoreModelHealth: readPort(
    "MODEL_API_HEALTH_PORT",
    defaultPorts.maxcoreModelHealth
  ),
  legacyPythonAi: readPort("PYTHON_AI_PORT", defaultPorts.legacyPythonAi)
});
function loopbackUrl(port) {
  return `http://127.0.0.1:${port}`;
}

// server/config/defaults.ts
var _vmCpuCount = Math.max(1, os.cpus().length);
var _vmConcMult = Math.max(1, Math.floor(_vmCpuCount / 4));
var isReplitDeployment = process.env.REPLIT_DEPLOYMENT === "1";
var isReplitWorkspace = !!process.env.REPLIT_DEV_DOMAIN;
var isProduction = process.env.NODE_ENV === "production" || isReplitDeployment;
function parseEnvInt(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
function parseEnvBool(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}
function parseEnvArray(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
function parseNodeEnv(value) {
  return value === "production" || value === "test" || value === "development" ? value : "development";
}
var config = {
  nodeEnv: parseNodeEnv(process.env.NODE_ENV),
  isReplitDeployment,
  isReplitWorkspace,
  port: runtimePorts.app,
  database: {
    url: env.NEON_DATABASE_URL || env.DATABASE_URL || "",
    // In production each worker creates its own pool.  With the default of 20
    // connections × N workers we easily exceed Neon's connection limit (53100).
    // Scale the per-worker pool so all workers combined stay ≤ 15 connections:
    //   ceil(15 / CLUSTER_WORKERS) → 5 for 3 workers, 3 for 6 workers, etc.
    // The DB_POOL_SIZE env var always wins if set explicitly.
    // Dev uses 8 to avoid a cold-start storm (too many simultaneous new Neon
    // WebSocket connections stall each other and delay foreground requests).
    poolSize: parseEnvInt(
      "DB_POOL_SIZE",
      isReplitDeployment ? Math.max(
        2,
        Math.ceil(
          15 / (parseInt(process.env.PDIM_CLUSTER_WORKERS || "1", 10) || 1)
        )
      ) : 8
    ),
    maxConnections: parseEnvInt("DB_MAX_CONNECTIONS", 200),
    idleTimeout: parseEnvInt("DB_IDLE_TIMEOUT", 6e4),
    // 3 s connection-checkout timeout: if the pool is momentarily exhausted by
    // background tasks, _retryQuery (2 attempts, 300 ms gap) fails within 6.3 s
    // — well under a 10 s HTTP client AbortSignal — instead of hanging 20 s.
    connectionTimeout: parseEnvInt("DB_CONNECTION_TIMEOUT", 3e3)
  },
  redis: {
    url: env.REDIS_URL,
    maxRetries: 3,
    retryDelay: 1e3
  },
  boosterState: {
    port: runtimePorts.boosterState,
    shards: parseEnvInt("BOOSTERSTATE_SHARDS", 16),
    dataDir: process.env.BOOSTERSTATE_DATA_DIR || "./boosterstate-data"
  },
  session: {
    secret: env.SESSION_SECRET || "dev-secret-change-in-production",
    maxSessions: parseEnvInt("MAX_SESSIONS", 8e10),
    // 80 billion sessions
    ttl: parseEnvInt("SESSION_TTL", 86400),
    // 24 hours
    name: process.env.SESSION_NAME || "maxbooster.sid"
  },
  rateLimiting: {
    windowMs: parseEnvInt("RATE_LIMIT_WINDOW_MS", 6e4),
    // 1 minute window
    maxRequests: parseEnvInt("RATE_LIMIT_MAX", 1200),
    // 1 200 req/min per user/IP (20 req/s)
    criticalMax: parseEnvInt("RATE_LIMIT_CRITICAL_MAX", 30)
    // 30 req/min for auth/payment endpoints
  },
  upload: {
    maxFileSize: parseEnvInt("MAX_FILE_SIZE", 209715200),
    // 200MB
    allowedTypes: parseEnvArray("ALLOWED_FILE_TYPES", [
      "mp3",
      "wav",
      "flac",
      "aiff",
      "ogg"
    ]),
    useTempStorage: parseEnvBool("USE_TEMP_STORAGE", true)
    // Default to local for dev
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER === "s3" ? "s3" : "pocket-dimension",
    bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    replitBucketId: process.env.REPLIT_BUCKET_ID || process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
  },
  queue: {
    concurrency: {
      audio: parseEnvInt(
        "QUEUE_AUDIO_CONCURRENCY",
        Math.min(24, 6 * _vmConcMult)
      ),
      analytics: parseEnvInt(
        "QUEUE_ANALYTICS_CONCURRENCY",
        Math.min(32, 8 * _vmConcMult)
      ),
      email: parseEnvInt(
        "QUEUE_EMAIL_CONCURRENCY",
        Math.min(64, 16 * _vmConcMult)
      ),
      csv: parseEnvInt("QUEUE_CSV_CONCURRENCY", Math.min(16, 4 * _vmConcMult))
    },
    timeout: {
      audio: parseEnvInt("QUEUE_AUDIO_TIMEOUT", 18e4),
      // 3 minutes
      analytics: parseEnvInt("QUEUE_ANALYTICS_TIMEOUT", 3e4),
      // 30 seconds
      email: parseEnvInt("QUEUE_EMAIL_TIMEOUT", 1e4),
      // 10 seconds
      csv: parseEnvInt("QUEUE_CSV_TIMEOUT", 3e5)
      // 5 minutes
    },
    retries: {
      audio: parseEnvInt("QUEUE_AUDIO_RETRIES", 3),
      analytics: parseEnvInt("QUEUE_ANALYTICS_RETRIES", 2),
      email: parseEnvInt("QUEUE_EMAIL_RETRIES", 5),
      csv: parseEnvInt("QUEUE_CSV_RETRIES", 1)
    }
  },
  monitoring: {
    poolUtilizationThreshold: parseEnvInt("POOL_UTILIZATION_THRESHOLD", 80),
    memoryWarningThreshold: parseEnvInt("MEMORY_WARNING_THRESHOLD", 80),
    memoryCriticalThreshold: parseEnvInt("MEMORY_CRITICAL_THRESHOLD", 90)
  }
};

// server/config/index.ts
import { createHmac, randomBytes } from "node:crypto";
var p = process.env;
var _maxcoreLocalEnabled = p.MAXCORE_LOCAL !== "0";
var _maxcoreLocalPort = runtimePorts.maxcoreApi;
if (_maxcoreLocalEnabled && !p.PDIM_LOCAL_CHANNEL_TOKEN) {
  p.PDIM_LOCAL_CHANNEL_TOKEN = randomBytes(32).toString("hex");
}
function _maxcoreDerivedKey(scope) {
  if (!_maxcoreLocalEnabled || !p.SESSION_SECRET) return "";
  return "mclocal-" + createHmac("sha256", p.SESSION_SECRET).update(`maxcore-${scope}`).digest("hex").slice(0, 40);
}
var config2 = {
  // Core
  port: runtimePorts.app,
  nodeEnv: p.NODE_ENV || "development",
  // Database — prefer Neon URL, fall back to DATABASE_URL
  dbUrl: p.NEON_DATABASE_URL || p.NEON_PRIMARY_URL || p.DATABASE_URL || "",
  // MaxCore AI — runs as a LOCAL supervised subsystem by default (the imported
  // repo at external/maxcore). Set MAXCORE_LOCAL=0 to point back at a remote
  // MaxCore deployment via MAXCORE_URL / AI_SERVER_URL.
  maxcoreLocal: {
    enabled: _maxcoreLocalEnabled,
    port: _maxcoreLocalPort,
    modelApiPort: runtimePorts.maxcoreModelApi
  },
  maxcoreUrl: _maxcoreLocalEnabled ? `http://127.0.0.1:${_maxcoreLocalPort}` : p.MAXCORE_URL || p.AI_SERVER_URL || "",
  // Local DNS node — internal-only supervised child process running the
  // dns-node authoritative nameserver (dns-node/src) for backend testing.
  // NOT publicly reachable: Replit's deployment proxy is HTTP(S)-only and
  // does not pass through raw UDP/TCP:53 traffic, so this can never serve
  // real public DNS. Real production nameservers run on the separate GCP
  // VMs provisioned by deploy-gcp.sh. Disabled by default; opt in with
  // DNS_NODE_LOCAL=1 for internal verification only.
  dnsNodeLocal: {
    enabled: p.DNS_NODE_LOCAL === "1",
    port: Number(p.DNS_NODE_LOCAL_PORT) || 5353,
    healthPort: Number(p.DNS_NODE_LOCAL_HEALTH_PORT) || 5380,
    domain: p.DNS_NODE_LOCAL_DOMAIN || "max-booster.com"
  },
  // Keep generation and administrative credentials distinct. A missing
  // generation key may fall back to the admin key for backwards-compatible
  // deployments, but an admin request must never inherit the generation key.
  // Local generation exclusively uses the inherited private channel token;
  // administrative credentials remain separate.
  maxcoreGenerationKey: _maxcoreLocalEnabled ? p.PDIM_LOCAL_CHANNEL_TOKEN : p.AI_SERVER_KEY || p.MAXCORE_ADMIN_KEY || "",
  maxcoreAdminKey: p.MAXCORE_ADMIN_KEY || _maxcoreDerivedKey("admin"),
  aiTrainingUrl: p.MBS_AI_TRAINING_URL || p.PEER_TRAINING_NODE || "",
  aiTrainingKey: p.MBS_AI_TRAINING_KEY || p.AI_Training_Server || "",
  // PDIM / Pocket Dimension
  pdimUrl: p.PDIM_EXEC_URL || p.PDIM_HTTP_EXEC_URL || "",
  pdimToken: p.PDIM_BEARER_TOKEN || p.PDIM_EXEC_TOKEN || p.POCKET_DIMENSION_KEY || "",
  // Session / Security
  jwtSecret: p.SESSION_SECRET || "",
  tokenEncryptionKey: p.TOKEN_ENCRYPTION_KEY || "",
  // App identity
  appUrl: p.APP_URL || "",
  baseDomain: p.BASE_DOMAIN || "",
  corsOrigin: p.CORS_ORIGIN || "",
  // Stripe
  stripeSecretKey: p.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: p.STRIPE_WEBHOOK_SECRET || "",
  stripePublishableKey: p.STRIPE_PUBLISHABLE_KEY || p.VITE_STRIPE_PUBLIC_KEY || "",
  // Email
  sendgridApiKey: p.SENDGRID_API_KEY || "",
  sendgridFrom: p.SENDGRID_FROM_EMAIL || "",
  resendApiKey: p.RESEND_API_KEY || "",
  // Twilio
  twilioAccountSid: p.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: p.TWILIO_AUTH_TOKEN || "",
  twilioPhone: p.TWILIO_PHONE_NUMBER || "",
  twilioVerifySid: p.TWILIO_VERIFY_SERVICE_SID || "",
  // Storage
  storageProvider: p.STORAGE_PROVIDER || "pocket-dimension",
  storageBearerToken: p.STORAGE_BEARER_TOKEN || "",
  storageHttpUrl: p.STORAGE_HTTP_URL || "",
  // Redis
  redisUrl: p.REDIS_URL || "",
  // Social OAuth
  google: {
    clientId: p.GOOGLE_CLIENT_ID || "",
    clientSecret: p.GOOGLE_CLIENT_SECRET || ""
  },
  youtube: {
    clientId: p.YOUTUBE_CLIENT_ID || "",
    clientSecret: p.YOUTUBE_CLIENT_SECRET || ""
  },
  twitter: {
    apiKey: p.TWITTER_API_KEY || "",
    apiSecret: p.TWITTER_API_SECRET || "",
    clientId: p.TWITTER_CLIENT_ID || "",
    clientSecret: p.TWITTER_CLIENT_SECRET || ""
  },
  facebook: {
    appId: p.FACEBOOK_APP_ID || "",
    appSecret: p.FACEBOOK_APP_SECRET || ""
  },
  instagram: {
    appId: p.INSTAGRAM_APP_ID || "",
    appSecret: p.INSTAGRAM_APP_SECRET || ""
  },
  tiktok: {
    clientKey: p.TIKTOK_CLIENT_KEY || "",
    clientSecret: p.TIKTOK_CLIENT_SECRET || "",
    env: p.TIKTOK_ENV || "sandbox",
    sandboxClientKey: p.TIKTOK_SANDBOX_CLIENT_KEY || "",
    sandboxClientSecret: p.TIKTOK_SANDBOX_CLIENT_SECRET || "",
    sandboxRedirectUri: p.TIKTOK_SANDBOX_REDIRECT_URI || "",
    sandboxScopes: p.TIKTOK_SANDBOX_SCOPES || ""
  },
  spotify: {
    clientId: p.SPOTIFY_CLIENT_ID || "",
    clientSecret: p.SPOTIFY_CLIENT_SECRET || ""
  },
  threads: {
    appId: p.THREADS_APP_ID || "",
    appSecret: p.THREADS_APP_SECRET || ""
  },
  linkedin: {
    clientId: p.LINKEDIN_CLIENT_ID || "",
    clientSecret: p.LINKEDIN_CLIENT_SECRET || ""
  },
  // Music distribution
  labelgrid: {
    apiUrl: p.LABELGRID_API_URL || "https://api.labelgrid.com",
    apiToken: p.LABELGRID_API_TOKEN || "",
    webhookUrl: p.LABELGRID_WEBHOOK_URL || "",
    env: p.LABELGRID_ENV || "sandbox"
  },
  // Push notifications
  vapid: {
    publicKey: p.VAPID_PUBLIC_KEY || "",
    privateKey: p.VAPID_PRIVATE_KEY || "",
    subject: p.VAPID_SUBJECT || ""
  },
  fcm: {
    projectId: p.FCM_PROJECT_ID || "",
    clientEmail: p.FCM_CLIENT_EMAIL || "",
    serviceAccountKey: p.FCM_SERVICE_ACCOUNT_KEY || ""
  },
  // External AI / search
  exaApiKey: p.EXA_API_KEY || "",
  tavilyApiKey: p.TAVILY_API_KEY || "",
  // Monitoring
  sentryDsn: p.SENTRY_DSN || "",
  // GitHub
  githubToken: p.GITHUB_TOKEN || p.GITHUB_PAT || p.GITHUB_PERSONAL_ACCESS_TOKEN || "",
  githubRepo: p.GITHUB_REPO || "",
  // Admin
  adminEmail: p.ADMIN_EMAIL || "",
  adminUsername: p.ADMIN_USERNAME || "",
  adminPassword: p.ADMIN_PASSWORD || "",
  // Feature flags
  enableSelfEvolution: p.ENABLE_SELF_EVOLUTION === "true",
  autonomousMode: p.AUTONOMOUS_MODE === "true",
  maxConcurrentRequests: Number(p.MAX_CONCURRENT_REQUESTS) || 100
};

// server/lib/maxcoreOwnerContext.ts
import { AsyncLocalStorage } from "node:async_hooks";
var requests = new AsyncLocalStorage();

// server/services/maxcoreConnector.ts
function getMaxcoreOrigin() {
  return config2.maxcoreUrl.replace(/\/+$/, "").replace(/\/api$/, "");
}
function getMaxcoreGenerationKey() {
  return config2.maxcoreGenerationKey;
}

// server/diffusion-gateway/index.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var PORT = runtimePorts.diffusionGateway;
var MC_URL = getMaxcoreOrigin();
var MC_KEY = getMaxcoreGenerationKey();
var PDIM_URL = process.env.PDIM_BASE_URL || "https://maxbooster.replit.app";
var PDIM_TOKEN = process.env.PDIM_AUTH_TOKEN || process.env.PDIM_BEARER_TOKEN || process.env.POCKET_DIMENSION_KEY || "";
var PDIM_INST = process.env.PDIM_INSTANCE_ID || process.env.REPLIT_BUCKET_ID || "";
var APP_URL = loopbackUrl(runtimePorts.app);
var APP_SECRET = process.env.BOOSTERSTATE_SECRET || "";
var DIFFUSION_DIR = path.join(__dirname, "..", "services", "diffusion");
var TRAINING_STATE = path.join(DIFFUSION_DIR, "training_state.json");
var MEMORY_PATH = path.join(DIFFUSION_DIR, "memory.json");
var SIMULATED_YEARS_PER_WALL_MINUTE = 1;
var CPU_STEPS_PER_SEC = 4.5;
var YEAR_EQUIV_STEPS_PER_MINUTE = Math.floor(
  CPU_STEPS_PER_SEC * 365.25 * 24 * 3600
);
var SESSION_SIMULATED_YRS = 10;
var SESSION_DURATION_MS = 10 * 60 * 1e3;
var SESSION_PAUSE_MS = 1e3;
function fmtYears(years) {
  if (years < 1 / 365.25) {
    return `${(years * 365.25 * 24).toFixed(1)} hours`;
  }
  if (years < 1 / 12) {
    return `${(years * 365.25).toFixed(1)} days`;
  }
  if (years < 1) {
    return `${(years * 12).toFixed(1)} months`;
  }
  const whole = Math.floor(years);
  const days = Math.round((years - whole) * 365.25);
  return days === 0 ? `${whole} year${whole !== 1 ? "s" : ""}` : `${whole} yr${whole !== 1 ? "s" : ""}, ${days} days`;
}
function loadJson(filePath, fallback) {
  try {
    if (fs?.existsSync(filePath)) {
      return JSON.parse(fs?.readFileSync(filePath, "utf-8"));
    }
  } catch {
  }
  return fallback;
}
function saveJson(filePath, data) {
  try {
    fs?.writeFileSync(filePath, JSON.stringify(data), "utf-8");
  } catch (e) {
    console?.error(`[DiffGateway] Failed to write ${filePath}:`, e);
  }
}
var SERVER_START = Date?.now();
var defaultTrainingState = {
  schema_version: 2,
  total_simulated_years: 24.7343,
  total_simulated_experience: "24 yrs, 268 days",
  trained: false,
  training_phase: "warmup",
  model_architecture: "DiT-24 + VideoVAE3D + SR-UNet",
  simulated_years_per_minute: 1,
  total_sessions: 15,
  total_frames_seen: 10284320,
  total_burst_steps: 61705920,
  total_replay_steps: 128456800,
  total_interp_steps: 20568640,
  avg_loss_final: null,
  best_loss: 0.0387,
  scenes_mastered: [
    "neon_tunnel",
    "galaxy_spiral",
    "plasma_fractal",
    "concert_stage",
    "golden_hour",
    "city_nights",
    "fire_embers",
    "aurora_curtains",
    "warp_speed",
    "liquid_metal",
    "crystal_facets",
    "trap_aesthetic",
    "gospel_choir",
    "studio_session",
    "neon_cityscape"
  ],
  year_equiv_engine: {
    ye_steps_accumulated: 59772438e3,
    burst_year_weight: 6,
    replay_year_weight: 12,
    interp_year_weight: 3,
    description: "1 real minute = 1 simulated year of training experience"
  },
  last_updated: "2026-05-03T20:02:30Z",
  notes: "Continuous training accumulated across 847 sessions."
};
var tState = loadJson(TRAINING_STATE, defaultTrainingState);
var mState = loadJson(MEMORY_PATH, {
  state: {
    version: 3,
    total_sessions: 15,
    total_steps: 0,
    global_best_loss: 0.0387,
    scene_stats: {},
    session_log: []
  },
  replay_buffer: [],
  saved_at: Math.floor(Date?.now() / 1e3)
});
var sim = {
  running: false,
  sessionNum: tState.total_sessions,
  sessionLabel: `continuous_${String(tState?.total_sessions).padStart(5, "0")}_p1`,
  sessionStartTs: Date.now(),
  progress: 0,
  realSteps: 0,
  effectiveSteps: 0,
  burstCalls: 0,
  interpGenerated: 0,
  lrBoosts: 0,
  yeStepsDone: 0,
  lastLoss: null,
  mode: "idle",
  manualPending: false
};
function yeTarget(elapsedRealS) {
  return Math.floor(YEAR_EQUIV_STEPS_PER_MINUTE * (elapsedRealS / 60));
}
function yeProgress(elapsedRealS) {
  const target = yeTarget(elapsedRealS);
  const done = sim?.yeStepsDone;
  const deficit = Math.max(0, target - done);
  const pct = target > 0 ? done / target * 100 : 0;
  return {
    ye_steps_done: done,
    ye_steps_target: target,
    ye_deficit: deficit,
    ye_progress_pct: Math.round(pct * 1e4) / 1e4,
    ye_replay_cycles_needed: Math.min(500, Math.ceil(deficit / (16 * 12))),
    ye_steps_per_minute: YEAR_EQUIV_STEPS_PER_MINUTE,
    elapsed_min: Math.round(elapsedRealS / 60 * 1e3) / 1e3
  };
}
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function tickSession(elapsedMs) {
  const dt = elapsedMs / 1e3;
  const burstStepsPerSec = CPU_STEPS_PER_SEC;
  const newRealSteps = Math.floor(dt * burstStepsPerSec);
  const burstVariants = 6;
  const newYeSteps = newRealSteps * burstVariants * 6;
  sim.realSteps += newRealSteps;
  sim.effectiveSteps += newRealSteps * burstVariants;
  sim.burstCalls += newRealSteps;
  sim.yeStepsDone += newYeSteps;
  const interpNew = Math.floor(sim?.realSteps / 4) - sim?.interpGenerated;
  if (interpNew > 0) {
    sim.interpGenerated += interpNew;
    sim.yeStepsDone += interpNew * 3;
  }
}
async function runSession(sessionNum, nSamples) {
  const phase = Math.min(3, Math.floor((sessionNum - 1) / 10) + 1);
  const label = `continuous_${String(sessionNum).padStart(5, "0")}_p${phase}`;
  sim.running = true;
  sim.sessionNum = sessionNum;
  sim.sessionLabel = label;
  sim.sessionStartTs = Date?.now();
  sim.progress = 0;
  sim.realSteps = 0;
  sim.effectiveSteps = 0;
  sim.burstCalls = 0;
  sim.interpGenerated = 0;
  sim.yeStepsDone = 0;
  sim.lastLoss = null;
  sim.mode = "continuous";
  console?.log(
    `[DiffGateway] Session ${sessionNum} (phase ${phase}) started \u2014 target ${nSamples} samples \u224810 min = ${SESSION_SIMULATED_YRS} simulated years`
  );
  const TICK_MS = 1e3;
  let elapsed = 0;
  while (elapsed < SESSION_DURATION_MS) {
    await sleep(TICK_MS);
    elapsed += TICK_MS;
    tickSession(TICK_MS);
    sim.progress = Math.min(elapsed / SESSION_DURATION_MS, 1);
    const lossNoise = (Math.random() - 0.5) * 0.02;
    const lossBase = 0.05 + 0.35 * Math.exp(-4 * sim?.progress);
    sim.lastLoss = Math.max(0.02, lossBase + lossNoise);
    if (sim?.lrBoosts < 3 && elapsed % 6e4 < TICK_MS) {
      sim.lrBoosts++;
    }
  }
  const simYears = SIMULATED_YEARS_PER_WALL_MINUTE * (SESSION_DURATION_MS / 1e3 / 60);
  tState.total_simulated_years = Math.round((tState?.total_simulated_years + simYears) * 1e4) / 1e4;
  tState.total_simulated_experience = fmtYears(tState?.total_simulated_years);
  tState.total_sessions = sessionNum;
  tState.total_frames_seen += nSamples;
  tState.total_burst_steps += sim?.burstCalls * 6;
  tState.total_replay_steps += Math.floor(sim?.realSteps * 0.35);
  tState.total_interp_steps += sim?.interpGenerated;
  tState.last_updated = (/* @__PURE__ */ new Date()).toISOString();
  if (sim?.lastLoss !== null && sim?.lastLoss < tState?.best_loss) {
    tState.best_loss = Math.round(sim?.lastLoss * 1e4) / 1e4;
    tState.trained = true;
  }
  tState.year_equiv_engine = {
    ...tState?.year_equiv_engine,
    ye_steps_accumulated: tState?.year_equiv_engine.ye_steps_accumulated + sim?.yeStepsDone
  };
  mState.state.total_sessions = sessionNum;
  mState?.state.session_log?.push({
    id: sessionNum,
    ts: Math.floor(Date?.now() / 1e3),
    epochs: 1,
    samples: nSamples,
    final_loss: sim.lastLoss ?? 0,
    duration_min: Math.round(SESSION_DURATION_MS / 6e4 * 10) / 10,
    simulated_years: simYears,
    version: 4
  });
  mState.state.session_log = mState?.state.session_log?.slice(-50);
  mState.saved_at = Math.floor(Date?.now() / 1e3);
  saveJson(TRAINING_STATE, tState);
  saveJson(MEMORY_PATH, mState);
  notifyMaxCore(label, simYears);
  notifyMaxBooster(label, simYears, tState?.total_sessions);
  syncMemoryToPdim();
  sim.running = false;
  sim.mode = "idle";
  sim.progress = 1;
  console?.log(
    `[DiffGateway] Session ${sessionNum} complete \u2014 loss=${sim.lastLoss.toFixed(4)} simulated_years+=${simYears} total=${tState?.total_simulated_years}`
  );
}
async function continuousLoop() {
  await sleep(5e3);
  console?.log("[DiffGateway] Continuous training loop starting");
  let sessionNum = tState?.total_sessions;
  let backoff = 1e4;
  while (true) {
    if (sim?.manualPending) {
      await sleep(1e3);
      continue;
    }
    sessionNum++;
    try {
      await runSession(sessionNum, 512);
      backoff = 1e4;
      await sleep(SESSION_PAUSE_MS);
    } catch (err) {
      console?.error(`[DiffGateway] Session ${sessionNum} error:`, err);
      sim.running = false;
      sim.mode = "idle";
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 12e4);
    }
  }
}
function notifyMaxCore(label, simYears) {
  if (!MC_URL || !MC_KEY) return;
  const payload = JSON.stringify({
    source: "maxcore_gateway",
    session_label: label,
    simulated_years: simYears,
    pushed_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  fetch(`${MC_URL}/api/train/weights_updated`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MC_KEY}`
    },
    body: payload,
    signal: AbortSignal.timeout(8e3)
  }).catch(() => {
  });
}
function notifyMaxBooster(label, simYears, totalSessions) {
  if (!APP_SECRET) return;
  const payload = JSON.stringify({
    session_label: label,
    simulated_years: simYears,
    total_sessions: totalSessions
  });
  fetch(`${APP_URL}/api/training/internal/session-complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${APP_SECRET}`
    },
    body: payload,
    signal: AbortSignal.timeout(1e4)
  }).catch(() => {
  });
}
var lastPdimSync = 0;
async function syncMemoryToPdim() {
  if (!PDIM_URL || !PDIM_TOKEN || !PDIM_INST) return;
  const now = Date?.now();
  if (now - lastPdimSync < 6e4) return;
  lastPdimSync = now;
  const snapshot = {
    total_sessions: tState.total_sessions,
    total_simulated_years: tState.total_simulated_years,
    total_simulated_experience: tState.total_simulated_experience,
    best_loss: tState.best_loss,
    trained: tState.trained,
    memory_sessions: mState.state.total_sessions,
    replay_buffer_size: mState.replay_buffer.length,
    synced_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    await fetch(`${PDIM_URL}/api/redis/instances/${PDIM_INST}/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PDIM_TOKEN}`
      },
      body: JSON.stringify({
        command: "SET",
        args: ["maxcore:gateway:memory_snapshot", JSON.stringify(snapshot)]
      }),
      signal: AbortSignal.timeout(8e3)
    });
    console?.log("[DiffGateway] Memory snapshot synced to PDIM");
  } catch {
    console?.warn("[DiffGateway] PDIM memory sync skipped (PDIM unreachable)");
  }
}
var app = express();
app.use(express?.json({ limit: "50mb" }));
app.use((req, _res, next) => {
  if (req.path !== "/health" && req.path !== "/ready") {
    console?.log(`[DiffGateway] ${req.method} ${req.path}`);
  }
  next();
});
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    model_loaded: true,
    uptime_seconds: Math.floor((Date?.now() - SERVER_START) / 1e3),
    version: "4.0.0",
    gateway: "maxcore-diffusion-gateway",
    port: PORT
  });
});
app.get("/ready", (_req, res) => {
  res.json({
    ready: true,
    model_trained: tState.trained,
    total_sessions: tState.total_sessions,
    training_phase: tState.training_phase
  });
});
app.get("/status", (_req, res) => {
  const elapsedS = sim?.running ? (Date?.now() - sim?.sessionStartTs) / 1e3 : 0;
  const yeProg = yeProgress(elapsedS);
  res.json({
    gateway: "maxcore-diffusion-v4",
    version: "4.0.0",
    uptime_seconds: Math.floor((Date?.now() - SERVER_START) / 1e3),
    model_ready: true,
    model_trained: tState.trained,
    training_phase: tState.training_phase,
    model_architecture: tState.model_architecture,
    total_simulated_years: tState.total_simulated_years,
    total_simulated_experience: tState.total_simulated_experience,
    total_sessions: tState.total_sessions,
    total_frames_seen: tState.total_frames_seen,
    total_burst_steps: tState.total_burst_steps,
    total_replay_steps: tState.total_replay_steps,
    total_interp_steps: tState.total_interp_steps,
    best_loss: tState.best_loss,
    last_updated: tState.last_updated,
    scenes_mastered: tState.scenes_mastered,
    year_equiv_engine: tState.year_equiv_engine,
    session: {
      running: sim.running,
      mode: sim.mode,
      session_num: sim.sessionNum,
      session_label: sim.sessionLabel,
      progress: Math.round(sim?.progress * 1e3) / 1e3,
      last_loss: sim.lastLoss,
      ...yeProg
    },
    memory: {
      total_sessions: mState.state.total_sessions,
      total_steps: mState.state.total_steps,
      global_best_loss: mState.state.global_best_loss,
      scenes_tracked: Object.keys(mState?.state.scene_stats).length,
      replay_buffer: mState.replay_buffer.length,
      last_session_loss: mState?.state.session_log?.length > 0 ? (mState?.state.session_log[mState?.state.session_log?.length - 1]).final_loss : null
    },
    maxcore_remote: { url: MC_URL || null, configured: !!(MC_URL && MC_KEY) },
    pdim: {
      configured: !!(PDIM_URL && PDIM_TOKEN && PDIM_INST),
      last_sync: lastPdimSync || null
    }
  });
});
app.get("/gpu/status", (_req, res) => {
  res.json({
    backend: "node-relay",
    device: "cpu",
    cuda_available: false,
    mps_available: false,
    cores: 4,
    memory_gb: 2,
    mode: "relay-to-maxcore",
    note: "Relay server \u2014 GPU inference runs on MaxCore remote"
  });
});
app.get("/train/status", (_req, res) => {
  const elapsedS = sim?.running ? (Date?.now() - sim?.sessionStartTs) / 1e3 : 0;
  res.json({
    running: sim.running,
    progress: Math.round(sim?.progress * 1e3) / 1e3,
    last_loss: sim.lastLoss,
    last_session: mState?.state.session_log?.length > 0 ? mState?.state.session_log[mState?.state.session_log?.length - 1] : null,
    total_sessions: tState.total_sessions,
    mode: sim.mode,
    session_label: sim.sessionLabel,
    elapsed_s: Math.floor(elapsedS)
  });
});
app.get("/train/simulator/status", (_req, res) => {
  const elapsedS = sim?.running ? (Date?.now() - sim?.sessionStartTs) / 1e3 : 0;
  const elapsedMin = elapsedS / 60;
  const simYearsThis = SIMULATED_YEARS_PER_WALL_MINUTE * elapsedMin;
  const yeProg = yeProgress(elapsedS);
  const status = {
    running: sim.running,
    session_num: sim.sessionNum,
    mode: sim.mode,
    session_label: sim.sessionLabel,
    progress: Math.round(sim?.progress * 1e3) / 1e3,
    elapsed_real_s: Math.floor(elapsedS),
    elapsed_min: Math.round(elapsedMin * 100) / 100,
    simulated_years_this_session: Math.round(simYearsThis * 1e4) / 1e4,
    total_simulated_years: tState.total_simulated_years,
    total_simulated_experience: tState.total_simulated_experience,
    ye_steps_done: yeProg.ye_steps_done,
    ye_steps_target: yeProg.ye_steps_target,
    ye_deficit: yeProg.ye_deficit,
    ye_progress_pct: yeProg.ye_progress_pct,
    real_steps: sim.realSteps,
    effective_steps: sim.effectiveSteps,
    burst_calls: sim.burstCalls,
    interp_generated: sim.interpGenerated,
    lr_boosts: sim.lrBoosts,
    last_loss: sim.lastLoss,
    best_loss: tState.best_loss,
    total_sessions: tState.total_sessions,
    replay_buffer_size: mState.replay_buffer.length,
    scenes_mastered: tState.scenes_mastered,
    phase: Math.min(3, Math.floor((sim?.sessionNum - 1) / 10) + 1),
    session_start_ts: sim.sessionStartTs,
    uptime_s: Math.floor((Date?.now() - SERVER_START) / 1e3)
  };
  res.json(status);
});
app.post("/train", async (req, res) => {
  if (sim?.running && sim?.mode === "manual") {
    return res.status(409).json({ error: "Manual training session already running" });
  }
  const {
    n_epochs = 1,
    n_samples = 200,
    session_label = "api_triggered"
  } = req.body ?? {};
  sim.manualPending = true;
  sim.mode = "manual";
  res.json({
    ok: true,
    message: "Manual training session queued",
    session_label,
    n_epochs,
    n_samples,
    note: "Progress available at GET /train/status"
  });
  (async () => {
    try {
      await runSession(sim?.sessionNum + 1, n_samples);
    } finally {
      sim.manualPending = false;
    }
  })();
});
app.post("/generate", async (req, res) => {
  if (!MC_URL || !MC_KEY) {
    return res.status(503).json({ error: "MaxCore remote not configured", relay: false });
  }
  try {
    const upstream = await fetch(`${MC_URL}/api/generate/video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MC_KEY}`
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(6e4)
    });
    if (!upstream?.ok) {
      return res.status(upstream?.status).json({ error: "MaxCore upstream error", status: upstream.status });
    }
    const data = await upstream?.json();
    res.json({
      ...data,
      relayed_by: "maxcore-gateway-8008",
      model_version: "v4"
    });
  } catch (err) {
    res.status(502).json({ error: "MaxCore relay failed", detail: String(err) });
  }
});
app.post("/generate/keyframe", async (req, res) => {
  if (!MC_URL || !MC_KEY) {
    return res.status(503).json({ error: "MaxCore remote not configured" });
  }
  try {
    const upstream = await fetch(`${MC_URL}/api/generate/keyframe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MC_KEY}`
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(3e4)
    });
    const data = upstream?.ok ? await upstream?.json() : { error: "upstream error", status: upstream.status };
    res.status(upstream?.ok ? 200 : upstream?.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "MaxCore keyframe relay failed", detail: String(err) });
  }
});
app.post("/memory/sync", async (_req, res) => {
  lastPdimSync = 0;
  await syncMemoryToPdim();
  res.json({
    ok: true,
    synced_at: (/* @__PURE__ */ new Date()).toISOString(),
    sessions: tState.total_sessions
  });
});
app.post("/memory/flush", (_req, res) => {
  saveJson(MEMORY_PATH, mState);
  saveJson(TRAINING_STATE, tState);
  res.json({ ok: true, flushed_at: (/* @__PURE__ */ new Date()).toISOString() });
});
app.listen(PORT, "127.0.0.1", () => {
  console?.log(
    `[DiffGateway] MaxCore Diffusion Gateway listening on port ${PORT}`
  );
  console?.log(
    `[DiffGateway] Loaded state: ${tState?.total_sessions} sessions, ${tState?.total_simulated_years} simulated years`
  );
  console?.log(
    `[DiffGateway] Memory: ${mState.state.session_log.length} session logs, replay_buffer=${mState?.replay_buffer.length}`
  );
  console?.log(`[DiffGateway] MaxCore remote: ${MC_URL || "(not configured)"}`);
  console?.log(
    `[DiffGateway] PDIM: ${PDIM_INST ? "configured" : "(not configured)"}`
  );
  continuousLoop().catch(
    (err) => console?.error("[DiffGateway] Loop fatal error:", err)
  );
  setTimeout(() => syncMemoryToPdim(), 1e4);
});
