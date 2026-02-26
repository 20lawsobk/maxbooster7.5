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
import { createSessionStore, getSessionConfig } from "./middleware/sessionConfig.ts";
import { ensureStripeProductsAndPrices } from "./services/stripeSetup.ts";
import { originValidation } from "./middleware/requestValidation.ts";
import path from "path";
import crypto from "crypto";

// MANDATORY safety imports - these MUST load successfully
import {
  initializeSafetyystems,
  applyMandatoryMiddleware,
  globalErrorHandler as safetyErrorHandler,
  sanitizationMiddleware,
  killSwitch,
  stripeRawBodyParser,
} from "./safety/index.ts";

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

setupStartupEndpoints(app);

app.use(compression({ level: 4, threshold: 1024 }));
app.use(cookieParser());
const httpServer = createServer(app);

// Trust proxy - REQUIRED for secure cookies and rate limiting behind Replit's reverse proxy
// Use 1 to trust exactly one proxy hop (Replit's reverse proxy) - prevents rate limit bypass
app.set('trust proxy', 1);

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
    limit: '5mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

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
      flushIntervalMs: 5000,
    });
    logger.info('✅ Database log transport initialized');
  } catch (error) {
    logger.warn('⚠️ Database log transport not initialized:', error instanceof Error ? error.message : String(error));
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

  try {
    // Try to create Redis session store for production-grade horizontal scaling
    activeSessionStore = await createSessionStore();
    const sessionConfig = getSessionConfig(activeSessionStore);
    app.use(session(sessionConfig));
    logger.info('✅ Production session store initialized (Redis)');
  } catch (error: any) {
    if (isProduction) {
      // In production, Redis is required - abort if unavailable
      logger.error('❌ CRITICAL: Cannot start production server without Redis session store');
      logger.error(`   └─ Error: ${error.message}`);
      process.exit(1);
    }

    // Development fallback: use memory store with warnings
    logger.warn('⚠️  Using in-memory session store (development only)');
    logger.warn('⚠️  Sessions will be lost on server restart');

    // Create MemoryStore and store reference for WebSocket auth
    const MemoryStore = session.MemoryStore;
    activeSessionStore = new MemoryStore();
    
    const devSessionConfig = {
      store: activeSessionStore,
      secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      name: 'sessionId',
      cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    };
    app.use(session(devSessionConfig));
  }
  
  // Export session store for WebSocket authentication
  (global as any).__activeSessionStore = activeSessionStore;

  // ========================================
  // REQUEST ORIGIN VALIDATION
  // ========================================
  app.use(originValidation);
  logger.info('✅ Origin validation enabled (SameSite=Lax + Origin header check)');

  // ========================================
  // INITIALIZE PRODUCTION SAFETY SYSTEMS
  // ========================================
  try {
    const safetyResult = await initializeSafetyystems();
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

  await registerRoutes(httpServer, app);

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

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      // Defer heavy autonomous systems initialization to background after server is listening
      // This allows the landing page to load immediately during cold starts
      setImmediate(async () => {
        logger.info('');
        logger.info('🤖 ═══════════════════════════════════════════════════════════');
        logger.info('🤖 INITIALIZING AUTONOMOUS SYSTEMS (background)');
        logger.info('🤖 ═══════════════════════════════════════════════════════════');

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

        // 0e. Pocket Dimension Fabric (Distributed storage layer)
        try {
          const { initializeFabric } = await import('./pocket-dimension/fabric/index.js');
          await initializeFabric();
          logger.info('✅ [PocketFabric] Distributed fabric storage initialized');
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
          }
        } catch (e: any) {
          logger.warn(`⚠️ [Autonomy] Autonomous Updates: ${e.message}`);
        }

        // 4-8. Other autonomous modules (load in parallel for speed)
        await Promise.allSettled([
          import('./autonomous-autopilot.js').then(mod => {
            if (mod.autonomousAutopilot) logger.info('✅ [Autonomy] Autonomous Autopilot loaded');
          }),
          import('./autopilot-engine.js').then(mod => {
            if (mod.autopilotEngine || mod.AutopilotEngine) logger.info('✅ [Autonomy] Autopilot Engine loaded');
          }),
          import('./services/autoPostingService.js').then(mod => {
            if (mod.autoPostingService) logger.info('✅ [Autonomy] Auto-Posting Service V1 initialized');
          }),
          import('./services/autoPostingServiceV2.js').then(mod => {
            if (mod.autoPostingServiceV2) logger.info('✅ [Autonomy] Auto-Posting Service V2 initialized');
          }),
          import('./services/autoPostGenerator.js').then(mod => {
            if (mod.autoPostGenerator) logger.info('✅ [Autonomy] Auto Post Generator initialized');
          }),
          import('./services/autopilotPublisher.js').then(mod => {
            if (mod.autopilotPublisher) logger.info('✅ [Autonomy] Autopilot Publisher initialized');
          }),
        ]);

        logger.info('🤖 ═══════════════════════════════════════════════════════════');
        logger.info('🤖 AUTONOMOUS SYSTEMS READY');
        import('./services/baseModelTrainer.js').then(({ runBaseModelTraining }) => {
          runBaseModelTraining().catch((e) => { logger.warn('[BaseTrainer] Background training error:', e instanceof Error ? e.message : String(e)); });
        }).catch(() => {});
        logger.info('🤖 ═══════════════════════════════════════════════════════════');
      });
    },
  );
})().catch((error) => {
  logger.error('FATAL: Server startup failed:', error);
  process.exit(1);
});

// Graceful shutdown — closes DB pool cleanly so in-flight requests and transactions complete
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`[Shutdown] Received ${signal}, starting graceful shutdown...`);
  try {
    const { pool } = await import('./db.js');
    await pool.end();
    logger.info('[Shutdown] Database pool closed');
  } catch (err) {
    logger.error('[Shutdown] Error during graceful shutdown:', err);
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error: Error) => {
  logger.error('[Process] Uncaught exception — shutting down:', error);
  gracefulShutdown('uncaughtException').finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('[Process] Unhandled promise rejection:', reason);
});
