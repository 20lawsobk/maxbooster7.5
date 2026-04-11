// Import console error filter FIRST to suppress non-critical localhost Redis errors
import "./lib/consoleErrorFilter.js";
// Mandatory observability — must load before anything else can throw
import "./instrument.js";

import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import compression from "compression";
import { logger } from "./logger.js";
import { setupStartupEndpoints } from "./startup-probes.js";
import { cloudflareMiddleware, buildTrustProxyValue } from "./middleware/cloudflare.js";
import path from "path";
import crypto from "crypto";
import fs from "fs";

// MANDATORY safety imports - these MUST load successfully
import {
  initializeSafetySystems,
  applyMandatoryMiddleware,
  globalErrorHandler as safetyErrorHandler,
  sanitizationMiddleware,
  killSwitch,
  stripeRawBodyParser,
} from "./safety/index.js";

import { securityMiddleware } from './middleware/security.js';
import helmet from "helmet";

// Dynamic imports for monitoring services (optional)
let metricsCollector: any = null;
let alertingService: any = null;
let capacityMonitor: any = null;
let initializeRealtimeServer: any = null;
let initializeWorkers: any = null;

// Load optional monitoring modules (NOT security-critical)
async function loadOptionalModules() {
  // Import all optional modules concurrently instead of 5 sequential awaits.
  const [metrics, alerting, capacity, realtime, workers] = await Promise.allSettled([
    import("./monitoring/metricsCollector.js"),
    import("./monitoring/alertingService.js"),
    import("./monitoring/capacityMonitor.js"),
    import("./realtime/index.js"),
    import("./workers/index.js"),
  ]);
  if (metrics.status === 'fulfilled')   metricsCollector        = metrics.value.metricsCollector;
  if (alerting.status === 'fulfilled')  alertingService         = alerting.value.alertingService;
  if (capacity.status === 'fulfilled')  capacityMonitor         = capacity.value.CapacityMonitor;
  if (realtime.status === 'fulfilled')  initializeRealtimeServer = realtime.value.initializeRealtimeServer;
  if (workers.status === 'fulfilled')   initializeWorkers       = workers.value.initializeWorkers;
}

const app = express();

app.use(helmet({ contentSecurityPolicy: false })); // Security auto-fix

// Apply rate limiting and production-grade CSP
app.use(securityMiddleware as any);

setupStartupEndpoints(app);

import('./lib/configValidator.js').then(({ validateScaleConfig }) => {
  validateScaleConfig();
}).catch(() => {});

// VM Reserve: use compression level 6 — better ratio, extra CPU cores absorb the cost.
// Threshold at 512 B so most JSON API responses get compressed (saves ~30-70% transfer).
app.use(compression({ level: 6, threshold: 512 }));
app.use(cookieParser());

// Fast-path health endpoint: must be registered BEFORE session/PDIM middleware so
// Replit's health checker always gets an instant response regardless of PDIM load.
app.use((req, res, next) => {
  if (req.path === '/api/health') {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
    return;
  }
  next();
});

const httpServer = createServer(app);

// keepAliveTimeout MUST exceed the upstream load-balancer idle timeout (~60 s on Replit Autoscale).
// If Node closes a keep-alive socket before the LB does, the LB sends a request on a dead socket
// and returns a 502. 65 s keeps us safely above the LB window.
// headersTimeout must be strictly greater than keepAliveTimeout.
httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout   = 66_000;

// VM Reserve: disable Nagle's algorithm on every accepted TCP socket.
// setNoDelay(true) flushes each write immediately — eliminates up to 200 ms of
// artificial latency on small API responses.  setKeepAlive with a 30 s probe
// interval reclaims idle sockets before they silently go half-open, which
// prevents ghost connections from consuming file descriptors.
httpServer.on('connection', (socket) => {
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 30_000);
});

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
  logger.warn('❌ CRITICAL: Failed to apply mandatory safety middleware');
  logger.warn(`   └─ Error: ${error.message}`);
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
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve client/public static files (sw.js, manifest.json, etc.) early — before
// session/PDIM middleware so the service worker and PWA assets are always available.
app.use(express.static(path.join(process.cwd(), 'client', 'public'), {
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// Serve generated audio content from root public folder
app.use('/generated-content', express.static(path.join(process.cwd(), 'public', 'generated-content'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wav') || filePath.endsWith('.mp3')) {
      res.setHeader('Content-Type', filePath.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}));

app.use('/uploads/images', express.static(path.join(process.cwd(), 'uploads', 'images'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.webp')) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
    }
  }
}));

app.use('/uploads/videos', express.static(path.join(process.cwd(), 'uploads', 'videos'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
    }
  }
}));

app.use('/uploads/audio', express.static(path.join(process.cwd(), 'uploads', 'audio'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp3')) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
    } else if (filePath.endsWith('.wav')) {
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
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

// ── Boot-time SPA fallback ────────────────────────────────────────────────────
// The server starts accepting connections immediately (early listen) for health
// checks, but Vite / serveStatic is the last thing registered — about 10-11 s
// after boot.  During that window, any browser request to GET / (or any non-API
// route) falls through with no handler and returns 404.
//
// This middleware fires BEFORE all API routes.  It serves dist/index.html for
// non-API GET requests during the startup window only.  Once Vite or
// serveStatic registers its own catch-all (_spaHandlerReady = true), this
// middleware calls next() immediately and is completely transparent.
//
// Why not call setupVite earlier?  setupVite awaits createViteServer() which
// itself performs heavy I/O; calling it before route registration would stall
// all API route setup.  This shim is the minimal-footprint alternative.
// ─────────────────────────────────────────────────────────────────────────────
let _spaHandlerReady = false;
const _spaFallbackIndexPath = path.resolve(process.cwd(), 'dist', 'public', 'index.html');

// Lightweight boot-status endpoint — always available, no proxy/header issues.
// The boot loading page polls this instead of sniffing response headers.
app.get('/api/boot-status', (_req: Request, res: Response) => {
  res.json({ ready: _spaHandlerReady });
});

// Early client-error collector — registered here so it is reachable immediately
// after the server starts listening (before registerRoutes completes).  The full
// route at routes.ts also registers this path; once that handler is active it
// takes precedence because Express matches the first registered handler.
app.post('/api/errors', (req: Request, res: Response) => {
  res.json({ received: true });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  // Once the real SPA handler is wired, this middleware is a no-op.
  if (_spaHandlerReady) return next();
  // API routes must never receive an HTML shell — let them fall through to
  // the registered handler (or the /api 404 guard that comes later).
  if (req.originalUrl.startsWith('/api/') || req.method !== 'GET') return next();
  // Static assets (JS chunks, CSS, images, fonts) must not receive an HTML
  // shell during the boot window — they must reach the express.static handler.
  const assetExt = /\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot|map|json)$/i;
  if (req.path.startsWith('/assets/') || assetExt.test(req.path)) return next();
  // Serve the pre-built SPA shell if it exists.  In development this is the
  // last production build; in production it is the freshly built dist/.
  if (fs.existsSync(_spaFallbackIndexPath)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Boot-Fallback', '1');
    return res.sendFile(_spaFallbackIndexPath);
  }
  // In dev mode (no built index.html) serve a minimal loading page so mobile
  // browsers see something instead of a white screen during the boot window.
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Boot-Fallback', '1');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Max Booster — Starting Up…</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;
         background:#0f0f1a;color:#fff;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
    .logo{width:80px;height:80px;border-radius:20px;margin-bottom:24px;
          box-shadow:0 0 40px rgba(124,58,237,0.4);display:block}
    h1{font-size:1.5rem;font-weight:700;margin-bottom:8px}
    p{color:#a0a0b8;font-size:.95rem;margin-bottom:32px}
    .bar{width:220px;height:4px;background:#1e1e35;border-radius:4px;overflow:hidden}
    .bar-fill{height:100%;background:linear-gradient(90deg,#7c3aed,#4f46e5);border-radius:4px;
              animation:slide 1.6s ease-in-out infinite}
    @keyframes slide{0%{width:0%;margin-left:0}50%{width:70%;margin-left:0}100%{width:0%;margin-left:100%}}
    .note{margin-top:24px;font-size:.75rem;color:#555}
  </style>
</head>
<body>
  <img class="logo" src="/logo.png" alt="Max Booster"/>
  <h1>Max Booster</h1>
  <p>Initializing AI systems…</p>
  <div class="bar"><div class="bar-fill"></div></div>
  <p class="note">First start takes ~1 minute. This page will reload automatically.</p>
  <script>
    (function(){
      function tryReload(){
        fetch('/api/boot-status').then(function(r){
          return r.json();
        }).then(function(data){
          if(data.ready){
            location.reload();
          } else {
            setTimeout(tryReload, 2000);
          }
        }).catch(function(){ setTimeout(tryReload, 2000); });
      }
      setTimeout(tryReload, 2000);
    })();
  </script>
</body>
</html>`);
});

(async () => {
  // ── Option 2: Parallel deferred imports ──────────────────────────────────
  // All modules that were previously static top-level imports are loaded here
  // in one parallel Promise.all.  Removing them from the module's static
  // import graph means the synchronous code above (express setup + listen())
  // now completes in < 50 ms instead of waiting 30–60 s for the route tree /
  // TF.js / distributedCache / DB pool to initialise before listen() is called.
  const [
    { registerRoutes },
    { serveStatic, serveStaticFiles },
    { default: session },
    { verifyReadReplica },
    { createSessionStore, getSessionConfig },
    { ensureStripeProductsAndPrices },
    { originValidation },
    { distributedCache },
    prometheusModule,
  ] = await Promise.all([
    import('./routes.js'),
    import('./static.js'),
    import('express-session'),
    import('./db.js'),
    import('./middleware/sessionConfig.js'),
    import('./services/stripeSetup.js'),
    import('./middleware/requestValidation.js'),
    import('./infrastructure/distributedCache.js'),
    import('./routes/prometheus.js'),
  ]);
  const prometheusRouter = (prometheusModule as any).default;
  const { httpRequestDuration, httpRequestTotal } = prometheusModule as any;

  // ── Early static file serving ─────────────────────────────────────────────
  // Register express.static for dist/public BEFORE session middleware is wired.
  // Static asset requests (favicon, /assets/*.js, /assets/*.css, images) must
  // never pay the cost of a PDIM session lookup.  During PDIM 429 bursts at
  // startup, session lookups can block for hundreds of milliseconds, inflating
  // asset latency to 1-5 s.  Serving files directly from disk here drops that
  // to single-digit milliseconds regardless of PDIM health.
  // The SPA catch-all (serveStatic) remains registered after API routes so
  // it can do OG meta injection and subdomain routing for page navigations.
  if (process.env.NODE_ENV === 'production') {
    serveStaticFiles(app);
    logger.info('✅ [Static] Pre-session asset serving registered (assets bypass session/PDIM)');
  }

  // Load optional modules in background — they're only used inside setImmediate
  // blocks that fire after all sync setup completes, so awaiting here just adds
  // latency without any ordering benefit.
  const _optionalModulesReady = loadOptionalModules().catch((e: any) =>
    logger.warn('[boot] Optional module load error (non-blocking):', e?.message)
  );

  // Determine once whether this process is the designated background worker.
  // In cluster mode CLUSTER_WORKER_ID is injected by cluster.ts for each forked
  // worker (0, 1, 2, …).  In single-process mode (dev / DISABLE_CLUSTER) it is
  // undefined — treat that as the BG worker so everything still runs.
  const clusterId = process.env.CLUSTER_WORKER_ID;
  const isBgWorker = clusterId === undefined || clusterId === '0';

  // DatabaseLogTransport is disabled: even a single-worker process can exhaust
  // Neon's connection limit when the regular query pool is busy, triggering
  // PG_CODE 53100 retry storms that pollute the logs.  Stdout captures all log
  // output already (pino JSON transport), so DB persistence is redundant.

  // Start chain error auto-fixer — must run early so it catches errors from
  // autonomous systems, BullMQ workers, and PDIM during their own startup
  try {
    const { chainErrorAutoFixer } = await import('./services/chainErrorAutoFixer.js');
    chainErrorAutoFixer.start();
  } catch (e: any) {
    logger.warn(`[ChainFixer] Failed to start: ${e.message}`);
  }

  // Start platform auto-fixer — proactive subsystem health probing + runtime patching
  try {
    const { platformAutoFixer, platformFixerMiddleware } = await import('./services/platformAutoFixer.js');
    platformAutoFixer.start();
    app.use(platformFixerMiddleware);
  } catch (e: any) {
    logger.warn(`[PlatformAutoFixer] Failed to start: ${e.message}`);
  }

  // Load permanent overrides — restores improvements accumulated across prior sessions.
  // Must run after PDIM is connected (fixers start PDIM lazily on first use, so a
  // short delay lets the connection settle before we try to read saved override keys).
  setTimeout(async () => {
    try {
      const { permanentFixRegistry } = await import('./services/permanentFixRegistry.js');
      await permanentFixRegistry.loadPermanentOverrides();
    } catch (e: any) {
      logger.warn(`[PermanentFixer] Failed to load overrides: ${e.message}`);
    }
  }, 8_000);

  // ========================================
  // SESSION STORE INITIALIZATION (PRODUCTION-READY)
  // ========================================
  const isProduction = process.env.NODE_ENV === 'production';

  // Validate SESSION_SECRET in production - abort if missing or weak
  if (isProduction) {
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      logger.warn('❌ CRITICAL: SESSION_SECRET environment variable is required in production');
      logger.warn('❌ Cannot start server without secure session configuration');
      process.exit(1);
    }
    if (sessionSecret.length < 32) {
      logger.warn('❌ CRITICAL: SESSION_SECRET must be at least 32 characters');
      process.exit(1);
    }
  }

  // Store reference to session store for WebSocket authentication
  let activeSessionStore: any = null;

  activeSessionStore = await createSessionStore();
  const sessionConfig = getSessionConfig(activeSessionStore);
  app.use(session(sessionConfig));
  logger.info('✅ Session store initialized (PDIM)');

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
    logger.warn(`[db] Failed to run replica verification: ${e.message}`);
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
    logger.warn('⚠️ Safety systems initialization error:', error.message);
  }

  // Ensure optional modules finished loading (they ran concurrently with the
  // PDIM + safety system init above, so this await is usually instant).
  await _optionalModulesReady;

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

  // Initialize background workers on one cluster worker only.
  // Running BullMQ processors on every worker multiplies PDIM queue-poll
  // traffic by N and causes 429 floods.  Worker 0 (or the sole process when
  // not clustered) handles all background jobs; the others serve HTTP only.
  // isBgWorker / clusterId are already defined above (DatabaseLogTransport section).
  try {
    if (isBgWorker && typeof initializeWorkers === 'function') {
      await initializeWorkers();
      logger.info('Background workers initialized');
    } else if (!isBgWorker) {
      logger.info(`[Cluster] Worker ${clusterId} — HTTP only, background jobs handled by worker 0`);
    }
  } catch (e) {
    logger.warn('Workers not available');
  }

  // Domain verification worker — polls storefront_domains for pending custom domains
  // and checks TXT propagation. Runs on every process (lightweight interval, not BullMQ).
  try {
    const { startDomainVerificationWorker } = await import('./workers/domainVerificationWorker.js');
    startDomainVerificationWorker();
    logger.info('Domain verification worker started');
  } catch (e: any) {
    logger.warn(`Domain verification worker unavailable: ${e.message}`);
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

  // Import the four /api middleware modules concurrently — their initialization is
  // independent so there is no reason to await them one at a time (~1s saved).
  const [demoAuthResult, rateLimiterResult, admissionResult, apiCacheResult] =
    await Promise.allSettled([
      import('./auth.js'),
      import('./middleware/scalableRateLimiter.js'),
      import('./middleware/admissionControl.js'),
      import('./middleware/apiCache.js'),
    ]);

  // Apply each in the correct precedence order (import order above matches use order)
  if (demoAuthResult.status === 'fulfilled') {
    app.use('/api', demoAuthResult.value.blockDemoWrite);
    logger.info('✅ Demo write protection applied');
  } else {
    logger.warn(`⚠️ Demo write protection not available: ${(demoAuthResult as any).reason?.message}`);
  }

  if (rateLimiterResult.status === 'fulfilled') {
    app.use('/api', rateLimiterResult.value.globalScalableRateLimiter);
    logger.info('✅ Scalable rate limiter applied');
  } else {
    logger.warn(`⚠️ Rate limiter not available: ${(rateLimiterResult as any).reason?.message}`);
  }

  if (admissionResult.status === 'fulfilled') {
    app.use('/api', admissionResult.value.admissionControl);
    logger.info('✅ Admission control applied (max concurrent: ' + (process.env.MAX_CONCURRENT_REQUESTS ?? '5000') + ')');
  } else {
    logger.warn(`⚠️ Admission control not available: ${(admissionResult as any).reason?.message}`);
  }

  if (apiCacheResult.status === 'fulfilled') {
    const { invalidateCacheOnMutation, cacheMiddleware } = apiCacheResult.value;
    app.use('/api', invalidateCacheOnMutation());
    const cachedRoutes: Record<string, number> = {
      '/api/bootstrap':                   30,
      '/api/auth/me':                     15,
      '/api/projects':                    20,
      '/api/studio/projects':             20,
      '/api/analytics/dashboard':         60,
      '/api/marketplace/beats':           30,
      '/api/notifications':               10,
      '/api/notifications/unread-count':  10,
      '/api/royalties/summary':           60,
      '/api/achievements':               120,
    };
    const routeCacheMiddleware = (req: any, res: any, next: any) => {
      if (req.method !== 'GET') return next();
      const basePath = req.path.replace(/\/$/, '') || req.path;
      const ttl = cachedRoutes[basePath];
      if (ttl) return cacheMiddleware({ ttlSeconds: ttl, varyByUser: true })(req, res, next);
      next();
    };
    app.use(routeCacheMiddleware);

    // Add stale-while-revalidate headers so browsers can serve cached API
    // responses immediately and refresh in background on repeat visits.
    const SWR_ROUTES: Record<string, string> = {
      '/api/bootstrap':                   'private, max-age=30, stale-while-revalidate=300',
      '/api/auth/me':                     'private, max-age=15, stale-while-revalidate=120',
      '/api/projects':                    'private, max-age=20, stale-while-revalidate=180',
      '/api/notifications':               'private, max-age=10, stale-while-revalidate=60',
      '/api/notifications/unread-count':  'private, max-age=10, stale-while-revalidate=60',
      '/api/royalties/summary':           'private, max-age=60, stale-while-revalidate=600',
      '/api/analytics/dashboard':         'private, max-age=60, stale-while-revalidate=600',
      '/api/achievements':                'private, max-age=120, stale-while-revalidate=900',
    };
    app.use('/api', (req: any, res: any, next: any) => {
      if (req.method !== 'GET') return next();
      const directive = SWR_ROUTES[req.path.replace(/\/$/, '') || req.path];
      if (directive && !res.getHeader('Cache-Control')) {
        res.setHeader('Cache-Control', directive);
      }
      next();
    });

    logger.info(`✅ API response cache initialized (${Object.keys(cachedRoutes).length} cached routes)`);
  } else {
    logger.warn(`⚠️ API cache middleware: ${(apiCacheResult as any).reason?.message}`);
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

  const { multiTenantRouter } = await import('./middleware/multiTenantRouter.js');
  app.use(multiTenantRouter);

  await registerRoutes(httpServer, app);

  // Start retention background services
  try {
    const { reEngagementService } = await import('./services/reEngagementService.js');
    reEngagementService.startDailyCron();
    logger.info('[Retention] Re-engagement cron started');

    const { recoverStaleProcessingBatches } = await import('./services/featureEventBuffer.js');
    recoverStaleProcessingBatches().catch((e: any) =>
      logger.warn('[Retention] Stale batch recovery failed (non-blocking):', e?.message)
    );

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

  // Storefront short-link: /s/:label → /storefront/:slug
  // First checks managed subdomain registry, then falls back to direct slug lookup
  app.get('/s/:label', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { db: sDb } = await import('./db.js');
      const { storefrontDomains: sDomains, storefronts: sStorefronts } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const BASE = process.env.BASE_DOMAIN || 'maxbooster.replit.app';
      const label = req.params.label.toLowerCase().replace(/[^a-z0-9-]/g, '');

      // 1. Check managed subdomain registry (e.g. b-lawz-music reserved via UI)
      const fqdn = `${label}.${BASE}`;
      const [domRow] = await sDb
        .select({ slug: sStorefronts.slug })
        .from(sDomains)
        .innerJoin(sStorefronts, eq(sDomains.storefrontId, sStorefronts.id))
        .where(and(eq(sDomains.domain, fqdn), eq(sDomains.type, 'managed_subdomain')))
        .limit(1);
      if (domRow?.slug) {
        return res.redirect(302, `/storefront/${domRow.slug}`);
      }

      // 2. Fall back to direct slug match (label == storefront slug)
      const [slugRow] = await sDb
        .select({ slug: sStorefronts.slug })
        .from(sStorefronts)
        .where(eq(sStorefronts.slug, label))
        .limit(1);
      if (slugRow?.slug) {
        return res.redirect(302, `/storefront/${slugRow.slug}`);
      }

      return next();
    } catch (err) {
      logger.warn({ err: err }, '[/s/:label] lookup error:');
      return next();
    }
  });

  // MANDATORY global error handler (from safety module) - must be LAST middleware
  app.use(safetyErrorHandler);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app);
  }
  // Real SPA handler is now registered — disable the boot-time fallback shim.
  _spaHandlerReady = true;
  logger.info('✅ [SPA] Vite/static handler ready — boot fallback deactivated');

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
        // Stagger the connect() across cluster workers so they don't all hammer
        // PDIM simultaneously at startup: worker N waits N × 1 500 ms before
        // connecting.  Worker 0 (BG) connects immediately; workers 1 and 2 wait
        // 1.5 s and 3 s respectively.  Total PDIM connection window ≤ 3 s instead
        // of all workers colliding in the same 200 ms window and triggering 429s.
        const _pdimWorkerDelay = parseInt(process.env.CLUSTER_WORKER_ID || '0', 10) * 1500;
        if (_pdimWorkerDelay > 0) {
          logger.info(`[DistributedCache] Staggering connect by ${_pdimWorkerDelay}ms (worker ${process.env.CLUSTER_WORKER_ID})`);
          await new Promise(resolve => setTimeout(resolve, _pdimWorkerDelay));
        }
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
          logger.warn(`❌ Failed to initialize Stripe prices: ${e.message}`);
        }

        // 0b. Admin account seeding — idempotent, safe to run after listen
        try {
          const { initializeAdmin } = await import('./init-admin.js');
          await initializeAdmin();
          logger.info('✅ Admin account initialized');
        } catch (e: any) {
          logger.warn(`❌ Failed to initialize admin: ${e.message}`);
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

        // Built-in authoritative DNS server for *.maxboostermusic.com
        import('./services/dnsServer.js').then(({ startDNSServer }) => {
          startDNSServer().catch((e: any) => logger.warn('[DNS] Start error:', e?.message));
        }).catch(() => {});

        import('./services/baseModelTrainer.js').then(({ runBaseModelTraining }) => {
          runBaseModelTraining().catch((e) => { logger.warn('[BaseTrainer] Background training error:', e instanceof Error ? e.message : String(e)); });
        }).catch(() => {});

        // MaxCore + PDIM connectivity probe, weight sync, and training feedback wiring
        import('./services/maxcoreSync.js').then(({ initMaxCoreSync }) => {
          initMaxCoreSync().catch((e: any) => logger.warn('[MaxCoreSync] Init error:', e?.message));
        }).catch(() => {});

        // MaxCore Score Calibrator — calibrates VeoGate weights/thresholds against 8TB corpus
        import('./services/maxcoreScoreCalibrator.js').then(({ initScoreCalibrator }) => {
          initScoreCalibrator();
        }).catch(() => {});

        // Diffusion self-training: starts 60s after boot so server is stable first
        setTimeout(() => {
          import('./services/diffusionBackgroundTrainer.js').then(({ startBackgroundTraining }) => {
            startBackgroundTraining();
            logger.info('🎬 [DiffBG] Diffusion self-training loop started — model will continuously improve in the background');
          }).catch((e) => logger.warn('[DiffBG] Could not start background trainer:', e?.message));
        }, 60_000);

        // Neon keepalive: pool idleTimeoutMillis=60s, keepalive pings every 25s so
        // connections are refreshed well before the idle timeout fires.  Without this,
        // the 10s default idleTimeout caused connections to die between 30s pings,
        // producing a 5000+ms reconnect spike on the next background-job query.
        // Both primary and replica pools are kept alive.
        try {
          const { pool: _keepPool, replicaPool: _replicaKeepPool } = await import('./db.js');
          const _keepalive = setInterval(() => {
            _keepPool.query('SELECT 1').catch(() => {});
            if (_replicaKeepPool) _replicaKeepPool.query('SELECT 1').catch(() => {});
          }, 25_000);
          _keepalive.unref();
          logger.info('[DB] Keepalive started — pinging primary + replica every 25s to prevent Neon cold-start latency');
        } catch {
          // Non-fatal — server continues without keepalive
        }

        logger.info('🤖 ═══════════════════════════════════════════════════════════');
      });
})().catch((error) => {
  console.error('FATAL: Server startup failed:', error);
  logger.warn({ err: error }, 'FATAL: Server startup failed');
  process.exit(1);
});

// Graceful shutdown — stops accepting new connections, drains in-flight requests,
// then closes the DB pool. Hard-exits after 10 s so autoscale SIGKILL is never needed.
// Guard against concurrent invocations (multiple signal handlers can fire at once).
let _shutdownInProgress = false;

async function gracefulShutdown(signal: string, exitCode = 0): Promise<void> {
  if (_shutdownInProgress) return;
  _shutdownInProgress = true;

  logger.info(`[Shutdown] Received ${signal}, starting graceful shutdown...`);

  // Hard deadline: autoscale sends SIGKILL at ~30 s, so we must complete within 25 s.
  const hardExit = setTimeout(() => {
    logger.warn('[Shutdown] Hard timeout reached — forcing exit');
    process.exit(exitCode);
  }, 25_000);
  hardExit.unref(); // do not keep the event loop alive just for this timer

  try {
    // 1. Stop accepting new HTTP connections so the load balancer re-routes immediately.
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    logger.info('[Shutdown] HTTP server closed');
  } catch (err) {
    logger.warn({ err: err }, '[Shutdown] Error closing HTTP server:');
  }

  try {
    // 2. Close BullMQ workers — waits for the current job to finish then stops.
    //    Import is dynamic so this file compiles even if workers module is absent.
    const { shutdownWorkers } = await import('./workers/index.js');
    await Promise.race([
      shutdownWorkers(),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('BullMQ drain timeout')), 10_000)),
    ]);
    logger.info('[Shutdown] BullMQ workers drained');
  } catch (err: any) {
    logger.warn('[Shutdown] BullMQ drain error (non-fatal):', err?.message);
  }

  try {
    // 3. Stop the built-in DNS server.
    const { stopDNSServer } = await import('./services/dnsServer.js');
    await stopDNSServer();
  } catch { /* non-critical */ }

  try {
    // 4. Stop the platform auto-fixer probe loop.
    const { platformAutoFixer } = await import('./services/platformAutoFixer.js');
    (platformAutoFixer as any)?.stop?.();
    logger.info('[Shutdown] PlatformAutoFixer stopped');
  } catch { /* non-critical */ }

  try {
    // 4. Close the database pool so in-flight queries complete before the process exits.
    const { pool } = await import('./db.js');
    await pool.end();
    logger.info('[Shutdown] Database pool closed');
  } catch (err) {
    logger.warn({ err: err }, '[Shutdown] Error closing DB pool:');
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
  logger.warn({ err: error }, '[Process] Uncaught exception — shutting down:');
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  const code = (reason as NodeJS.ErrnoException)?.code;
  // Non-fatal: known transient errors that the ChainFixer / circuit breaker handle automatically.
  const isNonFatal = (
    (code && ['EPIPE', 'ECONNRESET', 'ECONNABORTED'].includes(code)) ||
    /EPIPE|ECONNRESET|ECONNABORTED|ECONNREFUSED|AbortError|fetch failed|Failed to fetch|Command timed out|Connection is closed|\[PDIM\] Circuit OPEN|\[LuaExecutor\] script timeout|\[LuaExecutor\] Wait queue saturated|erroredJobIds|PDIM.*Circuit|script timeout exceeded/i.test(err.message)
  );
  if (isNonFatal) return; // instrument.ts already logs as warn
  logger.warn('[Process] Unhandled promise rejection (non-fatal):', reason);
});
