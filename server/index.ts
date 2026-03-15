// Import console error filter FIRST to suppress non-critical localhost Redis errors
import "./lib/consoleErrorFilter.ts";
// Mandatory observability — must load before anything else can throw
import "./instrument.ts";

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes.ts";
import { serveStatic } from "./static.ts";
import { createServer } from "http";
import compression from "compression";
import { logger } from "./logger.ts";
import { setupStartupEndpoints } from "./startup-probes.ts";
import { verifyReadReplica } from "./db.ts";
import { createFallbackSessionStore, getSessionConfig } from "./middleware/sessionConfig.ts";
import { ensureStripeProductsAndPrices } from "./services/stripeSetup.ts";
import { originValidation } from "./middleware/requestValidation.ts";
import { cloudflareMiddleware, buildTrustProxyValue } from "./middleware/cloudflare.ts";
import path from "path";
import crypto from "crypto";

// MANDATORY safety imports - these MUST load successfully
import {
  initializeSafetySystems,
  applyMandatoryMiddleware,
  globalErrorHandler as safetyErrorHandler,
  sanitizationMiddleware,
  killSwitch,
  stripeRawBodyParser,
} from "./safety/index.ts";

// Scale infrastructure
import { distributedCache } from "./infrastructure/distributedCache.ts";
import prometheusRouter, { httpRequestDuration, httpRequestTotal } from "./routes/prometheus.ts";
import helmet from "helmet";

// Dynamic imports for monitoring services (optional)
let metricsCollector: any = null;
let alertingService: any = null;
let capacityMonitor: any = null;
let initializeRealtimeServer: any = null;
let initializeWorkers: any = null;

// Load optional monitoring modules (NOT security-critical)
async function loadOptionalModules() {
  try {
    const metrics = await import("./monitoring/metricsCollector.js");
    metricsCollector = metrics.metricsCollector;
  } catch (e) { /* Optional module */ }

  try {
    const alerting = await import("./monitoring/alertingService.js");
    alertingService = alerting.alertingService;
  } catch (e) { /* Optional module */ }

  try {
    const capacity = await import("./monitoring/capacityMonitor.js");
    capacityMonitor = capacity.CapacityMonitor;
  } catch (e) { /* Optional module */ }

  try {
    const realtime = await import("./realtime/index.js");
    initializeRealtimeServer = realtime.initializeRealtimeServer;
  } catch (e) { /* Optional module */ }

  try {
    const workers = await import("./workers/index.js");
    initializeWorkers = workers.initializeWorkers;
  } catch (e) { /* Optional module */ }
}

const app = express();

app.use(helmet({ contentSecurityPolicy: false })); // Security auto-fix

setupStartupEndpoints(app);

import('./lib/configValidator.js').then(({ validateScaleConfig }) => {
  validateScaleConfig();
}).catch(() => {});

app.use(compression({ level: 4, threshold: 1024 }));
app.use(cookieParser());
const httpServer = createServer(app);

// keepAliveTimeout MUST exceed the upstream load-balancer idle timeout (~60 s on Replit Autoscale).
// If Node closes a keep-alive socket before the LB does, the LB sends a request on a dead socket
// and returns a 502. 65 s keeps us safely above the LB window.
// headersTimeout must be strictly greater than keepAliveTimeout.
httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout   = 66_000;

// START LISTENING IMMEDIATELY so deployment health checks succeed.
// /health (registered above by setupStartupEndpoints) responds with 200 at once.
// Session middleware and API routes are wired up in the async IIFE below —
// requests that arrive before they are ready will get 404/503 for a few seconds,
// which is acceptable; the deployment health check only needs /health to pass.
{
  const _earlyPort = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    { port: _earlyPort, host: "0.0.0.0", reusePort: true },
    () => log(`serving on port ${_earlyPort} (early listen — full init in progress)`)
  );
}

// Trust proxy — configured for Cloudflare + Replit's reverse proxy.
// Using an IP allowlist (Cloudflare ranges + private/loopback) is more secure than a hop
// count: Express only trusts X-Forwarded-For when the socket connection itself comes from
// a listed IP, preventing clients from spoofing their IP by injecting header values.
app.set('trust proxy', buildTrustProxyValue());

// Cloudflare integration — extracts real client IP from CF-Connecting-IP (validated against
// Cloudflare's published IP ranges), adds no-store headers on /api routes, and annotates
// req.isBehindCloudflare / req.realClientIp for downstream middleware (rate limiter, audit log).
app.use(cloudflareMiddleware);

// ========================================
// MANDATORY SAFETY MIDDLEWARE (MUST LOAD)
// ========================================
// These are production-critical and will throw if they fail
try {
  applyMandatoryMiddleware(app);
  logger.info('✅ Mandatory safety middleware applied');
} catch (error: any) {
  logger.error('❌ CRITICAL: Failed to apply mandatory safety middleware');
  logger.error(`   └─ Error: ${error.message}`);
  process.exit(1);
}

// Apply input sanitization
app.use(sanitizationMiddleware);

// TikTok Developers Site Verification
app.get('/tiktok-developers-site-verification.txt', (_req, res) => {
  res.type('text/plain').send('tiktok-developers-site-verification=hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx');
});
app.get('/tiktok-developers-site-hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx', (_req, res) => {
  res.type('text/plain').send('tiktok-developers-site-verification=hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx');
});
app.get('/tiktokhnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx.txt', (_req, res) => {
  res.type('text/plain').send('tiktok-developers-site-verification=hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx');
});
app.get('/tiktokShgx3KxJb3b1mCeV8AHEsINRNKf2pmH5.txt', (_req, res) => {
  res.type('text/plain').send('tiktok-developers-site-verification=Shgx3KxJb3b1mCeV8AHEsINRNKf2pmH5');
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

// Session middleware is configured in the async initialization block below
// to support Redis session store for production

app.use(
  express.json({
    limit: '200mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

app.use(express.urlencoded({ extended: false }));

// Serve generated audio content from root public folder
app.use('/generated-content', express.static(path.join(process.cwd(), 'public', 'generated-content'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wav') || filePath.endsWith('.mp3')) {
      res.setHeader('Content-Type', filePath.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}));

app.use('/uploads/videos', express.static(path.join(process.cwd(), 'uploads', 'videos'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  logger.info(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && process.env.NODE_ENV !== 'production') {
        const responseStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${responseStr.length > 500 ? responseStr.substring(0, 500) + '...[truncated]' : responseStr}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Load optional modules first
  await loadOptionalModules();

  // Initialize database log transport for automatic log persistence
  // Only persists warn+ level logs to avoid performance impact
  try {
    const { initializeDatabaseLogTransport } = await import('./services/databaseLogTransport.js');
    initializeDatabaseLogTransport({
      minLevel: 'warn',
      batchSize: 10,
      flushIntervalMs: 30000,
    });
    logger.info('✅ Database log transport initialized');
  } catch (error) {
    logger.warn('⚠️ Database log transport not initialized:', error instanceof Error ? error.message : String(error));
  }

  // Start chain error auto-fixer — must run early so it catches errors from
  // autonomous systems, BullMQ workers, and PDIM during their own startup
  try {
    const { chainErrorAutoFixer } = await import('./services/chainErrorAutoFixer.js');
    chainErrorAutoFixer.start();
  } catch (e: any) {
    logger.warn(`[ChainFixer] Failed to start: ${e.message}`);
  }

  // ========================================
  // SESSION STORE INITIALIZATION (PRODUCTION-READY)
  // ========================================
  const isProduction = process.env.NODE_ENV === 'production';

  // Validate SESSION_SECRET in production - abort if missing or weak
  if (isProduction) {
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      logger.error('❌ CRITICAL: SESSION_SECRET environment variable is required in production');
      logger.error('❌ Cannot start server without secure session configuration');
      process.exit(1);
    }
    if (sessionSecret.length < 32) {
      logger.error('❌ CRITICAL: SESSION_SECRET must be at least 32 characters');
      process.exit(1);
    }
  }

  // Store reference to session store for WebSocket authentication
  let activeSessionStore: any = null;

  // FallbackSessionStore: always initializes PG first (guaranteed), then tries
  // Redis/PDIM. If PDIM is up → Redis is primary, PG is auto-fallback.
  // If PDIM is down → PG serves sessions immediately; Redis resumes when PDIM
  // comes back (checked every 30 s). Logins never fail due to PDIM being down.
  activeSessionStore = await createFallbackSessionStore();
  const sessionConfig = getSessionConfig(activeSessionStore);
  app.use(session(sessionConfig));
  logger.info('✅ Session store initialized (FallbackSessionStore: Redis/PDIM → PG)');

  // distributedCache.connect() is deferred to the setImmediate block below.
  // Keeping it here would stall route registration for up to ~20 s if PDIM is
  // rate-limiting at startup (3 retries × 5 s connectTimeout + back-off delays).
  // The cache falls back to in-memory until the deferred connect succeeds.

  // Export session store for WebSocket authentication
  (global as any).__activeSessionStore = activeSessionStore;

  // ========================================
  // REQUEST ORIGIN VALIDATION
  // ========================================
  app.use(originValidation);
  logger.info('✅ Origin validation enabled (SameSite=Lax + Origin header check)');

  // Verify read replica once at startup. On failure dbRead is permanently
  // re-pointed to the primary with a loud error — no per-query try/catch needed.
  try {
    await verifyReadReplica();
  } catch (e: any) {
    logger.error(`[db] Failed to run replica verification: ${e.message}`);
  }

  // ========================================
  // INITIALIZE PRODUCTION SAFETY SYSTEMS
  // ========================================
  try {
    const safetyResult = await initializeSafetySystems();
    if (!safetyResult.success) {
      logger.warn(`⚠️ Safety systems initialized with warnings: ${safetyResult.errors.join(', ')}`);
    }
  } catch (error: any) {
    logger.error('⚠️ Safety systems initialization error:', error.message);
  }

  // Initialize monitoring services
  try {
    if (metricsCollector?.start) {
      metricsCollector.start();
      logger.info('Metrics collector started');
    }
  } catch (e) {
    logger.warn('Metrics collector not available');
  }

  try {
    if (alertingService?.start) {
      alertingService.start();
      logger.info('Alerting service started');
    }
  } catch (e) {
    logger.warn('Alerting service not available');
  }

  try {
    if (capacityMonitor?.start) {
      capacityMonitor.start();
      logger.info('Capacity monitor started');
    }
  } catch (e) {
    logger.warn('Capacity monitor not available');
  }

  // Initialize realtime WebSocket server for studio collaboration
  try {
    if (typeof initializeRealtimeServer === 'function') {
      // Pass the already-initialized session store to WebSocket for secure authentication
      const { setSessionStore } = await import('./realtime/index.js');
      if (typeof setSessionStore === 'function' && activeSessionStore) {
        setSessionStore(activeSessionStore);
      }
      initializeRealtimeServer(httpServer);
      logger.info('Realtime collaboration server initialized');
    }
  } catch (e) {
    logger.warn('Realtime server not available');
  }

  // Initialize background workers
  try {
    if (typeof initializeWorkers === 'function') {
      await initializeWorkers();
      logger.info('Background workers initialized');
    }
  } catch (e) {
    logger.warn('Workers not available');
  }

  // Initialize TensorFlow worker pool — keeps inference off the HTTP event loop
  try {
    const { tfWorkerPool } = await import('./lib/tensorflowWorkerPool.js');
    await tfWorkerPool.initialize();
    // Load all persisted models into worker threads so inference is immediately available
    try {
      const { mlModelRegistry } = await import('./services/mlModelRegistry.js');
      await tfWorkerPool.loadAllModels(mlModelRegistry);
    } catch (modelErr: any) {
      logger.warn(`[TFWorkerPool] Model preload skipped: ${modelErr.message}`);
    }
  } catch (e: any) {
    logger.warn(`[TFWorkerPool] Initialization skipped: ${e.message}`);
  }

  // Autonomous systems initialization is deferred to after server starts
  // to ensure fast cold start times for landing page loading

  // Block write operations for demo users (read-only mode)
  try {
    const { blockDemoWrite } = await import('./auth.js');
    app.use('/api', blockDemoWrite);
    logger.info('✅ Demo write protection applied');
  } catch (e: any) {
    logger.warn(`⚠️ Demo write protection not available: ${e.message}`);
  }

  // Apply scalable rate limiter for high-load scenarios
  try {
    const { globalScalableRateLimiter } = await import('./middleware/scalableRateLimiter.js');
    app.use('/api', globalScalableRateLimiter);
    logger.info('✅ Scalable rate limiter applied');
  } catch (e: any) {
    logger.warn(`⚠️ Rate limiter not available: ${e.message}`);
  }

  // Admission control — shed excess concurrent requests to protect the DB under spike load
  try {
    const { admissionControl } = await import('./middleware/admissionControl.js');
    app.use('/api', admissionControl);
    logger.info('✅ Admission control applied (max concurrent: ' + (process.env.MAX_CONCURRENT_REQUESTS ?? '5000') + ')');
  } catch (e: any) {
    logger.warn(`⚠️ Admission control not available: ${e.message}`);
  }

  // API response cache - invalidate on mutations, cache on reads
  try {
    const { invalidateCacheOnMutation, cacheMiddleware } = await import('./middleware/apiCache.js');
    app.use('/api', invalidateCacheOnMutation());
    
    // Apply response caching to high-traffic read endpoints
    const cachedRoutes: Record<string, number> = {
      '/api/auth/me': 15,
      '/api/projects': 20,
      '/api/studio/projects': 20,
      '/api/analytics/dashboard': 60,
      '/api/marketplace/beats': 30,
      '/api/notifications': 10,
      '/api/royalties/summary': 60,
      '/api/achievements': 120,
    };
    
    // Single middleware that handles all cached routes
    // Uses req.path (without query string) for route matching, but cache key includes query
    const routeCacheMiddleware = (req: any, res: any, next: any) => {
      if (req.method !== 'GET') return next();
      const basePath = req.path.replace(/\/$/, '') || req.path;
      const ttl = cachedRoutes[basePath];
      if (ttl) {
        return cacheMiddleware({ ttlSeconds: ttl, varyByUser: true })(req, res, next);
      }
      next();
    };
    app.use(routeCacheMiddleware);
    
    logger.info(`✅ API response cache initialized (${Object.keys(cachedRoutes).length} cached routes)`);
  } catch (e: any) {
    logger.warn(`⚠️ API cache middleware: ${e.message}`);
  }

  // Prometheus metrics endpoint (before routes so it's always reachable)
  app.use(prometheusRouter);

  // HTTP request duration instrumentation for Prometheus
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const route = req.route?.path || req.path.replace(/\/[0-9a-f-]{36}/gi, '/:id') || 'unknown';
      const durationSecs = (Date.now() - start) / 1000;
      const labels = { method: req.method, route, status_code: String(res.statusCode) };
      httpRequestDuration.observe(labels, durationSecs);
      httpRequestTotal.inc(labels);
    });
    next();
  });

  await registerRoutes(httpServer, app);

  // Start retention background services
  try {
    const { reEngagementService } = await import('./services/reEngagementService.js');
    reEngagementService.startDailyCron();
    logger.info('[Retention] Re-engagement cron started');

    const { recoverStaleProcessingBatches } = await import('./services/featureEventBuffer.js');
    await recoverStaleProcessingBatches();

    const { getRetentionQueue, startRetentionWorker } = await import('./lib/scaleJobQueue.js');
    const retentionQueue = getRetentionQueue();
    startRetentionWorker();

    setInterval(async () => {
      try {
        await retentionQueue.add('dunning-process', { limit: 50 });
      } catch (e) { /* non-critical */ }
    }, 6 * 60 * 60 * 1000);
    logger.info('[Retention] Dunning processor enqueued (6h interval)');

    setInterval(async () => {
      try {
        await retentionQueue.add('health-score-batch', { cursor: 0, batchSize: 100 });
      } catch (e) { /* non-critical */ }
    }, 24 * 60 * 60 * 1000);
    logger.info('[Retention] Health score batch processor enqueued (24h interval)');

    setInterval(async () => {
      try {
        await retentionQueue.add('feature-event-flush', {});
      } catch (e) { /* non-critical */ }
    }, 60 * 1000);
    logger.info('[Retention] Feature event buffer flush enqueued (60s interval)');

    // Engagement analytics refresh: collect real engagement data from platform APIs
    // for all active campaigns every 8 hours (platform API rate-limit friendly)
    setInterval(async () => {
      try {
        const { advertisingDispatchService } = await import('./services/advertisingDispatchService.js');
        await advertisingDispatchService.collectAllActiveEngagement();
      } catch (e: any) { logger.warn('[Engagement] Refresh failed (non-fatal):', e?.message); }
    }, 8 * 60 * 60 * 1000);
    logger.info('[Engagement] Social engagement refresh cron started (8h interval)');
  } catch (retentionErr: any) {
    const errMsg = retentionErr instanceof Error
      ? `${retentionErr.message}\n${retentionErr.stack}`
      : String(retentionErr);
    logger.warn('[Retention] Background services failed to start:\n' + errMsg);
  }

  // JSON 404 handler for unmatched API routes (must be after all API routes)
  // This prevents the SPA fallback from returning HTML for missing API endpoints
  // Uses path-agnostic approach to respect multi-handler pipelines
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!res.headersSent && req.originalUrl.startsWith('/api/')) {
      return res.status(404).json({
        error: 'Not found',
        message: `API endpoint ${req.originalUrl} does not exist`,
        status: 404
      });
    }
    return next();
  });

  // SEO routes must be registered before global error handler so their errors are caught
  try {
    const seoRoutes = (await import('./routes/seo.js')).default;
    app.use(seoRoutes);
  } catch (e: any) {
    logger.warn(`⚠️ SEO routes not available: ${e.message}`);
  }

  // MANDATORY global error handler (from safety module) - must be LAST middleware
  app.use(safetyErrorHandler);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app);
  }

  // Python AI microservice replaced by MaxCore (https://secure-ai-forge.replit.app)

  // Server is already listening (early listen above). Kick off deferred init now.
  log(`all middleware and routes registered — kicking off autonomous systems`);
  setImmediate(async () => {
        logger.info('');
        logger.info('🤖 ═══════════════════════════════════════════════════════════');
        logger.info('🤖 INITIALIZING AUTONOMOUS SYSTEMS (background)');
        logger.info('🤖 ═══════════════════════════════════════════════════════════');

        // 0-pre. Distributed cache — deferred so PDIM rate-limit retries don't
        // stall route registration.  Falls back to in-memory until connected.
        try {
          await distributedCache.connect();
          logger.info('✅ [DistributedCache] Connected (deferred)');
        } catch (e: any) {
          logger.warn(`⚠️ Distributed cache connect failed (non-fatal, in-memory fallback active): ${e.message}`);
        }

        // 0a. Stripe products — network call, not needed before first payment request
        try {
          const priceIds = await ensureStripeProductsAndPrices();
          logger.info('✅ Stripe products and prices initialized');
          logger.info(`   Monthly: ${priceIds.monthly} | Yearly: ${priceIds.yearly} | Lifetime: ${priceIds.lifetime}`);
        } catch (e: any) {
          logger.error(`❌ Failed to initialize Stripe prices: ${e.message}`);
        }

        // 0b. Admin account seeding — idempotent, safe to run after listen
        try {
          const { initializeAdmin } = await import('./init-admin.js');
          await initializeAdmin();
          logger.info('✅ Admin account initialized');
        } catch (e: any) {
          logger.error(`❌ Failed to initialize admin: ${e.message}`);
        }

        // 0c. Onboarding task seeding
        try {
          const { onboardingService } = await import('./services/onboardingService.js');
          await onboardingService.seedDefaultTasks();
          await onboardingService.ensureAITasksExist();
        } catch (e: any) {
          logger.warn(`⚠️ Could not seed onboarding tasks: ${e.message}`);
        }

        // 0d. Hybrid Storage System (Replit hot + Pocket Dimension cold)
        try {
          const { hybridStorageService } = await import('./services/hybridStorageService.js');
          await hybridStorageService.initialize();
          logger.info('✅ [Storage] Hybrid Storage initialized (Replit Object Storage + Pocket Dimension)');

          const autoTierInterval = 6 * 60 * 60 * 1000;
          setInterval(async () => {
            try {
              const result = await hybridStorageService.runAutoTiering();
              if (result.tieredDown > 0 || result.tieredUp > 0) {
                logger.info(`[Storage] Auto-tiering: ${result.tieredDown} files moved to cold, ${result.tieredUp} promoted to hot`);
              }
            } catch (e: any) {
              logger.warn(`[Storage] Auto-tiering error: ${e.message}`);
            }
          }, autoTierInterval);
          logger.info('✅ [Storage] Auto-tiering scheduler started (every 6 hours)');
        } catch (e: any) {
          logger.warn(`⚠️ [Storage] Hybrid Storage init: ${e.message}`);
        }

        // 0e. Pocket Dimension Fabric (Distributed storage layer + Auto-cluster)
        try {
          const { initializeFabric, autoClusterManager } = await import('./pocket-dimension/fabric/index.js');
          await initializeFabric();
          logger.info('✅ [PocketFabric] Distributed fabric storage initialized');
          killSwitch.registerSystem('pocket-fabric-autocluster', {
            kill: () => autoClusterManager.stop(),
            resume: () => autoClusterManager.start(),
          });
        } catch (e: any) {
          logger.warn(`⚠️ [PocketFabric] Fabric init: ${e.message}`);
        }

        // 1. Autonomous Service (Core)
        try {
          const mod = await import('./services/autonomousService.js');
          const svc = mod.autonomousService;
          if (svc && typeof svc.getStatus === 'function') {
            const status = svc.getStatus();
            logger.info(`✅ [Autonomy] Autonomous Service initialized - Running: ${status.isRunning}`);
            killSwitch.registerSystem('autonomous-service', {
              kill: () => { if (typeof svc.stopAutonomousOperations === 'function') svc.stopAutonomousOperations(); },
              resume: () => { if (typeof svc.startAutonomousOperations === 'function') svc.startAutonomousOperations(); },
            });
          }
        } catch (e: any) {
          logger.warn(`⚠️ [Autonomy] Autonomous Service: ${e.message}`);
        }

        // 2. Automation System
        try {
          const mod = await import('./automation-system.js');
          const AutomationSystemClass = mod.AutomationSystem ?? mod.default;
          if (AutomationSystemClass && typeof AutomationSystemClass.getInstance === 'function') {
            const system = AutomationSystemClass.getInstance();
            logger.info('✅ [Autonomy] Automation System initialized');
            killSwitch.registerSystem('automation-system', {
              kill: () => { (system as any)._killSwitchPaused = true; logger.warn('[AutomationSystem] Paused by kill switch'); },
              resume: () => { (system as any)._killSwitchPaused = false; logger.info('[AutomationSystem] Resumed'); },
            });
          }
        } catch (e: any) {
          logger.warn(`⚠️ [Autonomy] Automation System: ${e.message}`);
        }

        // 3. Autonomous Updates Orchestrator
        try {
          const mod = await import('./autonomous-updates.js');
          const orchestrator = mod.autonomousUpdates ?? mod.AutonomousUpdatesOrchestrator;
          if (orchestrator) {
            if (typeof orchestrator.configure === 'function') {
              await orchestrator.configure({
                enabled: true,
                frequency: 'hourly',
                industryMonitoringEnabled: true,
                aiTuningEnabled: true,
                platformOptimizationEnabled: true,
              });
            } else if (typeof orchestrator.start === 'function') {
              await orchestrator.start();
            }
            logger.info('✅ [Autonomy] Auto-Upgrade System ENABLED');
            killSwitch.registerSystem('autonomous-updates', {
              kill: () => { if (typeof orchestrator.stop === 'function') orchestrator.stop(); },
              resume: () => { if (typeof orchestrator.start === 'function') orchestrator.start(); },
            });
          }
        } catch (e: any) {
          logger.warn(`⚠️ [Autonomy] Autonomous Updates: ${e.message}`);
        }

        // 4-9. Other autonomous modules — load in parallel then register with kill switch
        const parallelMods = await Promise.allSettled([
          import('./autonomous-autopilot.js'),
          import('./autopilot-engine.js'),
          import('./services/autoPostingService.js'),
          import('./services/autoPostingServiceV2.js'),
          import('./services/autoPostGenerator.js'),
          import('./services/autopilotPublisher.js'),
        ]);

        // 4. Autonomous Autopilot
        if (parallelMods[0].status === 'fulfilled') {
          const mod = parallelMods[0].value as any;
          if (mod.autonomousAutopilot) {
            logger.info('✅ [Autonomy] Autonomous Autopilot loaded');
            killSwitch.registerSystem('autonomous-autopilot', {
              kill: () => { if (typeof mod.autonomousAutopilot.stopAutonomousMode === 'function') mod.autonomousAutopilot.stopAutonomousMode(); },
              resume: () => { logger.info('[AutonomousAutopilot] Kill switch released — restart per-user as needed'); },
            });
          }
        } else logger.warn(`⚠️ [Autonomy] Autonomous Autopilot: ${(parallelMods[0] as any).reason?.message}`);

        // 5. Autopilot Engine
        if (parallelMods[1].status === 'fulfilled') {
          const mod = parallelMods[1].value as any;
          const engine = mod.autopilotEngine ?? (mod.AutopilotEngine ? new mod.AutopilotEngine() : null);
          if (engine) {
            logger.info('✅ [Autonomy] Autopilot Engine loaded');
            killSwitch.registerSystem('autopilot-engine', {
              kill: () => { if (typeof engine.stop === 'function') engine.stop(); },
              resume: () => { if (typeof engine.start === 'function') engine.start(); },
            });
          }
        } else logger.warn(`⚠️ [Autonomy] Autopilot Engine: ${(parallelMods[1] as any).reason?.message}`);

        // 6. Auto-Posting Service V1
        if (parallelMods[2].status === 'fulfilled') {
          const mod = parallelMods[2].value as any;
          if (mod.autoPostingService) {
            logger.info('✅ [Autonomy] Auto-Posting Service V1 initialized');
            killSwitch.registerSystem('auto-posting-v1', {
              kill: () => { if (typeof mod.autoPostingService.pause === 'function') mod.autoPostingService.pause(); },
              resume: () => { if (typeof mod.autoPostingService.resume === 'function') mod.autoPostingService.resume(); },
            });
          }
        } else logger.warn(`⚠️ [Autonomy] Auto-Posting V1: ${(parallelMods[2] as any).reason?.message}`);

        // 7. Auto-Posting Service V2
        if (parallelMods[3].status === 'fulfilled') {
          const mod = parallelMods[3].value as any;
          if (mod.autoPostingServiceV2) {
            logger.info('✅ [Autonomy] Auto-Posting Service V2 initialized');
            killSwitch.registerSystem('auto-posting-v2', {
              kill: () => { if (typeof mod.autoPostingServiceV2.pause === 'function') mod.autoPostingServiceV2.pause(); },
              resume: () => { if (typeof mod.autoPostingServiceV2.resume === 'function') mod.autoPostingServiceV2.resume(); },
            });
          }
        } else logger.warn(`⚠️ [Autonomy] Auto-Posting V2: ${(parallelMods[3] as any).reason?.message}`);

        // 8. Auto Post Generator (stateless — no running loop; kill switch flag surfaced via log)
        if (parallelMods[4].status === 'fulfilled') {
          const mod = parallelMods[4].value as any;
          if (mod.autoPostGenerator) {
            logger.info('✅ [Autonomy] Auto Post Generator initialized');
            killSwitch.registerSystem('auto-post-generator', {
              kill: () => { (mod.autoPostGenerator as any)._killed = true; logger.warn('[AutoPostGenerator] Paused by kill switch'); },
              resume: () => { (mod.autoPostGenerator as any)._killed = false; logger.info('[AutoPostGenerator] Resumed'); },
            });
          }
        } else logger.warn(`⚠️ [Autonomy] Auto Post Generator: ${(parallelMods[4] as any).reason?.message}`);

        // 9. Autopilot Publisher
        if (parallelMods[5].status === 'fulfilled') {
          const mod = parallelMods[5].value as any;
          if (mod.autopilotPublisher) {
            logger.info('✅ [Autonomy] Autopilot Publisher initialized');
            killSwitch.registerSystem('autopilot-publisher', {
              kill: () => { if (typeof mod.autopilotPublisher.stopScheduler === 'function') mod.autopilotPublisher.stopScheduler(); },
              resume: () => { if (typeof mod.autopilotPublisher.startScheduler === 'function') mod.autopilotPublisher.startScheduler(); },
            });
          }
        } else logger.warn(`⚠️ [Autonomy] Autopilot Publisher: ${(parallelMods[5] as any).reason?.message}`);

        logger.info('🤖 ═══════════════════════════════════════════════════════════');
        logger.info('🤖 AUTONOMOUS SYSTEMS READY');
        import('./services/baseModelTrainer.js').then(({ runBaseModelTraining }) => {
          runBaseModelTraining().catch((e) => { logger.warn('[BaseTrainer] Background training error:', e instanceof Error ? e.message : String(e)); });
        }).catch(() => {});

        // Diffusion self-training: starts 60s after boot so server is stable first
        setTimeout(() => {
          import('./services/diffusionBackgroundTrainer.js').then(({ startBackgroundTraining }) => {
            startBackgroundTraining();
            logger.info('🎬 [DiffBG] Diffusion self-training loop started — model will continuously improve in the background');
          }).catch((e) => logger.warn('[DiffBG] Could not start background trainer:', e?.message));
        }, 60_000);

        logger.info('🤖 ═══════════════════════════════════════════════════════════');
      });
})().catch((error) => {
  logger.error('FATAL: Server startup failed:', error);
  process.exit(1);
});

// Graceful shutdown — stops accepting new connections, drains in-flight requests,
// then closes the DB pool. Hard-exits after 10 s so autoscale SIGKILL is never needed.
async function gracefulShutdown(signal: string, exitCode = 0): Promise<void> {
  logger.info(`[Shutdown] Received ${signal}, starting graceful shutdown...`);

  // Hard deadline: exit no matter what after 10 s (autoscale gives ~30 s before SIGKILL).
  const hardExit = setTimeout(() => {
    logger.error('[Shutdown] Hard timeout reached — forcing exit');
    process.exit(exitCode);
  }, 10_000);
  hardExit.unref(); // do not keep the event loop alive just for this timer

  try {
    // 1. Stop the HTTP server so the load balancer stops routing new requests here.
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    logger.info('[Shutdown] HTTP server closed');
  } catch (err) {
    logger.error('[Shutdown] Error closing HTTP server:', err);
  }

  try {
    // 2. Close the database pool so in-flight queries complete before the process exits.
    const { pool } = await import('./db.js');
    await pool.end();
    logger.info('[Shutdown] Database pool closed');
  } catch (err) {
    logger.error('[Shutdown] Error during graceful shutdown:', err);
  }

  clearTimeout(hardExit);
  process.exit(exitCode);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));

process.on('uncaughtException', (error: Error) => {
  // EPIPE/ECONNRESET/ECONNABORTED are non-fatal stream/pipe errors (e.g. FFmpeg exits mid-render)
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EPIPE' || code === 'ECONNRESET' || code === 'ECONNABORTED') return;
  logger.error('[Process] Uncaught exception — shutting down:', error);
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('[Process] Unhandled promise rejection (non-fatal):', reason);
});
