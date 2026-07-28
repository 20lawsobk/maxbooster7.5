/**
 * Max Booster — Self-Confinement Config
 *
 * Single entry point for all runtime configuration.
 * Exports a typed `config` object so the rest of the app never reads
 * process.env directly — making Max Booster 100% independent of the
 * host environment's injection order.
 *
 * Re-exports the full Zod-validated `env` and the environment helpers
 * from defaults.ts so callers only need one import.
 */

export { env } from "./env.js";
export {
  isProduction,
  isDevelopment,
  isReplitDeployment,
  isReplitWorkspace,
  getBaseUrl,
} from "./defaults.js";

// ─── Unified config object (self-confinement spec) ───────────────────────────

const p = process.env;

export const config = {
  // Core
  port: Number(p.PORT) || 5000,
  nodeEnv: (p.NODE_ENV as "development" | "production" | "test") || "development",

  // Database — prefer Neon URL, fall back to DATABASE_URL
  dbUrl:
    p.NEON_DATABASE_URL ||
    p.NEON_PRIMARY_URL ||
    p.DATABASE_URL ||
    "",

  // MaxCore AI
  maxcoreUrl: p.MAXCORE_URL || p.AI_SERVER_URL || "",
  maxcoreAdminKey: p.MAXCORE_ADMIN_KEY || p.AI_SERVER_KEY || "",
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
    clientSecret: p.GOOGLE_CLIENT_SECRET || "",
  },
  youtube: {
    clientId: p.YOUTUBE_CLIENT_ID || "",
    clientSecret: p.YOUTUBE_CLIENT_SECRET || "",
  },
  twitter: {
    apiKey: p.TWITTER_API_KEY || "",
    apiSecret: p.TWITTER_API_SECRET || "",
    clientId: p.TWITTER_CLIENT_ID || "",
    clientSecret: p.TWITTER_CLIENT_SECRET || "",
  },
  facebook: {
    appId: p.FACEBOOK_APP_ID || "",
    appSecret: p.FACEBOOK_APP_SECRET || "",
  },
  instagram: {
    appId: p.INSTAGRAM_APP_ID || "",
    appSecret: p.INSTAGRAM_APP_SECRET || "",
  },
  tiktok: {
    clientKey: p.TIKTOK_CLIENT_KEY || "",
    clientSecret: p.TIKTOK_CLIENT_SECRET || "",
    env: p.TIKTOK_ENV || "sandbox",
    sandboxClientKey: p.TIKTOK_SANDBOX_CLIENT_KEY || "",
    sandboxClientSecret: p.TIKTOK_SANDBOX_CLIENT_SECRET || "",
    sandboxRedirectUri: p.TIKTOK_SANDBOX_REDIRECT_URI || "",
    sandboxScopes: p.TIKTOK_SANDBOX_SCOPES || "",
  },
  spotify: {
    clientId: p.SPOTIFY_CLIENT_ID || "",
    clientSecret: p.SPOTIFY_CLIENT_SECRET || "",
  },
  threads: {
    appId: p.THREADS_APP_ID || "",
    appSecret: p.THREADS_APP_SECRET || "",
  },
  linkedin: {
    clientId: p.LINKEDIN_CLIENT_ID || "",
    clientSecret: p.LINKEDIN_CLIENT_SECRET || "",
  },

  // Music distribution
  labelgrid: {
    apiUrl: p.LABELGRID_API_URL || "https://api.labelgrid.com",
    apiToken: p.LABELGRID_API_TOKEN || "",
    webhookUrl: p.LABELGRID_WEBHOOK_URL || "",
    env: p.LABELGRID_ENV || "sandbox",
  },

  // Push notifications
  vapid: {
    publicKey: p.VAPID_PUBLIC_KEY || "",
    privateKey: p.VAPID_PRIVATE_KEY || "",
    subject: p.VAPID_SUBJECT || "",
  },
  fcm: {
    projectId: p.FCM_PROJECT_ID || "",
    clientEmail: p.FCM_CLIENT_EMAIL || "",
    serviceAccountKey: p.FCM_SERVICE_ACCOUNT_KEY || "",
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
  maxConcurrentRequests: Number(p.MAX_CONCURRENT_REQUESTS) || 100,
} as const;

export type Config = typeof config;
