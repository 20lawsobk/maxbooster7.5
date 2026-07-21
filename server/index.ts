// ── Self-Confinement: initialise unified config before anything else ─────────
// Validates all env vars and builds the typed config object. Must be first.
import "./config/index.js";

// Reconcile stale PDIM_* credentials against the working STORAGE_* token
// BEFORE any other module reads process.env.PDIM_* — must stay first.
import "./lib/pdimEnvFix.js";
// Import console error filter FIRST to suppress non-critical localhost Redis errors
import "./lib/consoleErrorFilter.js";
// Mandatory observability — must load before anything else can throw
import "./instrument.js";
// Typed env — validates critical vars at startup, throws if DATABASE_URL/SESSION_SECRET missing
import { env } from "./config/env.js";

import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import compression from "compression";
import { brotliMiddleware } from "./middleware/brotliCompression.js";
import { logger } from "./logger.js";
import { setupStartupEndpoints, startupProbes } from "./startup-probes.js";
import {
  cloudflareMiddleware,
  buildTrustProxyValue,
} from "./middleware/cloudflare.js";
import path from "path";
import fs from "fs";
import { isProductionEnv } from "./lib/envHelpers.js";

// MANDATORY safety imports - these MUST load successfully
import { initializeSafetySystems, applyMandatoryMiddleware, globalErrorHandler as safetyErrorHandler, sanitizationMiddleware, killSwitch } from "./safety/index.js";

import { securityMiddleware } from "./middleware/security.js";

// Dynamic imports for monitoring services (optional)
let metricsCollector: { collect?: () => void; [k: string]: unknown } | null =
  null;
let alertingService: { check?: () => void; [k: string]: unknown } | null = null;
let capacityMonitor: { monitor?: () => void; [k: string]: unknown } | null =
  null;
let initializeRealtimeServer: ((server: import("http").Server) => void) | null =
  null;
let initializeWorkers: (() => void) | null = null;

// Load optional monitoring modules (NOT security-critical)
async function loadOptionalModules() {
  // Import all optional modules concurrently instead of 5 sequential awaits.
  const [metrics, alerting, capacity, realtime, workers] =
    await Promise?.allSettled([
      import("./monitoring/metricsCollector.js"),
      import("./monitoring/alertingService.js"),
      import("./monitoring/capacityMonitor.js"),
      import("./realtime/index.js"),
      import("./workers/index.js"),
    ]);
  if (metrics?.status === "fulfilled")
    metricsCollector = metrics?.value.metricsCollector;
  if (alerting?.status === "fulfilled")
    alertingService = alerting?.value.alertingService;
  if (capacity?.status === "fulfilled")
    capacityMonitor = capacity?.value.CapacityMonitor;
  if (realtime?.status === "fulfilled")
    initializeRealtimeServer = realtime?.value.initializeRealtimeServer;
  if (workers?.status === "fulfilled")
    initializeWorkers = workers?.value.initializeWorkers;
}

const app = express();

// securityMiddleware (server/middleware/security?.ts) applies the canonical
// helmet instance with a production-aware CSP (no unsafe-inline/-eval in prod).
// Do NOT register a second bare helmet() call here — duplicate middleware runs
// in registration order and the LAST write wins, so a weaker second call would
// silently override the stricter headers set by securityMiddleware.
app?.use(securityMiddleware as import("express").RequestHandler);

setupStartupEndpoints(app);

// Kick off readiness probes asynchronously — /ready transitions from
// "not_ready" → "ready"/"degraded" once DB + Redis + TF have responded.
startupProbes?.runAllProbes().catch((err) => {
  logger?.warn({ err }, "[startup-probes] runAllProbes failed");
});

import("./lib/configValidator.js")
  .then(({ validateScaleConfig }) => {
    validateScaleConfig();
  })
  .catch(() => {});

// Brotli compression — intercepts `Accept-Encoding: br` (all modern browsers) BEFORE gzip.
// Brotli quality-4 gives gzip-level speed but 15-25 % smaller payload.
// The downstream gzip middleware skips responses that already carry Content-Encoding: br.
app?.use(brotliMiddleware());

// VM Reserve: use compression level 6 — better ratio, extra CPU cores absorb the cost.
// Threshold at 256 B (lowered from 512) so more small JSON responses get compressed.
app?.use(compression({ level: 6, threshold: 256 }));
app?.use(cookieParser());

// Fast-path health endpoint: must be registered BEFORE session/PDIM middleware so
// Replit's health checker always gets an instant response regardless of PDIM load.
app.use((req, res, next) => {
  if (req.path === "/api/health") {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
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
httpServer.headersTimeout = 66_000;

// VM Reserve: disable Nagle's algorithm on every accepted TCP socket.
// setNoDelay(true) flushes each write immediately — eliminates up to 200 ms of
// artificial latency on small API responses.  setKeepAlive with a 30 s probe
// interval reclaims idle sockets before they silently go half-open, which
// prevents ghost connections from consuming file descriptors.
httpServer?.on("connection", (socket) => {
  socket?.setNoDelay(true);
  socket?.setKeepAlive(true, 30_000);
});

// START LISTENING IMMEDIATELY so deployment health checks succeed.
// /health (registered above by setupStartupEndpoints) responds with 200 at once.
// Session middleware and API routes are wired up in the async IIFE below —
// requests that arrive before they are ready will get 404/503 for a few seconds,
// which is acceptable; the deployment health check only needs /health to pass.
{
  const _earlyPort = env?.PORT;
  httpServer?.listen(
    { port: _earlyPort, host: "0.0.0.0", reusePort: true },
    () =>
      log(
        `serving on port ${_earlyPort} (early listen — full init in progress)`,
      ),
  );
}

// Trust proxy — configured for Cloudflare + Replit's reverse proxy.
// Using an IP allowlist (Cloudflare ranges + private/loopback) is more secure than a hop
// count: Express only trusts X-Forwarded-For when the socket connection itself comes from
// a listed IP, preventing clients from spoofing their IP by injecting header values.
app.set("trust proxy", buildTrustProxyValue());

// Cloudflare integration — extracts real client IP from CF-Connecting-IP (validated against
// Cloudflare's published IP ranges), adds no-store headers on /api routes, and annotates
// req?.isBehindCloudflare / req?.realClientIp for downstream middleware (rate limiter, audit log).
app?.use(cloudflareMiddleware);

// ========================================
// MANDATORY SAFETY MIDDLEWARE (MUST LOAD)
// ========================================
// These are production-critical and will throw if they fail
try {
  applyMandatoryMiddleware(app);
  logger?.info("✅ Mandatory safety middleware applied");
} catch (error) {
  logger?.warn("❌ CRITICAL: Failed to apply mandatory safety middleware");
  logger?.warn(`   └─ Error: ${error?.message}`);
  process?.exit(1);
}

// Apply input sanitization
app?.use(sanitizationMiddleware);

// TikTok Developers Site Verification
app?.get("/tiktok-developers-site-verification.txt", (_req, res) => {
  res
    .type("text/plain")
    .send(
      "tiktok-developers-site-verification=hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx",
    );
});
app?.get(
  "/tiktok-developers-site-hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx",
  (_req, res) => {
    res
      .type("text/plain")
      .send(
        "tiktok-developers-site-verification=hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx",
      );
  },
);
app?.get("/tiktokhnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx.txt", (_req, res) => {
  res
    .type("text/plain")
    .send(
      "tiktok-developers-site-verification=hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx",
    );
});
app?.get("/tiktokShgx3KxJb3b1mCeV8AHEsINRNKf2pmH5.txt", (_req, res) => {
  res
    .type("text/plain")
    .send(
      "tiktok-developers-site-verification=Shgx3KxJb3b1mCeV8AHEsINRNKf2pmH5",
    );
});

// Responsible-disclosure endpoint — industry standard for 90M-user platforms.
// https://securitytxt.org/
app?.get("/.well-known/security.txt", (_req, res) => {
  res
    .type("text/plain")
    .send(
      "Contact: mailto:security@max-booster.com\n" +
        "Expires: 2027-01-01T00:00:00.000Z\n" +
        "Preferred-Languages: en\n" +
        "Policy: https://max-booster.com/security-policy\n",
    );
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

// Global JSON body limit: 1 MB is generous for API payloads and prevents
// memory-exhaustion DoS from crafted large request bodies.  Routes that
// genuinely need larger bodies (studio project auto-save, AI file ingest)
// register their own express?.json({ limit: '10mb' }) middleware inline.
app?.use(
  express?.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
// URL-encoded forms (contact pages, simple forms) — keep the same 1 MB cap.
app?.use(express?.urlencoded({ extended: true, limit: "1mb" }));

// Serve client/public static files (sw?.js, manifest?.json, etc.) early — before
// session/PDIM middleware so the service worker and PWA assets are always available.
app?.use(
  express?.static(path?.join(process?.cwd(), "client", "public"), {
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (filePath?.endsWith("sw.js")) {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res?.setHeader("Service-Worker-Allowed", "/");
        res?.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }),
);

// Serve generated audio content from root public folder
app?.use(
  "/generated-content",
  express?.static(path?.join(process?.cwd(), "public", "generated-content"), {
    setHeaders: (res, filePath) => {
      if (filePath?.endsWith(".wav") || filePath?.endsWith(".mp3")) {
        res?.setHeader(
          "Content-Type",
          filePath?.endsWith(".wav") ? "audio/wav" : "audio/mpeg",
        );
        res?.setHeader("Accept-Ranges", "bytes");
      }
    },
  }),
);

app?.use(
  "/uploads/images",
  express?.static(path?.join(process?.cwd(), "uploads", "images"), {
    setHeaders: (res, filePath) => {
      if (
        filePath?.endsWith(".png") ||
        filePath?.endsWith(".jpg") ||
        filePath?.endsWith(".jpeg") ||
        filePath?.endsWith(".webp")
      ) {
        res?.setHeader(
          "Cache-Control",
          "public, max-age=2592000, stale-while-revalidate=86400",
        );
      }
    },
  }),
);

app?.use(
  "/uploads/videos",
  express?.static(path?.join(process?.cwd(), "uploads", "videos"), {
    setHeaders: (res, filePath) => {
      if (filePath?.endsWith(".mp4")) {
        res?.setHeader("Content-Type", "video/mp4");
        res?.setHeader("Accept-Ranges", "bytes");
        res?.setHeader(
          "Cache-Control",
          "public, max-age=2592000, stale-while-revalidate=86400",
        );
      }
    },
  }),
);

app?.use(
  "/uploads/audio",
  express?.static(path?.join(process?.cwd(), "uploads", "audio"), {
    setHeaders: (res, filePath) => {
      if (filePath?.endsWith(".mp3")) {
        res?.setHeader("Content-Type", "audio/mpeg");
        res?.setHeader("Accept-Ranges", "bytes");
        res?.setHeader(
          "Cache-Control",
          "public, max-age=2592000, stale-while-revalidate=86400",
        );
      } else if (filePath?.endsWith(".wav")) {
        res?.setHeader("Content-Type", "audio/wav");
        res?.setHeader("Accept-Ranges", "bytes");
        res?.setHeader(
          "Cache-Control",
          "public, max-age=2592000, stale-while-revalidate=86400",
        );
      }
    },
  }),
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  logger?.info(`${formattedTime} [${source}] ${message}`);
}

app?.use((req, res, next) => {
  const start = Date?.now();
  const path = req?.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res?.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson?.apply(res, [bodyJson, ...args]);
  };

  res?.on("finish", () => {
    const duration = Date?.now() - start;
    if (path?.startsWith("/api")) {
      let logLine = `${req?.method} ${path} ${res?.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && !isProductionEnv()) {
        const responseStr = JSON?.stringify(capturedJsonResponse);
        logLine += ` :: ${responseStr?.length > 500 ? responseStr?.substring(0, 500) + "...[truncated]" : responseStr}`;
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
// This middleware fires BEFORE all API routes.  It serves dist/index?.html for
// non-API GET requests during the startup window only.  Once Vite or
// serveStatic registers its own catch-all (_spaHandlerReady = true), this
// middleware calls next() immediately and is completely transparent.
//
// Why not call setupVite earlier?  setupVite awaits createViteServer() which
// itself performs heavy I/O; calling it before route registration would stall
// all API route setup.  This shim is the minimal-footprint alternative.
// ─────────────────────────────────────────────────────────────────────────────
let _spaHandlerReady = false;
// Set to true when registerRoutes() completes and the real API handlers are active.
// The early-boot stubs check this flag and call next() once routes are loaded,
// handing off to the real handlers in routes?.ts.
let _routesReady = false;
const _spaFallbackIndexPath = path?.resolve(
  process?.cwd(),
  "dist",
  "public",
  "index.html",
);

// Lightweight boot-status endpoint — always available, no proxy/header issues.
// The boot loading page polls this instead of sniffing response headers.
app?.get("/api/boot-status", (_req: Request, res: Response) => {
  res?.json({ ready: _spaHandlerReady });
});

// Early client-error collector — registered here so it is reachable immediately
// after the server starts listening (before registerRoutes completes).  The full
// route at routes?.ts also registers this path; once that handler is active it
// takes precedence because Express matches the first registered handler.
app?.post("/api/errors", (_req: Request, res: Response) => {
  res?.json({ received: true });
});

// ── Early-boot stubs ──────────────────────────────────────────────────────────
// These handlers fire during the ~10 s window between server listen() and the
// moment registerRoutes() finishes loading all lazy route modules.  Without them
// the React app receives 404s for critical first-paint API calls, which can
// cause routing errors or login-loop flashes.
//
// Once _routesReady is true the stub calls next() so the real handler registered
// by registerRoutes() (which sits later in the stack) takes over.  This avoids
// the "bootPhase: true forever" regression where the first-registered stub
// permanently shadows the real handler.
app?.get("/api/auth/me", (_req: Request, res: Response, next: NextFunction) => {
  if (_routesReady) return next();
  // During the boot window we cannot check the session store (PDIM may be cold).
  // Return unauthenticated so the React app shows the login screen rather than
  // hanging or routing to a broken state.
  res?.status(200).json({ authenticated: false, bootPhase: true });
});

app?.post("/api/metrics/web-vitals", (_req: Request, res: Response) => {
  // Silently accept browser web-vitals payloads during the boot window so the
  // browser doesn't log 404 errors on first paint.  Metrics from this window
  // are lost; that's acceptable — the real handler registers within seconds.
  res?.status(204).end();
});

app?.use((req: Request, res: Response, next: NextFunction) => {
  // Once the real SPA handler is wired, this middleware is a no-op.
  if (_spaHandlerReady) return next();
  // API routes must never receive an HTML shell — let them fall through to
  // the registered handler (or the /api 404 guard that comes later).
  if (req?.originalUrl.startsWith("/api/") || req?.method !== "GET")
    return next();
  // Static assets (JS chunks, CSS, images, fonts) must not receive an HTML
  // shell during the boot window — they must reach the express?.static handler.
  const assetExt =
    /\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot|map|json)$/i;
  if (req?.path.startsWith("/assets/") || assetExt?.test(req?.path)) return next();
  // Serve the pre-built SPA shell if it exists.  In development this is the
  // last production build; in production it is the freshly built dist/.
  if (fs?.existsSync(_spaFallbackIndexPath)) {
    res?.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res?.setHeader("X-Boot-Fallback", "1");
    return res?.sendFile(_spaFallbackIndexPath);
  }
  // In dev mode (no built index?.html) serve a minimal loading page so mobile
  // browsers see something instead of a white screen during the boot window.
  res?.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res?.setHeader("X-Boot-Fallback", "1");
  res?.status(200).send(`<!DOCTYPE html>
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
          return r?.json();
        }).then(function(data){
          if(data?.ready){
            location?.reload();
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
  // in one parallel Promise?.all.  Removing them from the module's static
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
    import("./routes.js"),
    import("./static.js"),
    import("express-session"),
    import("./db.js"),
    import("./middleware/sessionConfig.js"),
    import("./services/stripeSetup.js"),
    import("./middleware/requestValidation.js"),
    import("./infrastructure/distributedCache.js"),
    import("./routes/prometheus.js"),
  ]);
  const prometheusRouter = (prometheusModule as { default?: unknown }).default;
  const { httpRequestDuration, httpRequestTotal } = prometheusModule as {
    httpRequestDuration: unknown;
    httpRequestTotal: unknown;
  };

  // ── Early static file serving ─────────────────────────────────────────────
  // Register express.static for dist/public BEFORE session middleware is wired.
  // Static asset requests (favicon, /assets/*.js, /assets/*.css, images) must
  // never pay the cost of a PDIM session lookup.  During PDIM 429 bursts at
  // startup, session lookups can block for hundreds of milliseconds, inflating
  // asset latency to 1-5 s.  Serving files directly from disk here drops that
  // to single-digit milliseconds regardless of PDIM health.
  // The SPA catch-all (serveStatic) remains registered after API routes so
  // it can do OG meta injection and subdomain routing for page navigations.
  // Always register static file serving — not just in production.
  // In dev mode the pre-built dist/public/assets/ files (hashed JS/CSS chunks)
  // need to be served during the ~10 s boot window before Vite middleware loads.
  // express.static() calls next() for unknown paths so Vite's own module graph
  // (/@vite/client, /src/...) is unaffected.
  serveStaticFiles(app);
  logger?.info(
    "✅ [Static] Pre-session asset serving registered (assets bypass session/PDIM)",
  );

  // Load optional modules in background — they're only used inside setImmediate
  // blocks that fire after all sync setup completes, so awaiting here just adds
  // latency without any ordering benefit.
  const _optionalModulesReady = loadOptionalModules().catch((e) =>
    logger.warn(
      "[boot] Optional module load error (non-blocking):",
      e.message,
    ),
  );

  // Determine once whether this process is the designated background worker.
  // In cluster mode CLUSTER_WORKER_ID is injected by cluster.ts for each forked
  // worker (0, 1, 2, …).  In single-process mode (dev / DISABLE_CLUSTER) it is
  // undefined — treat that as the BG worker so everything still runs.
  const clusterId = process.env.CLUSTER_WORKER_ID;
  const isBgWorker = clusterId === undefined || clusterId === "0";

  // DatabaseLogTransport is disabled: even a single-worker process can exhaust
  // Neon's connection limit when the regular query pool is busy, triggering
  // PG_CODE 53100 retry storms that pollute the logs.  Stdout captures all log
  // output already (pino JSON transport), so DB persistence is redundant.

  // Start system intelligence layer — must be first so it sees all log entries
  // and events from subsequent service startups.
  try {
    const { systemIntelligence } = await import(
      "./services/systemIntelligence.js"
    );
    systemIntelligence?.initialize();
  } catch (e) {
    logger?.warn(
      `[SystemIntelligence] Failed to initialize: ${(e as Error).message}`,
    );
  }

  // Start chain error auto-fixer — must run early so it catches errors from
  // autonomous systems, BullMQ workers, and PDIM during their own startup
  try {
    const { chainErrorAutoFixer } = await import(
      "./services/chainErrorAutoFixer.js"
    );
    chainErrorAutoFixer?.start();
  } catch (e) {
    logger?.warn(`[ChainFixer] Failed to start: ${e?.message}`);
  }

  // Start platform auto-fixer — proactive subsystem health probing + runtime patching.
  // The probe loop (DB/PDIM/session queries, MaxCore pings) only runs on worker 0 to
  // avoid doubling all health-check traffic across every cluster worker.
  // The middleware (per-route 5xx rate tracker) always runs — it has no external I/O.
  try {
    const { platformAutoFixer, platformFixerMiddleware } = await import(
      "./services/platformAutoFixer.js"
    );
    if (isBgWorker) {
      platformAutoFixer?.start();
    } else {
      logger?.info(
        `[PlatformAutoFixer] Worker ${clusterId} — middleware active, probe loop handled by worker 0`,
      );
    }
    app?.use(platformFixerMiddleware);
  } catch (e) {
    logger?.warn(`[PlatformAutoFixer] Failed to start: ${e?.message}`);
  }

  // Load permanent overrides — restores improvements accumulated across prior sessions.
  // Must run after PDIM is connected (fixers start PDIM lazily on first use, so a
  // short delay lets the connection settle before we try to read saved override keys).
  setTimeout(async () => {
    try {
      const { permanentFixRegistry } = await import(
        "./services/permanentFixRegistry.js"
      );
      await permanentFixRegistry?.loadPermanentOverrides();
    } catch (e) {
      logger?.warn(`[PermanentFixer] Failed to load overrides: ${e?.message}`);
    }
  }, 8_000);

  // ========================================
  // SESSION STORE INITIALIZATION (PRODUCTION-READY)
  // ========================================
  const isProduction = isProductionEnv();

  // Validate SESSION_SECRET in production - abort if missing or weak
  if (isProduction) {
    const sessionSecret = env?.SESSION_SECRET;
    if (!sessionSecret) {
      logger?.warn(
        "❌ CRITICAL: SESSION_SECRET environment variable is required in production",
      );
      logger?.warn(
        "❌ Cannot start server without secure session configuration",
      );
      process?.exit(1);
    }
    if (sessionSecret?.length < 32) {
      logger?.warn("❌ CRITICAL: SESSION_SECRET must be at least 32 characters");
      process?.exit(1);
    }
  }

  // Store reference to session store for WebSocket authentication
  let activeSessionStore: import("express-session").Store | null = null;

  activeSessionStore = await createSessionStore();
  const sessionConfig = getSessionConfig(activeSessionStore);
  app?.use(session(sessionConfig));
  logger?.info("✅ Session store initialized (PDIM)");

  // distributedCache?.connect() is deferred to the setImmediate block below.
  // Keeping it here would stall route registration for up to ~20 s if PDIM is
  // rate-limiting at startup (3 retries × 5 s connectTimeout + back-off delays).
  // The cache falls back to in-memory until the deferred connect succeeds.

  // Export session store for WebSocket authentication
  (
    global as NodeJS.Global & { __activeSessionStore?: unknown }
  ).__activeSessionStore = activeSessionStore;

  // ========================================
  // REQUEST ORIGIN VALIDATION
  // ========================================
  app?.use(originValidation);
  logger?.info(
    "✅ Origin validation enabled (SameSite=Lax + Origin header check)",
  );

  // ========================================
  // CSRF PROTECTION (defence-in-depth)
  // ========================================
  // origin validation + SameSite=Lax already block cross-site POST; CSRF
  // double-submit-cookie adds explicit token verification on every state-
  // changing route. Webhooks, login/register, and idempotent reads are exempt
  // (see CSRF_EXEMPT_PATHS in server/middleware/csrf?.ts).
  try {
    const { csrfProtectionWithExemptions, generateCsrfToken } = await import(
      "./middleware/csrf.js"
    );
    app?.use(generateCsrfToken);
    app?.use(csrfProtectionWithExemptions);
    logger?.info(
      "✅ CSRF protection enabled (double-submit cookie, with safe exemptions)",
    );
  } catch (e) {
    logger?.warn(`⚠️  CSRF middleware failed to load: ${e?.message}`);
  }

  // Verify read replica once at startup. On failure dbRead is permanently
  // re-pointed to the primary with a loud error — no per-query try/catch needed.
  try {
    await verifyReadReplica();
  } catch (e) {
    logger?.warn(`[db] Failed to run replica verification: ${e?.message}`);
  }

  // ========================================
  // INITIALIZE PRODUCTION SAFETY SYSTEMS
  // ========================================
  try {
    const safetyResult = await initializeSafetySystems();
    if (!safetyResult?.success) {
      logger?.warn(
        `⚠️ Safety systems initialized with warnings: ${safetyResult?.errors.join(", ")}`,
      );
    }
  } catch (error) {
    logger?.warn("⚠️ Safety systems initialization error:", error?.message);
  }

  // Ensure optional modules finished loading (they ran concurrently with the
  // PDIM + safety system init above, so this await is usually instant).
  await _optionalModulesReady;

  // Initialize monitoring services
  try {
    if (metricsCollector?.start) {
      metricsCollector?.start();
      logger?.info("Metrics collector started");
    }
  } catch (e) {
    logger?.warn("Metrics collector not available");
  }

  try {
    if (alertingService?.start) {
      alertingService?.start();
      logger?.info("Alerting service started");
    }
  } catch (e) {
    logger?.warn("Alerting service not available");
  }

  try {
    if (capacityMonitor?.start) {
      capacityMonitor?.start();
      logger?.info("Capacity monitor started");
    }
  } catch (e) {
    logger?.warn("Capacity monitor not available");
  }

  // Initialize realtime WebSocket server for studio collaboration
  try {
    if (typeof initializeRealtimeServer === "function") {
      // Pass the already-initialized session store to WebSocket for secure authentication
      const { setSessionStore } = await import("./realtime/index.js");
      if (typeof setSessionStore === "function" && activeSessionStore) {
        setSessionStore(activeSessionStore);
      }
      initializeRealtimeServer(httpServer);
      logger?.info("Realtime collaboration server initialized");
    }
  } catch (e) {
    logger?.warn("Realtime server not available");
  }

  // Initialize background workers on one cluster worker only.
  // Running BullMQ processors on every worker multiplies PDIM queue-poll
  // traffic by N and causes 429 floods.  Worker 0 (or the sole process when
  // not clustered) handles all background jobs; the others serve HTTP only.
  // isBgWorker / clusterId are already defined above (DatabaseLogTransport section).
  try {
    if (isBgWorker && typeof initializeWorkers === "function") {
      await initializeWorkers();
      logger?.info("Background workers initialized");
    } else if (!isBgWorker) {
      logger?.info(
        `[Cluster] Worker ${clusterId} — HTTP only, background jobs handled by worker 0`,
      );
    }
  } catch (e) {
    logger?.warn("Workers not available");
  }

  // Domain verification worker — polls storefront_domains for pending custom domains
  // and checks TXT propagation. Runs on every process (lightweight interval, not BullMQ).
  try {
    const { startDomainVerificationWorker } = await import(
      "./workers/domainVerificationWorker.js"
    );
    startDomainVerificationWorker();
    logger?.info("Domain verification worker started");
  } catch (e) {
    logger?.warn(`Domain verification worker unavailable: ${e?.message}`);
  }

  // Domain lifecycle job — manages expiry states, auto-renewal, and grace periods.
  // Runs every 6 hours; first run is deferred 2 minutes post-startup.
  try {
    const { startDomainLifecycleJob } = await import(
      "./services/domainLifecycleJob.js"
    );
    startDomainLifecycleJob();
    logger?.info("[domainVerify] Domain lifecycle job started");
  } catch (e) {
    logger?.warn(`Domain lifecycle job unavailable: ${e?.message}`);
  }

  // ── Backfill: mark existing Max Booster-registered domain zones as verified ──
  // Domains registered through Max Booster are pre-authorized by subscription payment;
  // they should never require a TXT ownership verification step.
  try {
    const { pool: bPool } = await import("./db.js");
    const { rowCount } = await bPool?.query(`
      UPDATE dns_zones z
         SET is_verified = true,
             status      = 'active',
             updated_at  = NOW()
        FROM claimed_domains cd
       WHERE cd.domain          = z.domain
         AND cd.registrar_name  = 'maxbooster'
         AND (z.is_verified = false OR z.status = 'pending')
    `);
    if (rowCount && rowCount > 0) {
      logger?.info(
        `[domainVerify] Backfilled ${rowCount} Max Booster-owned zone(s) to verified/active`,
      );
    }
  } catch (e) {
    logger?.warn(`[domainVerify] Backfill skipped: ${e?.message}`);
  }

  // Initialize TensorFlow worker pool — keeps inference off the HTTP event loop
  try {
    const { tfWorkerPool } = await import("./lib/tensorflowWorkerPool.js");
    await tfWorkerPool?.initialize();
    // Load all persisted models into worker threads so inference is immediately available
    try {
      const { mlModelRegistry } = await import("./services/mlModelRegistry.js");
      await tfWorkerPool?.loadAllModels(mlModelRegistry);
    } catch (modelErr) {
      logger?.warn(`[TFWorkerPool] Model preload skipped: ${modelErr?.message}`);
    }
  } catch (e) {
    logger?.warn(`[TFWorkerPool] Initialization skipped: ${e?.message}`);
  }

  // Autonomous systems initialization is deferred to after server starts
  // to ensure fast cold start times for landing page loading

  // Import the four /api middleware modules concurrently — their initialization is
  // independent so there is no reason to await them one at a time (~1s saved).
  const [demoAuthResult, rateLimiterResult, admissionResult, apiCacheResult] =
    await Promise?.allSettled([
      import("./auth.js"),
      import("./middleware/scalableRateLimiter.js"),
      import("./middleware/admissionControl.js"),
      import("./middleware/apiCache.js"),
    ]);

  // Apply each in the correct precedence order (import order above matches use order)
  if (demoAuthResult?.status === "fulfilled") {
    app?.use("/api", demoAuthResult?.value.blockDemoWrite);
    logger?.info("✅ Demo write protection applied");
  } else {
    logger?.warn(
      `⚠️ Demo write protection not available: ${((demoAuthResult as PromiseRejectedResult).reason as Error)?.message}`,
    );
  }

  if (rateLimiterResult?.status === "fulfilled") {
    app?.use("/api", rateLimiterResult?.value.globalScalableRateLimiter);
    logger?.info("✅ Scalable rate limiter applied");
  } else {
    logger?.warn(
      `⚠️ Rate limiter not available: ${((rateLimiterResult as PromiseRejectedResult).reason as Error)?.message}`,
    );
  }

  if (admissionResult?.status === "fulfilled") {
    app?.use("/api", admissionResult?.value.admissionControl);
    logger?.info(
      "✅ Admission control applied (max concurrent: " +
        (process?.env.MAX_CONCURRENT_REQUESTS ?? "5000") +
        ")",
    );
  } else {
    logger?.warn(
      `⚠️ Admission control not available: ${((admissionResult as PromiseRejectedResult).reason as Error)?.message}`,
    );
  }

  if (apiCacheResult?.status === "fulfilled") {
    const { invalidateCacheOnMutation, cacheMiddleware } = apiCacheResult?.value;
    app?.use("/api", invalidateCacheOnMutation());
    const cachedRoutes: Record<string, number> = {
      "/api/bootstrap": 30,
      "/api/auth/me": 15,
      "/api/projects": 20,
      "/api/studio/projects": 20,
      "/api/analytics/dashboard": 60,
      "/api/marketplace/beats": 30,
      "/api/notifications": 10,
      "/api/notifications/unread-count": 10,
      "/api/royalties/summary": 60,
      "/api/achievements": 120,
    };
    const routeCacheMiddleware: import("express").RequestHandler = (
      req,
      res,
      next,
    ) => {
      if (req?.method !== "GET") return next();
      const basePath = req?.path.replace(/\/$/, "") || req?.path;
      const ttl = cachedRoutes[basePath];
      if (ttl)
        return cacheMiddleware({ ttlSeconds: ttl, varyByUser: true })(
          req,
          res,
          next,
        );
      next();
    };
    app?.use(routeCacheMiddleware);

    // Add stale-while-revalidate headers so browsers can serve cached API
    // responses immediately and refresh in background on repeat visits.
    const SWR_ROUTES: Record<string, string> = {
      "/api/bootstrap": "private, max-age=30, stale-while-revalidate=300",
      "/api/auth/me": "private, max-age=15, stale-while-revalidate=120",
      "/api/projects": "private, max-age=20, stale-while-revalidate=180",
      "/api/notifications": "private, max-age=10, stale-while-revalidate=60",
      "/api/notifications/unread-count":
        "private, max-age=10, stale-while-revalidate=60",
      "/api/royalties/summary":
        "private, max-age=60, stale-while-revalidate=600",
      "/api/analytics/dashboard":
        "private, max-age=60, stale-while-revalidate=600",
      "/api/achievements": "private, max-age=120, stale-while-revalidate=900",
    };
    app?.use("/api", (req, res, next) => {
      if (req?.method !== "GET") return next();
      const directive = SWR_ROUTES[req?.path.replace(/\/$/, "") || req?.path];
      if (directive && !res?.getHeader("Cache-Control")) {
        res?.setHeader("Cache-Control", directive);
      }
      next();
    });

    logger?.info(
      `✅ API response cache initialized (${Object?.keys(cachedRoutes).length} cached routes)`,
    );
  } else {
    logger?.warn(
      `⚠️ API cache middleware: ${((apiCacheResult as PromiseRejectedResult).reason as Error)?.message}`,
    );
  }

  // Prometheus metrics endpoint (before routes so it's always reachable)
  app.use(prometheusRouter);

  // HTTP request duration instrumentation for Prometheus
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const route =
        req.route?.path ||
        req.path.replace(/\/[0-9a-f-]{36}/gi, "/:id") ||
        "unknown";
      const durationSecs = (Date.now() - start) / 1000;
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };
      httpRequestDuration.observe(labels, durationSecs);
      httpRequestTotal.inc(labels);
    });
    next();
  });

  const { multiTenantRouter } = await import(
    "./middleware/multiTenantRouter.js"
  );
  app.use(multiTenantRouter);

  // Web Vitals ingestion endpoint — receives Core Web Vitals from the SPA.
  // Lightweight: log structured metric, no auth (any browser can post their own
  // perf numbers). Rate-limited via the global API limiter.
  app.post(
    "/api/metrics/web-vitals",
    express.json({ limit: "8kb" }),
    (req, res) => {
      try {
        const { name, value, rating, page } = req.body || {};
        if (typeof name !== "string" || typeof value !== "number") {
          return res.status(400).json({ ok: false });
        }
        logger.info(
          { metric: name, value, rating, page, ua: req.get("user-agent") },
          "[web-vitals]",
        );
        return res.status(204).end();
      } catch {
        return res.status(204).end();
      }
    },
  );

  await registerRoutes(httpServer, app);
  _routesReady = true;
  const { setRoutesReady: _setRoutesReady } = await import(
    "./lib/bootState.js"
  );
  _setRoutesReady();
  logger.info(
    "[Boot] Routes registered — boot stubs deactivated, real handlers active",
  );

  // Eagerly initialize push services so credentials are validated and status
  // is logged at startup rather than on first route hit.
  try {
    const { mobilePushService } = await import(
      "./services/mobilePushService.js"
    );
    logger.info(`📱 Mobile Push Service mode: ${mobilePushService.getMode()}`);
  } catch (e) {
    logger.warn(
      "[MobilePush] Failed to initialize at startup:",
      (e as Error).message,
    );
  }
  try {
    const { desktopPushService } = await import(
      "./services/desktopPushService.js"
    );
    logger.info(
      `🖥️  Desktop Push Service ready: ${desktopPushService.isReady()}`,
    );
  } catch (e) {
    logger.warn(
      "[DesktopPush] Failed to initialize at startup:",
      (e as Error).message,
    );
  }

  // Register subsystem health probes (DB, Redis, audit, automation) so
  // /api/ready can report on every dependency uniformly.
  try {
    const { registerCoreProbes } = await import("./lib/healthRegistry.js");
    registerCoreProbes();
  } catch (err) {
    logger.warn({ err }, "[Health] Failed to register core probes");
  }

  // Start retention background services
  try {
    const { reEngagementService } = await import(
      "./services/reEngagementService.js"
    );
    reEngagementService.startDailyCron();
    logger.info("[Retention] Re-engagement cron started");

    // ACME / Let's Encrypt renewal cron — no-ops cleanly when ACME_ENABLED!=true
    const { startAcmeRenewalCron } = await import("./services/acmeClient.js");
    startAcmeRenewalCron();

    // GeoIP database refresh — runs on the 1st of each month at 03:15 UTC
    const { startGeoDbRefreshCron } = await import("./services/geoDbRefresh.js");
    startGeoDbRefreshCron();

    const { recoverStaleProcessingBatches } = await import(
      "./services/featureEventBuffer.js"
    );
    recoverStaleProcessingBatches().catch((e) =>
      logger?.warn(
        "[Retention] Stale batch recovery failed (non-blocking):",
        e?.message,
      ),
    );

    const { getRetentionQueue, startRetentionWorker } = await import(
      "./lib/scaleJobQueue.js"
    );
    const retentionQueue = getRetentionQueue();
    startRetentionWorker();

    setInterval(
      async () => {
        try {
          await retentionQueue?.add("dunning-process", { limit: 50 });
        } catch (e) {
          /* non-critical */
        }
      },
      6 * 60 * 60 * 1000,
    );
    logger?.info("[Retention] Dunning processor enqueued (6h interval)");

    setInterval(
      async () => {
        try {
          await retentionQueue?.add("health-score-batch", {
            cursor: 0,
            batchSize: 100,
          });
        } catch (e) {
          /* non-critical */
        }
      },
      24 * 60 * 60 * 1000,
    );
    logger?.info(
      "[Retention] Health score batch processor enqueued (24h interval)",
    );

    setInterval(async () => {
      try {
        await retentionQueue?.add("feature-event-flush", {});
      } catch (e) {
        /* non-critical */
      }
    }, 60 * 1000);
    logger?.info(
      "[Retention] Feature event buffer flush enqueued (60s interval)",
    );

    // Engagement analytics refresh: collect real engagement data from platform APIs
    // for all active campaigns every 8 hours (platform API rate-limit friendly)
    setInterval(
      async () => {
        try {
          const { advertisingDispatchService } = await import(
            "./services/advertisingDispatchService.js"
          );
          await advertisingDispatchService?.collectAllActiveEngagement();
        } catch (e) {
          logger?.warn("[Engagement] Refresh failed (non-fatal):", e?.message);
        }
      },
      8 * 60 * 60 * 1000,
    );
    logger?.info(
      "[Engagement] Social engagement refresh cron started (8h interval)",
    );
  } catch (retentionErr) {
    const errMsg =
      retentionErr instanceof Error
        ? `${retentionErr?.message}\n${retentionErr?.stack}`
        : String(retentionErr);
    logger?.warn("[Retention] Background services failed to start:\n" + errMsg);
  }

  // JSON 404 handler for unmatched API routes (must be after all API routes)
  // This prevents the SPA fallback from returning HTML for missing API endpoints
  // Uses path-agnostic approach to respect multi-handler pipelines
  app?.use((req: Request, res: Response, next: NextFunction) => {
    if (!res?.headersSent && req?.originalUrl.startsWith("/api/")) {
      return res?.status(404).json({
        error: "Not found",
        message: `API endpoint ${req?.originalUrl} does not exist`,
        status: 404,
      });
    }
    return next();
  });

  // SEO routes must be registered before global error handler so their errors are caught
  try {
    const seoRoutes = (await import("./routes/seo.js")).default;
    app?.use(seoRoutes);
  } catch (e) {
    logger?.warn(`⚠️ SEO routes not available: ${e?.message}`);
  }

  // ── Platform Subdomain Router ────────────────────────────────────────────────
  // Handles requests to {label}.max-booster?.com — Max Booster's built-in
  // storefront subdomain system.  Each artist can claim e.g. beatsby.max-booster.com
  // and this middleware resolves the label → storefront slug and serves the SPA.
  //
  // Requires a wildcard DNS record at the registrar:
  //   *.max-booster.com  →  A/CNAME  →  this app's IP / deployed hostname
  //
  // API + asset paths are passed through so the full app still works on the subdomain.
  app?.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const BASE = process?.env.BASE_DOMAIN || "max-booster.com";
      const host = req?.hostname ?? "";

      // Only intercept true subdomains of the platform domain (not the root itself)
      if (host === BASE || !host?.endsWith(`.${BASE}`)) return next();

      // Let API calls, assets, and Vite HMR pass through unchanged
      const p = req?.path;
      if (
        p?.startsWith("/api/") ||
        p?.startsWith("/assets/") ||
        p?.startsWith("/@") ||
        p?.startsWith("/node_modules/")
      )
        return next();

      const label = host
        .slice(0, -`.${BASE}`.length)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");
      if (!label) return next();

      // Already on the /storefront/ path — SPA will render it, nothing to do
      if (p?.startsWith("/storefront/")) return next();

      const { db: sDb } = await import("./db.js");
      const { storefrontDomains: sDoms, storefronts: sStores } = await import(
        "@shared/schema"
      );
      const { eq, and } = await import("drizzle-orm");
      const fqdn = `${label}.${BASE}`;

      // 1. storefront_domains registry — any type (managed_subdomain, custom_domain, platform_subdomain)
      const { inArray } = await import("drizzle-orm");
      const [domRow] = await sDb
        .select({ slug: sStores.slug })
        .from(sDoms)
        .innerJoin(sStores, eq(sDoms?.storefrontId, sStores?.id))
        .where(
          and(
            eq(sDoms?.domain, fqdn),
            inArray(sDoms?.type, [
              "managed_subdomain",
              "custom_domain",
              "platform_subdomain",
            ]),
          ),
        )
        .limit(1);

      if (domRow?.slug) {
        return res?.redirect(302, `/storefront/${domRow?.slug}`);
      }

      // 2. Claimed domains registry — try by domain name even without storefrontId,
      //    falling back to slug derived from subdomain label
      const { claimedDomains: cDoms } = await import("@shared/schema");
      const [claimRow] = await sDb
        .select({ slug: sStores.slug, storefrontId: cDoms.storefrontId })
        .from(cDoms)
        .leftJoin(sStores, eq(cDoms?.storefrontId, sStores?.id))
        .where(eq(cDoms?.domain, fqdn))
        .limit(1);

      if (claimRow?.slug) {
        return res?.redirect(302, `/storefront/${claimRow?.slug}`);
      }

      // 3. Direct slug match (artist's slug == subdomain label)
      const [slugRow] = await sDb
        .select({ slug: sStores.slug })
        .from(sStores)
        .where(eq(sStores.slug, label))
        .limit(1);

      if (slugRow.slug) {
        return res.redirect(302, `/storefront/${slugRow.slug}`);
      }

      // No match — fall through to SPA (will show not-found)
      return next();
    } catch (err) {
      logger.warn({ err }, "[subdomain] routing error");
      return next();
    }
  });

  // Storefront short-link: /s/:label → /storefront/:slug (backward compat)
  app.get(
    "/s/:label",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { db: sDb } = await import("./db.js");
        const { storefrontDomains: sDomains, storefronts: sStorefronts } =
          await import("@shared/schema");
        const { eq, and } = await import("drizzle-orm");
        const BASE = process.env.BASE_DOMAIN || "max-booster.com";
        const label = String(req.params.label)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "");

        // 1. Check managed subdomain registry (e.g. b-lawz-music reserved via UI)
        const fqdn = `${label}.${BASE}`;
        const [domRow] = await sDb
          .select({ slug: sStorefronts.slug })
          .from(sDomains)
          .innerJoin(sStorefronts, eq(sDomains.storefrontId, sStorefronts.id))
          .where(
            and(
              eq(sDomains.domain, fqdn),
              eq(sDomains.type, "managed_subdomain"),
            ),
          )
          .limit(1);
        if (domRow.slug) {
          return res.redirect(302, `/storefront/${domRow.slug}`);
        }

        // 2. Fall back to direct slug match (label == storefront slug)
        const [slugRow] = await sDb
          .select({ slug: sStorefronts.slug })
          .from(sStorefronts)
          .where(eq(sStorefronts.slug, label))
          .limit(1);
        if (slugRow.slug) {
          return res.redirect(302, `/storefront/${slugRow.slug}`);
        }

        return next();
      } catch (err) {
        logger.warn({ err: err }, "[/s/:label] lookup error:");
        return next();
      }
    },
  );

  // MANDATORY global error handler (from safety module) - must be LAST middleware
  app.use(safetyErrorHandler);

  if (isProductionEnv()) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app);
  }
  // Real SPA handler is now registered — disable the boot-time fallback shim.
  _spaHandlerReady = true;
  logger.info("✅ [SPA] Vite/static handler ready — boot fallback deactivated");

  // Python AI microservice replaced by MaxCore (https://secure-ai-forge.replit.app)

  // Server is already listening (early listen above). Kick off deferred init now.
  log(`all middleware and routes registered — kicking off autonomous systems`);
  setImmediate(async () => {
    logger.info("");
    logger.info(
      "🤖 ═══════════════════════════════════════════════════════════",
    );
    logger.info("🤖 INITIALIZING AUTONOMOUS SYSTEMS (background)");
    logger.info(
      "🤖 ═══════════════════════════════════════════════════════════",
    );

    // 0-pre. Distributed cache — deferred so PDIM rate-limit retries don't
    // stall route registration.  Falls back to in-memory until connected.
    // Stagger the connect() across cluster workers so they don't all hammer
    // PDIM simultaneously at startup: worker N waits N × 1 500 ms before
    // connecting.  Worker 0 (BG) connects immediately; workers 1 and 2 wait
    // 1.5 s and 3 s respectively.  Total PDIM connection window ≤ 3 s instead
    // of all workers colliding in the same 200 ms window and triggering 429s.
    const _pdimWorkerDelay =
      parseInt(process.env.CLUSTER_WORKER_ID || "0", 10) * 1500;
    if (_pdimWorkerDelay > 0) {
      logger.info(
        `[DistributedCache] Staggering connect by ${_pdimWorkerDelay}ms (worker ${process.env.CLUSTER_WORKER_ID})`,
      );
      await new Promise((resolve) => setTimeout(resolve, _pdimWorkerDelay));
    }
    try {
      await distributedCache.connect();
      logger.info("✅ [DistributedCache] Connected (deferred)");
      // Start the API cache cross-pod invalidation poller now that PDIM is live.
      // The poller reads PDIM every 100 ms and evicts L1 entries when another pod
      // has signalled an invalidation — equivalent to pub/sub but using PDIM key-polling
      // (PDIM stubs PUBLISH/SUBSCRIBE as no-ops; see pdimClient.ts:1080-1084).
      try {
        const { apiCache: _ac } = await import("./middleware/apiCache.js");
        _ac.startPoller();
      } catch (pollerErr: unknown) {
        logger.warn(
          `⚠️ API cache invalidation poller failed to start: ${(pollerErr as Error).message}`,
        );
      }
    } catch (e) {
      logger.warn(
        `⚠️ Distributed cache connect failed (non-fatal, in-memory fallback active): ${e.message}`,
      );
    }

    // 0a. Stripe products — network call, not needed before first payment request
    try {
      const priceIds = await ensureStripeProductsAndPrices();
      logger.info("✅ Stripe products and prices initialized");
      logger.info(
        `   Monthly: ${priceIds.monthly} | Yearly: ${priceIds.yearly} | Lifetime: ${priceIds.lifetime}`,
      );
    } catch (e) {
      logger.warn(`❌ Failed to initialize Stripe prices: ${e.message}`);
    }

    // 0b. Admin account seeding — idempotent, safe to run after listen
    try {
      const { initializeAdmin } = await import("./init-admin.js");
      await initializeAdmin();
      logger.info("✅ Admin account initialized");
    } catch (e) {
      logger.warn(`❌ Failed to initialize admin: ${e.message}`);
    }

    // 0c. Onboarding task seeding
    try {
      const { onboardingService } = await import(
        "./services/onboardingService.js"
      );
      await onboardingService.seedDefaultTasks();
      await onboardingService.ensureAITasksExist();
    } catch (e) {
      logger.warn(`⚠️ Could not seed onboarding tasks: ${e.message}`);
    }

    // 0d. Hybrid Storage System (Replit hot + Pocket Dimension cold)
    try {
      const { hybridStorageService } = await import(
        "./services/hybridStorageService.js"
      );
      await hybridStorageService.initialize();
      logger.info(
        "✅ [Storage] Hybrid Storage initialized (Replit Object Storage + Pocket Dimension)",
      );

      // Auto-tiering runs on worker 0 only — it's a maintenance sweep that
      // reads/writes PDIM and does not need to run on every cluster worker.
      if (isBgWorker) {
        const autoTierInterval = 6 * 60 * 60 * 1000;
        setInterval(async () => {
          try {
            const result = await hybridStorageService?.runAutoTiering();
            if (result?.tieredDown > 0 || result?.tieredUp > 0) {
              logger?.info(
                `[Storage] Auto-tiering: ${result?.tieredDown} files moved to cold, ${result?.tieredUp} promoted to hot`,
              );
            }
          } catch (e) {
            logger?.warn(`[Storage] Auto-tiering error: ${e?.message}`);
          }
        }, autoTierInterval);
        logger?.info(
          "✅ [Storage] Auto-tiering scheduler started (every 6 hours)",
        );
      }
    } catch (e) {
      logger?.warn(`⚠️ [Storage] Hybrid Storage init: ${e?.message}`);
    }

    // 0e. Pocket Dimension Fabric (Distributed storage layer + Auto-cluster)
    try {
      const { initializeFabric, autoClusterManager } = await import(
        "./pocket-dimension/fabric/index.js"
      );
      await initializeFabric();
      logger?.info("✅ [PocketFabric] Distributed fabric storage initialized");
      killSwitch?.registerSystem("pocket-fabric-autocluster" as string, {
        kill: () => autoClusterManager?.stop(),
        resume: () => autoClusterManager?.start(),
      });
    } catch (e) {
      logger?.warn(`⚠️ [PocketFabric] Fabric init: ${e?.message}`);
    }

    // 1. Autonomous Service (Core)
    try {
      const mod = await import("./services/autonomousService.js");
      const svc = mod?.autonomousService;
      if (svc && typeof svc?.getStatus === "function") {
        // Only start autonomous operations on the background worker (worker 0).
        // All other workers serve HTTP only — running autonomous ops on every
        // worker multiplies PDIM load and MaxCoreAI calls by the worker count.
        if (isBgWorker) {
          if (typeof svc?.startAutonomousOperations === "function") {
            svc?.startAutonomousOperations();
          }
          logger?.info(`✅ [Autonomy] Autonomous Service started on worker 0`);
        } else {
          logger?.info(
            `[Autonomy] Worker ${clusterId} — autonomous ops handled by worker 0`,
          );
        }
        const status = svc?.getStatus();
        logger?.info(
          `✅ [Autonomy] Autonomous Service initialized - Running: ${status?.isRunning}`,
        );
        killSwitch?.registerSystem("autonomous-service", {
          kill: () => {
            if (typeof svc?.stopAutonomousOperations === "function")
              svc?.stopAutonomousOperations();
          },
          resume: () => {
            if (
              isBgWorker &&
              typeof svc?.startAutonomousOperations === "function"
            )
              svc?.startAutonomousOperations();
          },
        });
      }
    } catch (e) {
      logger?.warn(`⚠️ [Autonomy] Autonomous Service: ${e?.message}`);
    }

    // 2. Automation System
    try {
      const mod = await import("./automation-system.js");
      const AutomationSystemClass = mod?.AutomationSystem ?? mod?.default;
      if (
        AutomationSystemClass &&
        typeof AutomationSystemClass?.getInstance === "function"
      ) {
        const system = AutomationSystemClass?.getInstance();
        logger?.info("✅ [Autonomy] Automation System initialized");
        killSwitch?.registerSystem("automation-system", {
          kill: () => {
            (system as Record<string, unknown>)._killSwitchPaused = true;
            logger?.warn("[AutomationSystem] Paused by kill switch");
          },
          resume: () => {
            (system as Record<string, unknown>)._killSwitchPaused = false;
            logger?.info("[AutomationSystem] Resumed");
          },
        });
      }
    } catch (e) {
      logger?.warn(`⚠️ [Autonomy] Automation System: ${e?.message}`);
    }

    // 3. Autonomous Updates Orchestrator
    try {
      const mod = await import("./autonomous-updates.js");
      const orchestrator =
        mod?.autonomousUpdates ?? mod?.AutonomousUpdatesOrchestrator;
      if (orchestrator) {
        if (typeof orchestrator?.configure === "function") {
          await orchestrator?.configure({
            enabled: true,
            frequency: "hourly",
            industryMonitoringEnabled: true,
            aiTuningEnabled: true,
            platformOptimizationEnabled: true,
          });
        } else if (typeof orchestrator?.start === "function") {
          await orchestrator?.start();
        }
        logger?.info("✅ [Autonomy] Auto-Upgrade System ENABLED");
        killSwitch?.registerSystem("autonomous-updates", {
          kill: () => {
            if (typeof orchestrator?.stop === "function") orchestrator?.stop();
          },
          resume: () => {
            if (typeof orchestrator?.start === "function") orchestrator?.start();
          },
        });
      }
    } catch (e) {
      logger?.warn(`⚠️ [Autonomy] Autonomous Updates: ${e?.message}`);
    }

    // 4-9. Other autonomous modules — load in parallel then register with kill switch
    const parallelMods = await Promise?.allSettled([
      import("./autonomous-autopilot.js"),
      import("./autopilot-engine.js"),
      import("./services/autoPostingService.js"),
      import("./services/autoPostingServiceV2.js"),
      import("./services/autoPostGenerator.js"),
      import("./services/autopilotPublisher.js"),
    ]);

    // 4. Autonomous Autopilot
    if (parallelMods[0].status === "fulfilled") {
      const mod = (
        parallelMods[0] as PromiseFulfilledResult<Record<string, unknown>>
      ).value;
      if (mod?.autonomousAutopilot) {
        logger?.info("✅ [Autonomy] Autonomous Autopilot loaded");
        killSwitch?.registerSystem("autonomous-autopilot", {
          kill: () => {
            if (
              typeof mod?.autonomousAutopilot.stopAutonomousMode === "function"
            )
              mod?.autonomousAutopilot.stopAutonomousMode();
          },
          resume: () => {
            logger?.info(
              "[AutonomousAutopilot] Kill switch released — restart per-user as needed",
            );
          },
        });
      }
    } else
      logger?.warn(
        `⚠️ [Autonomy] Autonomous Autopilot: ${((parallelMods[0] as PromiseRejectedResult).reason as Error)?.message}`,
      );

    // 5. Autopilot Engine
    if (parallelMods[1].status === "fulfilled") {
      const mod = (
        parallelMods[1] as PromiseFulfilledResult<Record<string, unknown>>
      ).value;
      const engine =
        mod?.autopilotEngine ??
        (mod?.AutopilotEngine ? new mod.AutopilotEngine() : null);
      if (engine) {
        logger?.info("✅ [Autonomy] Autopilot Engine loaded");
        killSwitch?.registerSystem("autopilot-engine", {
          kill: () => {
            if (typeof engine?.stop === "function") engine?.stop();
          },
          resume: () => {
            if (typeof engine?.start === "function") engine?.start();
          },
        });
      }
    } else
      logger?.warn(
        `⚠️ [Autonomy] Autopilot Engine: ${((parallelMods[1] as PromiseRejectedResult).reason as Error)?.message}`,
      );

    // 6. Auto-Posting Service V1
    if (parallelMods[2].status === "fulfilled") {
      const mod = (
        parallelMods[2] as PromiseFulfilledResult<Record<string, unknown>>
      ).value;
      if (mod?.autoPostingService) {
        logger?.info("✅ [Autonomy] Auto-Posting Service V1 initialized");
        killSwitch?.registerSystem("auto-posting-v1", {
          kill: () => {
            if (typeof mod?.autoPostingService.pause === "function")
              mod?.autoPostingService.pause();
          },
          resume: () => {
            if (typeof mod?.autoPostingService.resume === "function")
              mod?.autoPostingService.resume();
          },
        });
      }
    } else
      logger?.warn(
        `⚠️ [Autonomy] Auto-Posting V1: ${((parallelMods[2] as PromiseRejectedResult).reason as Error)?.message}`,
      );

    // 7. Auto-Posting Service V2
    if (parallelMods[3].status === "fulfilled") {
      const mod = (
        parallelMods[3] as PromiseFulfilledResult<Record<string, unknown>>
      ).value;
      if (mod?.autoPostingServiceV2) {
        logger?.info("✅ [Autonomy] Auto-Posting Service V2 initialized");
        killSwitch?.registerSystem("auto-posting-v2", {
          kill: () => {
            if (typeof mod?.autoPostingServiceV2.pause === "function")
              mod?.autoPostingServiceV2.pause();
          },
          resume: () => {
            if (typeof mod?.autoPostingServiceV2.resume === "function")
              mod?.autoPostingServiceV2.resume();
          },
        });
      }
    } else
      logger?.warn(
        `⚠️ [Autonomy] Auto-Posting V2: ${((parallelMods[3] as PromiseRejectedResult).reason as Error)?.message}`,
      );

    // 8. Auto Post Generator (stateless — no running loop; kill switch flag surfaced via log)
    if (parallelMods[4].status === "fulfilled") {
      const mod = (
        parallelMods[4] as PromiseFulfilledResult<Record<string, unknown>>
      ).value;
      if (mod?.autoPostGenerator) {
        logger?.info("✅ [Autonomy] Auto Post Generator initialized");
        killSwitch?.registerSystem("auto-post-generator", {
          kill: () => {
            (mod.autoPostGenerator as Record<string, unknown>)._killed = true;
            logger?.warn("[AutoPostGenerator] Paused by kill switch");
          },
          resume: () => {
            (mod.autoPostGenerator as Record<string, unknown>)._killed = false;
            logger?.info("[AutoPostGenerator] Resumed");
          },
        });
      }
    } else
      logger?.warn(
        `⚠️ [Autonomy] Auto Post Generator: ${((parallelMods[4] as PromiseRejectedResult).reason as Error)?.message}`,
      );

    // 9. Autopilot Publisher
    if (parallelMods[5].status === "fulfilled") {
      const mod = (
        parallelMods[5] as PromiseFulfilledResult<Record<string, unknown>>
      ).value;
      if (mod?.autopilotPublisher) {
        logger?.info("✅ [Autonomy] Autopilot Publisher initialized");
        killSwitch?.registerSystem("autopilot-publisher", {
          kill: () => {
            if (typeof mod?.autopilotPublisher.stopScheduler === "function")
              mod?.autopilotPublisher.stopScheduler();
          },
          resume: () => {
            if (typeof mod?.autopilotPublisher.startScheduler === "function")
              mod?.autopilotPublisher.startScheduler();
          },
        });
      }
    } else
      logger?.warn(
        `⚠️ [Autonomy] Autopilot Publisher: ${((parallelMods[5] as PromiseRejectedResult).reason as Error)?.message}`,
      );

    logger?.info(
      "🤖 ═══════════════════════════════════════════════════════════",
    );
    logger?.info("🤖 AUTONOMOUS SYSTEMS READY");

    // Built-in authoritative DNS server for *.maxbooster?.replit.app
    import("./services/dnsServer.js")
      .then(({ startDNSServer }) => {
        startDNSServer().catch((e) =>
          logger?.warn("[DNS] Start error:", e?.message),
        );
      })
      .catch(() => {});

    // Base model trainer and MaxCore weight sync run on worker 0 only.
    // Each worker running its own sync cycle multiplies MaxCore HTTP calls
    // and PDIM writes by the cluster worker count (seen as N identical
    // [MaxCoreSync] ✅ synced log lines in production at the same timestamp).
    if (isBgWorker) {
      import("./services/baseModelTrainer.js")
        .then(({ runBaseModelTraining }) => {
          runBaseModelTraining().catch((e) => {
            logger?.warn(
              `[BaseTrainer] Background training error: ${e instanceof Error ? e?.message : String(e)}`,
            );
          });
        })
        .catch(() => {});

      // MaxCore + PDIM connectivity probe, weight sync, and training feedback wiring
      import("./services/maxcoreSync.js")
        .then(({ initMaxCoreSync }) => {
          initMaxCoreSync().catch((e) =>
            logger?.warn("[MaxCoreSync] Init error:", e?.message),
          );
        })
        .catch(() => {});
    } else {
      logger?.info(
        `[Sync] Worker ${clusterId} — base trainer + MaxCore sync handled by worker 0`,
      );
    }

    // MaxCore Score Calibrator — calibrates VeoGate weights/thresholds against 8TB corpus.
    // Runs on worker 0 only: each calibration fires 5 sequential MaxCore generate calls
    // (~31 s total).  Both workers running it would double that to 10 calls with duplicate
    // results and redundant log noise.
    if (isBgWorker) {
      import("./services/maxcoreScoreCalibrator.js")
        .then(({ initScoreCalibrator }) => {
          initScoreCalibrator();
        })
        .catch(() => {});
    } else {
      logger?.info(
        `[ScoreCalibrator] Worker ${clusterId} — calibration handled by worker 0`,
      );
    }

    // Diffusion self-training: starts 60s after boot so server is stable first.
    // Runs on worker 0 only: spawning Python synthesizer?.py from multiple workers
    // causes file-lock contention on meta?.json / memory?.json and doubles CPU load.
    // startBackgroundTraining() checks the MaxCore Diffusion Gateway on port 8008
    // first — if the Gateway is running, the local synthesizer is skipped (MaxCore
    // is the authoritative diffusion training source).
    if (isBgWorker) {
      setTimeout(() => {
        import("./services/diffusionBackgroundTrainer.js")
          .then(({ startBackgroundTraining }) => {
            startBackgroundTraining()
              .then((result?: void) => {
                logger?.info(
                  "🎬 [DiffBG] Diffusion trainer initialised (MaxCore Gateway or local fallback)",
                );
              })
              .catch((e) =>
                logger?.warn(
                  "[DiffBG] Background trainer init error:",
                  e?.message,
                ),
              );
          })
          .catch((e) =>
            logger?.warn(
              "[DiffBG] Could not import background trainer:",
              e?.message,
            ),
          );
      }, 60_000);
    } else {
      logger?.info(
        `[DiffBG] Worker ${clusterId} — diffusion training handled by worker 0`,
      );
    }

    // Neon keepalive: pool idleTimeoutMillis=60s, keepalive pings every 25s so
    // connections are refreshed well before the idle timeout fires.  Without this,
    // the 10s default idleTimeout caused connections to die between 30s pings,
    // producing a 5000+ms reconnect spike on the next background-job query.
    // Both primary and replica pools are kept alive.
    try {
      const { pool: _keepPool, replicaPool: _replicaKeepPool } = await import(
        "./db.js"
      );
      const keepalive = setInterval(() => {
        _keepPool?.query("SELECT 1").catch(() => {});
        if (_replicaKeepPool)
          _replicaKeepPool?.query("SELECT 1").catch(() => {});
      }, 25_000);
      keepalive?.unref();
      logger?.info(
        "[DB] Keepalive started — pinging primary + replica every 25s to prevent Neon cold-start latency",
      );
    } catch {
      // Non-fatal — server continues without keepalive
    }

    logger?.info(
      "🤖 ═══════════════════════════════════════════════════════════",
    );
  });
})().catch((error) => {
  console?.error("FATAL: Server startup failed:", error);
  logger?.warn({ err: error }, "FATAL: Server startup failed");
  process?.exit(1);
});

// Graceful shutdown — stops accepting new connections, drains in-flight requests,
// then closes the DB pool. Hard-exits after 10 s so autoscale SIGKILL is never needed.
// Guard against concurrent invocations (multiple signal handlers can fire at once).
let _shutdownInProgress = false;

async function gracefulShutdown(signal: string, exitCode = 0): Promise<void> {
  if (_shutdownInProgress) return;
  _shutdownInProgress = true;

  logger?.info(`[Shutdown] Received ${signal}, starting graceful shutdown...`);

  // Hard deadline: autoscale sends SIGKILL at ~30 s, so we must complete within 25 s.
  const hardExit = setTimeout(() => {
    logger?.warn("[Shutdown] Hard timeout reached — forcing exit");
    process?.exit(exitCode);
  }, 25_000);
  hardExit?.unref(); // do not keep the event loop alive just for this timer

  try {
    // 1. Stop accepting new HTTP connections so the load balancer re-routes immediately.
    await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
    logger?.info("[Shutdown] HTTP server closed");
  } catch (err) {
    logger?.warn({ err: err }, "[Shutdown] Error closing HTTP server:");
  }

  try {
    // 2. Close BullMQ workers — waits for the current job to finish then stops.
    //    Import is dynamic so this file compiles even if workers module is absent.
    const { shutdownWorkers } = await import("./workers/index.js");
    await Promise?.race([
      shutdownWorkers(),
      new Promise<void>((_, rej) =>
        setTimeout(() => rej(new Error("BullMQ drain timeout")), 10_000),
      ),
    ]);
    logger?.info("[Shutdown] BullMQ workers drained");
  } catch (err) {
    logger?.warn("[Shutdown] BullMQ drain error (non-fatal):", err?.message);
  }

  try {
    // 3. Flush any debounced autopilot-coordinator PDIM persists so the last
    //    ≤ debounce-window of queue/insight mutations isn't lost on shutdown.
    const { autopilotCoordinatorService } = await import(
      "./services/autopilotCoordinatorService.js"
    );
    await Promise.race([
      autopilotCoordinatorService.flushPendingPersists(),
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ]);
    logger.info("[Shutdown] Autopilot coordinator persists flushed");
  } catch {
    /* non-critical */
  }

  try {
    // 4. Stop the built-in DNS server.
    const { stopDNSServer } = await import("./services/dnsServer.js");
    await stopDNSServer();
  } catch {
    /* non-critical */
  }

  try {
    // 4. Stop the platform auto-fixer probe loop.
    const { platformAutoFixer } = await import(
      "./services/platformAutoFixer.js"
    );
    (platformAutoFixer as { stop?: () => void }).stop?.();
    logger.info("[Shutdown] PlatformAutoFixer stopped");
  } catch {
    /* non-critical */
  }

  try {
    // 4. Close the database pool so in-flight queries complete before the process exits.
    const { pool } = await import("./db.js");
    await pool.end();
    logger.info("[Shutdown] Database pool closed");
  } catch (err) {
    logger.warn({ err: err }, "[Shutdown] Error closing DB pool:");
  }

  clearTimeout(hardExit);
  process.exit(exitCode);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM", 0));
process.on("SIGINT", () => gracefulShutdown("SIGINT", 0));

process.on("uncaughtException", (error: Error) => {
  // EPIPE/ECONNRESET/ECONNABORTED are non-fatal stream/pipe errors (e.g. FFmpeg exits mid-render)
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EPIPE" || code === "ECONNRESET" || code === "ECONNABORTED")
    return;
  const eMsg = error.message ?? "";
  // PDIM 500/502 during cold-start: the circuit breaker slow-lane already
  // handles these — no additional log or shutdown needed.
  if (/PDIM HTTP 5/i.test(eMsg)) return;
  // Truncate to first line so pino-pretty doesn't emit bare multi-line stack
  // traces that appear without timestamp prefixes in the workflow logs.
  const summary = eMsg?.split("\n")[0] ?? eMsg;
  logger?.warn(
    { errMsg: summary },
    "[Process] Uncaught exception — shutting down:",
  );
  gracefulShutdown("uncaughtException", 1);
});

process?.on("unhandledRejection", (reason: unknown) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  const code = (reason as NodeJS.ErrnoException)?.code;

  // Non-fatal: known transient errors that the ChainFixer / circuit breaker
  // handle automatically.  Suppress them so they do not trigger a restart.
  const isNonFatal =
    (code && ["EPIPE", "ECONNRESET", "ECONNABORTED"].includes(code)) ||
    /EPIPE|ECONNRESET|ECONNABORTED|ECONNREFUSED|AbortError|fetch failed|Failed to fetch|Command timed out|Connection is closed|\[PDIM\] Circuit OPEN|\[LuaExecutor\] script timeout|\[LuaExecutor\] Wait queue saturated|erroredJobIds|PDIM.*Circuit|script timeout exceeded|PDIM HTTP 5/i?.test(
      err?.message,
    );

  if (isNonFatal) return; // instrument?.ts already logs as warn

  // Fatal unhandled rejection: the process is in an unknown state.
  // Trigger a graceful shutdown so the process manager can restart clean.
  // This mirrors the uncaughtException handler behaviour and ensures no
  // "zombie" server serves requests from a corrupted async call stack.
  logger?.warn(
    { err },
    "[Process] Fatal unhandled promise rejection — shutting down:",
  );
  gracefulShutdown("unhandledRejection", 1);
});
