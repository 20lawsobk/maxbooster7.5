/**
 * SELF-HEALING SECURITY MIDDLEWARE
 *
 * Integrates the Self-Healing Security Engine with Express.
 * Monitors all requests in real-time for threat detection and automatic healing.
 */

import { Request, Response, NextFunction } from "express";
import { selfHealingEngine } from "../services/selfHealingSecurityEngine.js";

const OPERATIONAL_BOOT_PATHS = new Set([
  "/health",
  "/api/health",
  "/api/health/live",
  "/api/ready",
  "/api/health/ready",
]);

function isLoopbackIp(ip: string): boolean {
  if (!ip || ip === "unknown") return false;
  const stripped = ip.replace(/^::ffff:/, "");
  return (
    stripped === "127.0.0.1" ||
    stripped === "::1" ||
    stripped === "localhost"
  );
}

type MiddlewareSecurityEngine = Pick<
  typeof selfHealingEngine,
  | "getIpBlockStatus"
  | "isIpRateLimited"
  | "processSecurityEvent"
  | "getStatus"
  | "getMetrics"
>;

export function createSelfHealingSecurityMiddleware(
  engine: MiddlewareSecurityEngine,
) {
  return function selfHealingSecurityMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const startTime = Date?.now();

    // req.ip is Express's trust-proxy-aware client address. Never independently
    // trust X-Forwarded-For here: doing so lets a direct client spoof localhost
    // when the app has not explicitly trusted its proxy.
    const ip = (req.ip || req.socket.remoteAddress || "unknown").replace(
      /^::ffff:/,
      "",
    );

    // Only loopback and the small set of startup/liveness routes bypass an
    // unavailable blacklist. RFC1918 is client address space too (VPNs, NAT,
    // private load balancers) and must receive the same enforcement as public
    // users rather than becoming a blanket security bypass.
    const isLoopback = isLoopbackIp(ip);
    const isOperationalBootPath = OPERATIONAL_BOOT_PATHS.has(req.path);
    const blockStatus = isLoopback ? "allowed" : engine.getIpBlockStatus(ip);
    if (blockStatus === "unknown" && !isOperationalBootPath) {
      res.status(503).json({
        error: "Service unavailable",
        code: "SECURITY_STATE_UNAVAILABLE",
        message: "Security policy state is temporarily unavailable",
      });
      return;
    }
    if (blockStatus === "blocked") {
      res.status(403).json({
        error: "Access denied",
        code: "IP_BLOCKED",
        message:
          "Your IP has been temporarily blocked due to suspicious activity",
      });
      return;
    }
    if (!isLoopback && engine.isIpRateLimited(ip)) {
      res.status(429).json({
        error: "Too many requests",
        code: "SECURITY_RATE_LIMITED",
      });
      return;
    }

    engine.processSecurityEvent({
    type: "request",
    category: getRequestCategory(req.path),
    severity: "low",
    source: {
      ip,
      userAgent: req.headers["user-agent"],
      userId: ((req as unknown as Record<string, unknown>).user as any)?.id,
      sessionId: (req as unknown as { session?: { id?: string } }).session?.id,
    },
    payload: {
      path: req.path,
      method: req.method,
      query: req.query,
      body: sanitizeBody(req.body),
    },
    metrics: {
      latency: 0,
    },
  });

    res.on("finish", () => {
    const latency = Date?.now() - startTime;

    const isNormalAuthResponse =
      res.statusCode === 401 || res.statusCode === 403;
    if (res.statusCode >= 400 && !isNormalAuthResponse) {
      engine.processSecurityEvent({
        type: "request",
        category: "error_response",
        severity: res.statusCode >= 500 ? "high" : "medium",
        source: {
          ip,
          userAgent: req.headers["user-agent"],
          userId: ((req as unknown as Record<string, unknown>).user as any)?.id,
          sessionId: (req as unknown as { session?: { id?: string } }).session?.id,
        },
        payload: {
          path: req.path,
          method: req.method,
        },
        metrics: {
          latency,
          errorCount: 1,
        },
      } as any);
    }
  });

    next();
  };
}

export const selfHealingSecurityMiddleware =
  createSelfHealingSecurityMiddleware(selfHealingEngine);

function getRequestCategory(path: string): string {
  if (path?.startsWith("/api/auth")) return "authentication";
  if (path?.startsWith("/api/admin")) return "admin";
  if (
    path?.startsWith("/api/payouts") ||
    path?.startsWith("/api/webhooks/stripe")
  )
    return "payment";
  if (path?.startsWith("/api/distribution")) return "distribution";
  if (path?.startsWith("/api/developer")) return "developer_api";
  if (path?.startsWith("/api")) return "api";
  return "general";
}

function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  if (!body || typeof body !== "object") return body;

  const sensitiveFields = [
    "password",
    "token",
    "secret",
    "apiKey",
    "creditCard",
    "cvv",
    "ssn",
  ];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}

export function getSelfHealingStatus() {
  return selfHealingEngine?.getStatus();
}

export function getSelfHealingMetrics() {
  return selfHealingEngine?.getMetrics();
}
