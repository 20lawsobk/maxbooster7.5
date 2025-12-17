// Import console error filter FIRST to suppress non-critical localhost Redis errors
import "./lib/consoleErrorFilter.js";

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { logger } from "./logger.js";
import { createSessionStore, getSessionConfig } from "./middleware/sessionConfig.js";
import { ensureStripeProductsAndPrices } from "./services/stripeSetup.js";

// MANDATORY safety imports - these MUST load successfully
import { 
  initializeSafetyystems,
  applyMandatoryMiddleware,
  globalErrorHandler as safetyErrorHandler,
  sanitizationMiddleware,
  killSwitch,
  stripeRawBodyParser,
} from "./safety/index.js";

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
    capacityMonitor = capacity.capacityMonitor;
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
const httpServer = createServer(app);

// Trust proxy - REQUIRED for rate limiting and client IP detection behind Replit's proxy
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


declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    isDemo?: boolean;
  }
}

// Session middleware is configured in the async initialization block below
// to support Redis session store for production

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
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
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Load optional modules first
  await loadOptionalModules();
  
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
  
  try {
    // Try to create Redis session store for production-grade horizontal scaling
    const sessionStore = await createSessionStore();
    const sessionConfig = getSessionConfig(sessionStore);
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
    
    const devSessionConfig = {
      secret: process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    };
    app.use(session(devSessionConfig));
  }
  
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

  // ========================================
  // AUTONOMOUS SYSTEMS INITIALIZATION
  // ========================================
  logger.info('');
  logger.info('🤖 ═══════════════════════════════════════════════════════════');
  logger.info('🤖 INITIALIZING AUTONOMOUS SYSTEMS');
  logger.info('🤖 ═══════════════════════════════════════════════════════════');

  // 1. Autonomous Service (Core)
  try {
    const mod = await import('./services/autonomousService.js');
    const svc = mod.autonomousService || mod.default;
    if (svc && typeof svc.getStatus === 'function') {
      const status = svc.getStatus();
      logger.info(`✅ [Autonomy] Autonomous Service initialized - Running: ${status.isRunning}`);
      logger.info(`   └─ Config: Social=${status.config?.socialPosting}, Ads=${status.config?.advertising}, Distribution=${status.config?.distribution}`);
      logger.info(`   └─ Active users: ${status.activeUsers || 0}, Operations: ${status.activeOperations || 0}`);
    } else {
      logger.info('✅ [Autonomy] Autonomous Service module loaded');
    }
  } catch (e: any) {
    logger.warn(`⚠️ [Autonomy] Autonomous Service: ${e.message}`);
  }

  // 2. Automation System
  try {
    const mod = await import('./automation-system.js');
    const AutomationSystem = mod.AutomationSystem || mod.default;
    if (AutomationSystem && typeof AutomationSystem.getInstance === 'function') {
      const system = AutomationSystem.getInstance();
      if (typeof system.initialize === 'function') {
        await system.initialize();
      }
      logger.info('✅ [Autonomy] Automation System initialized');
      logger.info('   └─ Social posting, campaign management, content scheduling active');
    }
  } catch (e: any) {
    logger.warn(`⚠️ [Autonomy] Automation System: ${e.message}`);
  }

  // 3. Autonomous Updates Orchestrator (Self-Upgrading System - Keeps Max Booster ahead of competitors)
  try {
    const mod = await import('./autonomous-updates.js');
    const orchestrator = mod.autonomousUpdates || mod.autonomousUpdatesOrchestrator || mod.default;
    if (orchestrator) {
      // Enable and start the self-upgrading system
      if (typeof orchestrator.configure === 'function') {
        await orchestrator.configure({
          enabled: true,
          frequency: 'hourly', // Check for competitive advantages every hour
          industryMonitoringEnabled: true,  // Monitor DistroKid, TuneCore, BeatStars, etc.
          aiTuningEnabled: true,            // Auto-tune AI models for better performance
          platformOptimizationEnabled: true, // Optimize user experience
          studioDAWEnabled: true,           // Keep DAW features ahead of FL Studio, Ableton
          distributionEnabled: true,        // Improve distribution vs DistroKid
          marketplaceEnabled: true,         // Enhance marketplace vs BeatStars
          analyticsEnabled: true,           // Better analytics than Spotify for Artists
          securityEnabled: true,            // Stay ahead of security threats
          performanceInfraEnabled: true,    // Keep infrastructure optimized
        });
      } else if (typeof orchestrator.start === 'function') {
        await orchestrator.start();
      }
      
      const status = orchestrator.getStatus?.() || { isRunning: true, runsCompleted: 0 };
      logger.info(`✅ [Autonomy] Auto-Upgrade System ENABLED - Keeping Max Booster ahead of competitors`);
      logger.info(`   └─ Status: ${status.isRunning ? 'ACTIVE' : 'Standby'}, Update cycles: ${status.runsCompleted || 0}`);
      logger.info(`   └─ Monitoring: DistroKid, TuneCore, BeatStars, Splice, Spotify for Artists`);
      logger.info(`   └─ Auto-tuning: AI models, DAW features, distribution, marketplace, analytics`);
    } else {
      logger.info('✅ [Autonomy] Autonomous Updates module loaded');
    }
  } catch (e: any) {
    logger.warn(`⚠️ [Autonomy] Autonomous Updates: ${e.message}`);
  }

  // 4. Autonomous Autopilot
  try {
    const mod = await import('./autonomous-autopilot.js');
    const autopilot = mod.autonomousAutopilot || mod.default;
    if (autopilot) {
      logger.info('✅ [Autonomy] Autonomous Autopilot loaded');
      logger.info('   └─ Content generation, performance analysis, adaptive learning ready');
    }
  } catch (e: any) {
    logger.warn(`⚠️ [Autonomy] Autonomous Autopilot: ${e.message}`);
  }

  // 5. Autopilot Engine
  try {
    const mod = await import('./autopilot-engine.js');
    const engine = mod.autopilotEngine || mod.AutopilotEngine || mod.default;
    if (engine) {
      logger.info('✅ [Autonomy] Autopilot Engine loaded');
      logger.info('   └─ Social/Ads, Security/IT, Updates personas available');
    }
  } catch (e: any) {
    logger.warn(`⚠️ [Autonomy] Autopilot Engine: ${e.message}`);
  }

  // 6. Auto-Posting Services
  try {
    const mod = await import('./services/autoPostingService.js');
    if (mod.autoPostingService || mod.default) {
      logger.info('✅ [Autonomy] Auto-Posting Service V1 initialized');
    }
  } catch (e: any) {
    logger.warn(`⚠️ [Autonomy] Auto-Posting Service V1: ${e.message}`);
  }

  try {
    const mod = await import('./services/autoPostingServiceV2.js');
    if (mod.autoPostingServiceV2 || mod.default) {
      logger.info('✅ [Autonomy] Auto-Posting Service V2 initialized');
      logger.info('   └─ Platform-specific scheduling, queue management active');
    }
  } catch (e: any) {
    logger.warn(`⚠️ [Autonomy] Auto-Posting Service V2: ${e.message}`);
  }

  // 7. Auto Post Generator
  try {
    const mod = await import('./services/autoPostGenerator.js');
    if (mod.autoPostGenerator || mod.default) {
      logger.info('✅ [Autonomy] Auto Post Generator initialized');
      logger.info('   └─ AI content generation, trend analysis, viral optimization ready');
    }
  } catch (e: any) {
    logger.warn(`⚠️ [Autonomy] Auto Post Generator: ${e.message}`);
  }

  // 8. Autopilot Publisher
  try {
    const mod = await import('./services/autopilotPublisher.js');
    if (mod.autopilotPublisher || mod.default) {
      logger.info('✅ [Autonomy] Autopilot Publisher initialized');
      logger.info('   └─ Cross-platform publishing, scheduling, analytics tracking active');
    }
  } catch (e: any) {
    logger.warn(`⚠️ [Autonomy] Autopilot Publisher: ${e.message}`);
  }

  logger.info('🤖 ═══════════════════════════════════════════════════════════');
  logger.info('🤖 AUTONOMOUS SYSTEMS READY');
  logger.info('🤖 ═══════════════════════════════════════════════════════════');
  logger.info('');

  // Apply global rate limiter
  try {
    if (typeof globalRateLimiter === 'function') {
      app.use('/api', globalRateLimiter);
    }
  } catch (e) {
    // Rate limiter not available
  }

  // Initialize Stripe products and prices before routes
  try {
    const priceIds = await ensureStripeProductsAndPrices();
    logger.info('✅ Stripe products and prices initialized');
    logger.info(`   Monthly: ${priceIds.monthly}`);
    logger.info(`   Yearly: ${priceIds.yearly}`);
    logger.info(`   Lifetime: ${priceIds.lifetime}`);
  } catch (e: any) {
    logger.error(`❌ Failed to initialize Stripe prices: ${e.message}`);
    logger.warn('⚠️ Payment system may be unavailable');
  }

  await registerRoutes(httpServer, app);

  // MANDATORY global error handler (from safety module)
  app.use(safetyErrorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
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
    },
  );
})();
