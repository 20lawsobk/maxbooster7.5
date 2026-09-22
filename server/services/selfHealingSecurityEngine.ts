import { randomBytes } from "crypto";
/**
 * SELF-HEALING SECURITY ENGINE
 *
 * Autonomous security system that heals 10x faster than attacks can cause damage.
 *
 * SLO Definition:
 * - Mean Time To Detect (MTTD): < 50ms P95
 * - Mean Time To Respond (MTTR): < 250ms P95
 * - Mean Time To Recover (MTTR2): < 500ms P95
 * - Total Healing Time: < 800ms (attacks need 7.5s+ to cause damage)
 * - Healing Speed Ratio: 10x faster than attack progression
 */

import { EventEmitter } from "events";
import { logger } from "../logger.js";
import { db } from "../db.js";
import { securityThreats, ipBlacklist, notifications } from "@shared/schema";
import { eq, gte } from "drizzle-orm";
import type { ContainmentAdapters, ContainmentEffect } from "./securityContainment.js";

interface SecurityEvent {
  id: string;
  timestamp: number;
  type: "request" | "auth" | "api" | "system" | "network";
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  source: {
    ip: string;
    userAgent?: string;
    userId?: number | string;
    sessionId?: string;
  };
  payload: {
    path?: string;
    method?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
  metrics: {
    requestCount?: number;
    errorCount?: number;
    latency?: number;
  };
}

interface ThreatAssessment {
  id: string;
  eventId: string;
  detectionTime: number;
  threatLevel: number;
  threatType: string;
  confidence: number;
  indicators: string[];
  recommendedActions: string[];
}

interface HealingAction {
  id: string;
  threatId: string;
  type:
    | "block_ip"
    | "rate_limit"
    | "session_kill"
    | "circuit_break"
    | "feature_disable"
    | "alert";
  status: "pending" | "executing" | "completed" | "failed";
  startTime: number;
  endTime?: number;
  details: Record<string, any>;
}

interface HealingMetrics {
  detectionLatency: number[];
  responseLatency: number[];
  recoveryLatency: number[];
  totalHealingTime: number[];
  threatsDetected: number;
  threatsBlocked: number;
  threatsHealed: number;
  falsePositives: number;
  healingSpeedRatio: number;
}

interface SecuritySLO {
  mttdP95Target: number;
  mttrP95Target: number;
  mttr2P95Target: number;
  healingRatioTarget: number;
  attackDwellTimeMinimum: number;
}

type SecurityDatabase = Pick<typeof db, "select" | "insert" | "delete">;

export interface SelfHealingSecurityEngineOptions {
  containment?: ContainmentAdapters;
  database?: SecurityDatabase;
  autoStart?: boolean;
  now?: () => number;
  initialLoadAttempts?: number;
  retryDelayMs?: number;
}

function isLoopbackAddress(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/, "");
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "localhost"
  );
}

type BlockRecord = {
  expiresAt: number;
  origin: "database" | "local-unpersisted";
};

export class SelfHealingSecurityEngine extends EventEmitter {
  private static instance: SelfHealingSecurityEngine;
  private isRunning: boolean = false;
  private eventQueue: SecurityEvent[] = [];
  private eventsById: Map<string, SecurityEvent> = new Map();
  private threatAssessments: Map<string, ThreatAssessment> = new Map();
  private healingActions: Map<string, HealingAction> = new Map();
  private ipThreatScores: Map<
    string,
    { score: number; lastUpdate: number; events: number }
  > = new Map();
  private blockedIps: Map<string, BlockRecord> = new Map();
  private blocklistReady = false;
  private initialization: Promise<void> | null = null;
  private readonly database: SecurityDatabase;
  private containment?: ContainmentAdapters;
  private readonly now: () => number;
  private readonly initialLoadAttempts: number;
  private readonly retryDelayMs: number;
  private intervals: ReturnType<typeof setInterval>[] = [];

  private metrics: HealingMetrics = {
    detectionLatency: [],
    responseLatency: [],
    recoveryLatency: [],
    totalHealingTime: [],
    threatsDetected: 0,
    threatsBlocked: 0,
    threatsHealed: 0,
    falsePositives: 0,
    healingSpeedRatio: 10,
  };

  private slo: SecuritySLO = {
    mttdP95Target: 50,
    mttrP95Target: 250,
    mttr2P95Target: 500,
    healingRatioTarget: 10,
    attackDwellTimeMinimum: 7500,
  };

  private threatPatterns = {
    // SQL injection: comprehensive patterns for various attack vectors
    sqlInjection: new RegExp(
      [
        "\\bUNION\\s+(ALL\\s+)?SELECT\\b", // UNION SELECT attacks
        "\\bDROP\\s+(TABLE|DATABASE|INDEX)\\b", // DROP statements
        "\\bDELETE\\s+FROM\\b", // DELETE statements
        "\\bTRUNCATE\\s+TABLE\\b", // TRUNCATE statements
        "\\bINSERT\\s+INTO\\b.*\\bVALUES\\b", // INSERT with VALUES
        "\\bUPDATE\\s+\\w+\\s+SET\\b", // UPDATE statements
        "\\bEXEC(UTE)?\\s*\\(", // EXEC/EXECUTE
        "\\bxp_\\w+", // SQL Server extended procs
        "\\bsp_\\w+", // SQL Server stored procs
        "\\bINTO\\s+(OUT|DUMP)FILE\\b", // File operations
        "\\bLOAD_FILE\\s*\\(", // File read
        "\\bBENCHMARK\\s*\\(", // Timing attacks
        "\\bSLEEP\\s*\\(", // Time-based injection
        "\\bWAITFOR\\s+DELAY\\b", // SQL Server delay
        "\\bPG_SLEEP\\s*\\(", // PostgreSQL delay
        "\\bOR\\s+['\"]?\\d+['\"]?\\s*=\\s*['\"]?\\d+", // OR 1=1 variants
        "\\bAND\\s+['\"]?\\d+['\"]?\\s*=\\s*['\"]?\\d+", // AND 1=1 variants
        "'\\s*(--|#|\\/\\*)", // Comment injection after quote
        "\\bHAVING\\s+\\d+\\s*=\\s*\\d+", // HAVING injection
        "\\bGROUP\\s+BY\\s+.+\\bHAVING\\b", // GROUP BY HAVING
        "';\\s*--", // Quote-semicolon-comment
        "\\bCHAR\\s*\\(\\d+\\)", // CHAR() encoding bypass
        "0x[0-9a-fA-F]{6,}", // Hex-encoded strings
      ].join("|"),
      "gi",
    ),
    // XSS: comprehensive cross-site scripting patterns
    xss: new RegExp(
      [
        "<script[^>]*>", // Script tags
        "</script>", // Closing script tags
        // eslint-disable-next-line no-script-url -- detection pattern string, not an executed URL
        "javascript:", // JavaScript protocol
        "vbscript:", // VBScript protocol
        "on\\w+\\s*=", // Event handlers
        "<iframe[^>]*>", // iFrame injection
        "<object[^>]*>", // Object tags
        "<embed[^>]*>", // Embed tags
        "<svg[^>]*onload", // SVG with onload
        "<img[^>]*onerror", // Image with onerror
        "<body[^>]*onload", // Body with onload
        "expression\\s*\\(", // CSS expression
        "url\\s*\\(\\s*[\"']?javascript:", // CSS url() with JS
        "<meta[^>]*http-equiv\\s*=\\s*[\"']?refresh", // Meta refresh
        "%3C%73%63%72%69%70%74", // URL-encoded <script
      ].join("|"),
      "gi",
    ),
    // Path traversal: directory traversal attacks
    pathTraversal: new RegExp(
      [
        "\\.\\.\\/|\\.\\.\\\\", // Basic traversal
        "%2e%2e%2f|%2e%2e%5c", // URL-encoded
        "\\.\\.\\.\\/", // Triple dot variant
        "%252e%252e%252f", // Double URL-encoded
        "\\.\\.%00", // Null byte injection
        "%c0%ae%c0%ae", // UTF-8 overlong encoding
        "\\/etc\\/passwd", // Unix password file
        "\\/etc\\/shadow", // Unix shadow file
        "\\\\windows\\\\system32", // Windows system32
        "c:\\\\windows", // Windows path
      ].join("|"),
      "gi",
    ),
    // Command injection: shell command patterns
    commandInjection: new RegExp(
      [
        ";\\s*(rm|cat|wget|curl|bash|sh|nc|netcat|python|perl|ruby|php|node|npm)\\s",
        "`[^`]+`", // Backtick execution
        "\\$\\([^)]+\\)", // Command substitution
        "&&\\s*(rm|cat|wget|curl|bash|sh|ls|pwd)", // AND chain
        "\\|\\|\\s*(rm|cat|wget|curl|bash|sh)", // OR chain
        "\\|\\s*(cat|less|more|head|tail|grep)", // Pipe to command
        ">\\s*\\/[a-z]", // Redirect to root
        "<\\s*\\/[a-z]", // Read from root
        "\\$\\{.*\\}", // Variable expansion
        "\\beval\\s*\\(", // Eval calls
        "\\bsystem\\s*\\(", // System calls
        "\\bexec\\s*\\(", // Exec calls
        "\\bpopen\\s*\\(", // Popen calls
        "\\bpassthru\\s*\\(", // Passthru calls
      ].join("|"),
      "gi",
    ),
    // LDAP injection patterns
    ldapInjection: /\)\s*\(|\)\s*\||\*\)|\(\|/gi,
    // XML/XXE injection patterns
    xxeInjection:
      /<!ENTITY|<!DOCTYPE[^>]*\[|SYSTEM\s+["']file:|SYSTEM\s+["']http/gi,
    // NoSQL injection patterns
    nosqlInjection:
      /\$where|\$ne|\$gt|\$lt|\$gte|\$lte|\$in|\$nin|\$or|\$and|\$not|\$regex|\$exists/gi,
    bruteForce: { threshold: 20, window: 300000 },
    ddos: { threshold: 500, window: 10000 },
  };

  private rateLimitState: Map<
    string,
    { count: number; resetTime: number; blocked: boolean }
  > = new Map();

  public constructor(options: SelfHealingSecurityEngineOptions = {}) {
    super();
    this.containment = options.containment;
    this.database = options.database ?? db;
    this.now = options.now ?? Date.now;
    this.initialLoadAttempts = options.initialLoadAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    if (options.autoStart !== false) {
      this.initialization = this.initializeEngine();
    }
  }

  public static getInstance(): SelfHealingSecurityEngine {
    if (!SelfHealingSecurityEngine?.instance) {
      SelfHealingSecurityEngine.instance = new SelfHealingSecurityEngine();
    }
    return SelfHealingSecurityEngine?.instance;
  }

  public async ready(): Promise<void> {
    await this.initialization;
  }

  public async start(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.initializeEngine();
    }
    await this.initialization;
  }

  private async initializeEngine(): Promise<void> {
    logger.info("🛡️  Self-Healing Security Engine initializing...");

    await this.loadBlockedIps();

    this.startDetectionLoop();
    this.startHealingLoop();
    this.startMetricsCollection();
    this.startBlockedIpResyncLoop();

    this.isRunning = true;

    logger.info("🛡️  Self-Healing Security Engine ACTIVE");
    logger.info(
      `   └─ SLO Targets: MTTD<${this.slo.mttdP95Target}ms, MTTR<${this.slo.mttrP95Target}ms, Recovery<${this.slo.mttr2P95Target}ms`,
    );
    logger.info(
      `   └─ Healing Speed: ${this.slo.healingRatioTarget}x faster than attacks`,
    );
  }

  // This engine is mounted as MANDATORY request middleware (isIpBlocked() gates
  // every request) and blockedIps is only ever bulk-loaded from the DB here —
  // there is no per-request DB check. A transient DB hiccup during boot must
  // not permanently and silently blind this security control for the entire
  // process lifetime, so the initial load retries before giving up, a failure
  // is logged loudly (error, not warn), and a periodic re-sync (below) gives
  // the engine a real chance to self-heal without requiring a restart.
  private async loadBlockedIps(attempt = 1): Promise<void> {
    try {
      const now = new Date(this.now());
      const blocked = await this.database
        .select()
        .from(ipBlacklist)
        .where(gte(ipBlacklist.expiresAt, now))
        .limit(10000);

      // A successful query is authoritative for DB-backed entries, including
      // revocations performed by another process. Preserve only local blocks
      // whose persistence failed; otherwise a transient write outage could
      // silently remove active process-local protection on the next refresh.
      const refreshed = new Map<string, BlockRecord>();
      for (const [ip, record] of this.blockedIps) {
        if (
          record.origin === "local-unpersisted" &&
          record.expiresAt > this.now()
        ) {
          refreshed.set(ip, record);
        }
      }
      for (const entry of blocked) {
        if (entry?.ip && entry.expiresAt) {
          const expiresAt = new Date(entry.expiresAt).getTime();
          if (expiresAt > this.now()) {
            refreshed.set(entry.ip, { expiresAt, origin: "database" });
          }
        }
      }
      this.blockedIps = refreshed;
      this.blocklistReady = true;

      logger.info(`   └─ Loaded ${blocked?.length} blocked IPs from database`);
    } catch (error) {
      if (attempt < this.initialLoadAttempts) {
        const backoffMs = attempt * this.retryDelayMs;
        logger.warn(
          { err: error, attempt, maxAttempts: this.initialLoadAttempts },
          `Failed to load blocked IPs — retrying in ${backoffMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return this.loadBlockedIps(attempt + 1);
      }
      // Do not swallow this quietly: every previously-blocked IP is being
      // treated as unblocked until the periodic re-sync below succeeds.
      logger.error(
        { err: error, attempts: attempt },
        "Failed to load blocked IPs after all retries — initial policy is UNKNOWN (or the last known finite cache remains active) until periodic re-sync succeeds",
      );
      // A previously loaded, finite-expiry cache remains known-good enough to
      // enforce. Only initial-load failure leaves policy state unknown.
    }
  }

  public async refreshBlocklist(): Promise<void> {
    await this.loadBlockedIps();
  }

  // Self-heals a failed initial load and synchronizes cross-instance additions
  // and revocations. Failed refreshes leave the last known state untouched.
  private startBlockedIpResyncLoop(): void {
    const RESYNC_INTERVAL_MS = 5 * 60 * 1000;
    const interval = setInterval(() => {
      this.refreshBlocklist().catch((err) =>
        logger.error({ err }, "Blocked-IP re-sync loop failed unexpectedly:"),
      );
    }, RESYNC_INTERVAL_MS).unref?.();
    this.intervals.push(interval);
  }

  public processSecurityEvent(event: Partial<SecurityEvent>): void {
    const now = this.now();
    const fullEvent: SecurityEvent = {
      id: randomBytes(8).toString("hex"),
      timestamp: now,
      type: event.type || "request",
      category: event.category || "general",
      severity: event.severity || "low",
      source: event.source || { ip: "unknown" },
      payload: event.payload || {},
      metrics: event.metrics || {},
    };

    const sourceIp = fullEvent?.source.ip;
    if (isLoopbackAddress(sourceIp)) {
      return;
    }

    if (this.isIpBlocked(sourceIp)) {
      this.metrics.threatsBlocked++;
      return;
    }

    // Skip deep threat analysis for verified browser sessions (reduces false positives)
    // Real browsers always send a proper User-Agent and make sequential requests
    const ua = fullEvent?.source.userAgent || "";
    const isLegitimateUserAgent =
      /Mozilla|Chrome|Safari|Firefox|Edge|Opera/i?.test(ua);
    const isSessionEndpoint =
      fullEvent?.payload.path === "/api/auth/refresh-token" ||
      fullEvent?.payload.path === "/api/auth/me" ||
      fullEvent?.payload.path === "/api/auth/heartbeat";

    if (isSessionEndpoint && isLegitimateUserAgent) {
      return;
    }

    this.eventsById.set(fullEvent.id, fullEvent);
    if (this.isCriticalThreat(fullEvent)) {
      // Critical events are handled synchronously by the async pipeline and must
      // not also enter the background queue (which used to duplicate alerts,
      // recovery rows, and blacklist writes).
      void this.processImmediately(fullEvent).finally(() => {
        this.eventsById.delete(fullEvent.id);
      });
    } else {
      this.eventQueue.push(fullEvent);
    }
  }

  private isCriticalThreat(event: SecurityEvent): boolean {
    const { payload, source } = event;
    const content = JSON.stringify(payload);

    // Reset lastIndex for global regex patterns before testing
    this.threatPatterns.sqlInjection.lastIndex = 0;
    this.threatPatterns.xss.lastIndex = 0;
    this.threatPatterns.pathTraversal.lastIndex = 0;
    this.threatPatterns.commandInjection.lastIndex = 0;
    this.threatPatterns.ldapInjection.lastIndex = 0;
    this.threatPatterns.xxeInjection.lastIndex = 0;
    this.threatPatterns.nosqlInjection.lastIndex = 0;

    if (this.threatPatterns.sqlInjection?.test(content)) return true;
    if (this.threatPatterns.xss?.test(content)) return true;
    if (this.threatPatterns.pathTraversal?.test(content)) return true;
    if (this.threatPatterns.commandInjection?.test(content)) return true;
    if (this.threatPatterns.ldapInjection?.test(content)) return true;
    if (this.threatPatterns.xxeInjection?.test(content)) return true;
    if (this.threatPatterns.nosqlInjection?.test(content)) return true;

    const ipScore = this.ipThreatScores.get(source?.ip);
    if (ipScore && ipScore?.score > 80) return true;

    return false;
  }

  private async processImmediately(event: SecurityEvent): Promise<void> {
    const startTime = this.now();

    const assessment = await this.detectThreat(event);
    const detectionTime = this.now() - startTime;
    this.metrics.detectionLatency?.push(detectionTime);

    if (assessment?.threatLevel > 0.5) {
      const responseStartTime = this.now();
      const actions = await this.respondToThreat(assessment);
      const responseTime = this.now() - responseStartTime;
      this.metrics.responseLatency?.push(responseTime);

      const recoveryStartTime = this.now();
      await this.recoverFromThreat(assessment, actions);
      const recoveryTime = this.now() - recoveryStartTime;
      this.metrics.recoveryLatency?.push(recoveryTime);

      const totalTime = this.now() - startTime;
      this.metrics.totalHealingTime?.push(totalTime);

      this.updateHealingSpeedRatio();

      logger.info(
        `⚡ Threat healed in ${totalTime}ms (Detection: ${detectionTime}ms, Response: ${responseTime}ms, Recovery: ${recoveryTime}ms)`,
      );
    }
  }

  private async detectThreat(event: SecurityEvent): Promise<ThreatAssessment> {
    const content = JSON.stringify(event?.payload);
    const indicators: string[] = [];
    let threatLevel = 0;
    let threatType = "unknown";

    // Reset lastIndex for global regex patterns
    this.threatPatterns.sqlInjection.lastIndex = 0;
    this.threatPatterns.xss.lastIndex = 0;
    this.threatPatterns.pathTraversal.lastIndex = 0;
    this.threatPatterns.commandInjection.lastIndex = 0;
    this.threatPatterns.ldapInjection.lastIndex = 0;
    this.threatPatterns.xxeInjection.lastIndex = 0;
    this.threatPatterns.nosqlInjection.lastIndex = 0;

    if (this.threatPatterns.sqlInjection?.test(content)) {
      indicators?.push("SQL injection pattern detected");
      threatLevel = Math.max(threatLevel, 0.95);
      threatType = "sql_injection";
    }

    if (this.threatPatterns.xss?.test(content)) {
      indicators?.push("XSS pattern detected");
      threatLevel = Math.max(threatLevel, 0.9);
      threatType = threatType === "unknown" ? "xss" : threatType;
    }

    if (this.threatPatterns.pathTraversal?.test(content)) {
      indicators?.push("Path traversal attempt");
      threatLevel = Math.max(threatLevel, 0.85);
      threatType = threatType === "unknown" ? "path_traversal" : threatType;
    }

    if (this.threatPatterns.commandInjection?.test(content)) {
      indicators?.push("Command injection pattern");
      threatLevel = Math.max(threatLevel, 0.95);
      threatType = threatType === "unknown" ? "command_injection" : threatType;
    }

    if (this.threatPatterns.ldapInjection?.test(content)) {
      indicators?.push("LDAP injection pattern detected");
      threatLevel = Math.max(threatLevel, 0.9);
      threatType = threatType === "unknown" ? "ldap_injection" : threatType;
    }

    if (this.threatPatterns.xxeInjection?.test(content)) {
      indicators?.push("XXE/XML injection pattern detected");
      threatLevel = Math.max(threatLevel, 0.95);
      threatType = threatType === "unknown" ? "xxe_injection" : threatType;
    }

    if (this.threatPatterns.nosqlInjection?.test(content)) {
      indicators?.push("NoSQL injection pattern detected");
      threatLevel = Math.max(threatLevel, 0.9);
      threatType = threatType === "unknown" ? "nosql_injection" : threatType;
    }

    const rateScore = this.checkRateLimit(event);
    if (rateScore > 0.5) {
      indicators?.push(`High request rate (score: ${rateScore?.toFixed(2)})`);
      threatLevel = Math.max(threatLevel, rateScore * 0.8);
      threatType = threatType === "unknown" ? "rate_abuse" : threatType;
    }

    const ipScore = this.updateIpThreatScore(event?.source.ip, threatLevel);
    if (ipScore > 0.7) {
      indicators?.push(`Suspicious IP history (score: ${ipScore?.toFixed(2)})`);
      threatLevel = Math.max(threatLevel, ipScore);
    }

    const assessment: ThreatAssessment = {
      id: randomBytes(8).toString("hex"),
      eventId: event.id,
      detectionTime: this.now() - event?.timestamp,
      threatLevel,
      threatType,
      confidence: Math.min(1, threatLevel + 0.1),
      indicators,
      recommendedActions: this.determineActions(threatLevel, threatType, event.payload.path),
    };

    if (threatLevel > 0.5) {
      this.metrics.threatsDetected++;
      this.threatAssessments.set(assessment?.id, assessment);
      this.emit("threat_detected", assessment);
    }

    return assessment;
  }

  private checkRateLimit(event: SecurityEvent): number {
    const ip = event.source.ip;
    const isAuthAttempt =
      event.category === "authentication" &&
      event.payload.method !== "GET";
    const policy = isAuthAttempt
      ? this.threatPatterns.bruteForce
      : this.threatPatterns.ddos;
    const key = `${isAuthAttempt ? "auth" : "request"}:${ip}`;
    const now = this.now();
    const windowMs = policy.window;
    const state = this.rateLimitState.get(key) || {
      count: 0,
      resetTime: now + windowMs,
      blocked: false,
    };

    if (now > state?.resetTime) {
      state.count = 1;
      state.resetTime = now + windowMs;
      state.blocked = false;
    } else {
      state.count++;
    }

    this.rateLimitState.set(key, state);

    const threshold = policy.threshold;
    return state.count > threshold
      ? Math.min(1, 0.9 + (state.count - threshold) / threshold)
      : 0;
  }

  private updateIpThreatScore(ip: string, currentThreat: number): number {
    const now = this.now();
    const existing = this.ipThreatScores.get(ip) || {
      score: 0,
      lastUpdate: now,
      events: 0,
    };

    // Faster decay for low-threat events (legitimate users recover quickly)
    // Slower decay for high-threat events (attackers stay flagged longer)
    const decayHalfLife = currentThreat > 0.7 ? 600000 : 120000;
    const decay = Math.exp(-(now - existing?.lastUpdate) / decayHalfLife);

    // Lower accumulation weight for marginal threats (reduces false positives)
    const accumulationWeight = currentThreat > 0.5 ? 0.3 : 0.08;
    const newScore = Math.min(
      1,
      existing?.score * decay + currentThreat * accumulationWeight,
    );

    this.ipThreatScores.set(ip, {
      score: newScore,
      lastUpdate: now,
      events: existing.events + 1,
    });

    return newScore;
  }

  private determineActions(threatLevel: number, threatType: string, path?: string): string[] {
    const actions: string[] = [];

    // Higher thresholds reduce false positives for legitimate heavy users
    if (threatLevel >= 0.95) {
      if (path) actions.push(...(this.containment?.actionsForPath?.(path) ?? []));
      actions?.push("block_ip");
      actions?.push("session_kill");
      actions?.push("alert");
    } else if (threatLevel >= 0.85) {
      actions?.push("rate_limit");
      actions?.push("alert");
    } else if (threatLevel >= 0.7) {
      actions?.push("rate_limit");
    }

    // Injection attacks still get immediate IP block at any confirmed level
    if (
      threatType === "sql_injection" ||
      threatType === "command_injection" ||
      threatType === "xxe_injection"
    ) {
      if (!actions?.includes("block_ip")) actions?.unshift("block_ip");
      if (!actions?.includes("alert")) actions?.push("alert");
    }

    return actions;
  }

  private async respondToThreat(
    assessment: ThreatAssessment,
  ): Promise<HealingAction[]> {
    // All recommended actions are independent (block_ip, rate_limit, alert, etc.)
    // so run them concurrently instead of sequentially. Each action registers
    // itself into healingActions before awaiting so the dashboard sees all of
    // them immediately, regardless of execution order.
    const actions: HealingAction[] = assessment?.recommendedActions.map(
      (actionType) => {
        const action: HealingAction = {
          id: randomBytes(8).toString("hex"),
          threatId: assessment.id,
          type: actionType as HealingAction["type"],
          status: "executing",
          startTime: this.now(),
          details: {},
        };
        this.healingActions.set(action?.id, action);
        return action;
      },
    );

    await Promise?.allSettled(
      actions?.map(async (action) => {
        try {
          await this.executeAction(action, assessment);
          action.status = "completed";
          action.endTime = this.now();
        } catch (error) {
          action.status = "failed";
          action.endTime = this.now();
          action.details.error = String(error);
          logger.warn({ err: error }, `Healing action ${action?.type} failed:`);
        }
      }),
    );
    return actions;
  }

  private async executeAction(
    action: HealingAction,
    assessment: ThreatAssessment,
  ): Promise<void> {
    switch (action?.type) {
      case "block_ip":
        const event = this.findEventById(assessment?.eventId);
        if (event) {
          await this.blockIp(
            event?.source.ip,
            assessment?.threatType,
            assessment?.threatLevel,
          );
          action.details.blockedIp = event?.source.ip;
        }
        break;

      case "rate_limit":
        const evt = this.findEventById(assessment?.eventId);
        if (evt) {
          const prefix =
            evt.category === "authentication" && evt.payload.method !== "GET"
              ? "auth"
              : "request";
          const key = `${prefix}:${evt.source.ip}`;
          const state = this.rateLimitState.get(key);
          if (state) {
            state.blocked = true;
            this.rateLimitState.set(key, state);
            action.details.rateLimitedIp = evt?.source.ip;
          }
        }
        break;

      case "session_kill":
      case "circuit_break":
      case "feature_disable": {
        const sourceEvent = this.findEventById(assessment.eventId);
        if (!sourceEvent || !this.containment) {
          action.details.supported = false;
          throw new Error("Unsupported healing action: security containment requires an event and configured enforcement adapters");
        }
        let effect: ContainmentEffect;
        if (action.type === "session_kill") {
          const userId = sourceEvent.source.userId;
          if (userId === undefined || !String(userId).trim()) {
            throw new Error("Session containment requires an authenticated user ID");
          }
          effect = await this.containment.revokeSessions(String(userId));
        } else {
          const path = sourceEvent.payload.path;
          if (!path) throw new Error("Route-scoped containment requires a path");
          effect = action.type === "circuit_break"
            ? await this.containment.isolateDependency(path)
            : await this.containment.isolateFeature(path);
        }
        if (effect?.confirmed !== true || !effect.target) {
          throw new Error("Containment adapter did not acknowledge enforcement");
        }
        action.details.effect = effect;
        break;
      }

      case "alert":
        await this.sendSecurityAlert(assessment);
        action.details.alertSent = true;
        break;

    }
  }

  private findEventById(eventId: string): SecurityEvent | undefined {
    return this.eventsById.get(eventId);
  }

  /** Install only from trusted application composition, never a request payload. */
  public configureContainment(adapters: ContainmentAdapters): void {
    if (this.containment) throw new Error("Containment adapters are already configured");
    this.containment = adapters;
  }

  private async blockIp(
    ipAddress: string,
    reason: string,
    severity: number,
  ): Promise<void> {
    if (!ipAddress || ipAddress === "undefined") {
      logger.warn("Skipping IP block for invalid address");
      return;
    }

    if (isLoopbackAddress(ipAddress)) {
      return;
    }

    const durationMs =
      severity >= 0.9
        ? 24 * 60 * 60 * 1000
        : severity >= 0.7
          ? 2 * 60 * 60 * 1000
          : severity >= 0.5
            ? 30 * 60 * 1000
            : 5 * 60 * 1000;

    const expiresAt = this.now() + durationMs;
    // In-memory enforcement is deliberately fail-closed if persistence is
    // unavailable. The finite expiry prevents a transient DB outage creating a
    // permanent process-local ban.
    this.blockedIps.set(ipAddress, {
      expiresAt,
      origin: "local-unpersisted",
    });

    try {
      await this.database.insert(ipBlacklist).values({
        ip: ipAddress,
        reason,
        severity:
          severity >= 0.9 ? "critical" : severity >= 0.7 ? "high" : "medium",
        expiresAt: new Date(expiresAt),
      });
      // The next successful refresh may now authoritatively add or remove this
      // row. Mark it DB-backed only after persistence actually succeeds.
      this.blockedIps.set(ipAddress, { expiresAt, origin: "database" });

      logger.info(
        `🚫 Blocked IP ${ipAddress} for ${reason} (${(durationMs / 60000).toFixed(0)} minutes)`,
      );
    } catch (error) {
      logger.warn(
        { err: error },
        `Failed to persist IP block for ${ipAddress}:`,
      );
    }
  }

  private async sendSecurityAlert(assessment: ThreatAssessment): Promise<void> {
    try {
      await this.database.insert(notifications).values({
        userId: "system",
        type: "security_alert",
        title: `Security Alert: ${assessment?.threatType}`,
        message: `Threat detected and mitigated. Level: ${(assessment?.threatLevel * 100).toFixed(0)}%. Indicators: ${assessment?.indicators.join(", ")}`,
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to send security alert:");
    }
  }

  private async recoverFromThreat(
    assessment: ThreatAssessment,
    actions: HealingAction[],
  ): Promise<void> {
    const mitigationApplied = actions.some(
      (action) =>
        action.status === "completed" &&
        (action.type === "block_ip" || action.type === "rate_limit" ||
          action.details.effect?.confirmed === true),
    );
    if (mitigationApplied) this.metrics.threatsHealed++;
    const actionOutcomes = actions.map((action) => ({
      type: action.type,
      status: action.status,
      supported: action.details.supported !== false,
      effect: action.details.effect,
      error: action.details.error,
    }));

    try {
      await this.database.insert(securityThreats).values({
        threatType: assessment.threatType,
        severity:
          assessment?.threatLevel >= 0.9
            ? "critical"
            : assessment?.threatLevel >= 0.7
              ? "high"
              : assessment?.threatLevel >= 0.5
                ? "medium"
                : "low",
        status: mitigationApplied ? "resolved" : "detected",
        confidence: assessment.confidence,
        indicators: assessment.indicators,
        healingActions: actionOutcomes,
        resolvedAt: mitigationApplied ? new Date(this.now()) : undefined,
        metadata: {
          detectionTime: assessment.detectionTime,
          healed: mitigationApplied,
          actionOutcomes,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to log threat recovery:");
    }

    this.emit(mitigationApplied ? "threat_healed" : "threat_unresolved", {
      assessment,
      actionOutcomes,
    });
  }

  private startDetectionLoop(): void {
    const interval = setInterval(() => {
      // Process any queued events, not just when >100 are present.
      // Drain up to 50 per tick; each detectThreat fires concurrently
      // (non-blocking — no await) so the full batch starts simultaneously.
      if (this.eventQueue.length === 0) return;
      const events = this.eventQueue.splice(0, 50);
      for (const event of events) {
        this.processImmediately(event)
          .catch((err) => logger.warn({ err }, "Detection error:"))
          .finally(() => this.eventsById.delete(event.id));
      }
    }, 10);
    this.intervals.push(interval);
  }

  private startHealingLoop(): void {
    const interval = setInterval(() => {
      const now = this.now();

      for (const [ip, state] of this.rateLimitState.entries()) {
        if (now > state?.resetTime + 300000) {
          this.rateLimitState.delete(ip);
        }
      }

      for (const [ip, score] of this.ipThreatScores.entries()) {
        if (now - score?.lastUpdate > 3600000 && score?.score < 0.1) {
          this.ipThreatScores.delete(ip);
        }
      }

      if (this.eventQueue.length > 1000) {
        this.eventQueue.splice(0, this.eventQueue.length - 500);
      }
    }, 5000);
    this.intervals.push(interval);
  }

  private startMetricsCollection(): void {
    const interval = setInterval(() => {
      const maxSamples = 1000;
      if (this.metrics.detectionLatency?.length > maxSamples) {
        this.metrics.detectionLatency =
          this.metrics.detectionLatency?.slice(-maxSamples);
      }
      if (this.metrics.responseLatency?.length > maxSamples) {
        this.metrics.responseLatency =
          this.metrics.responseLatency?.slice(-maxSamples);
      }
      if (this.metrics.recoveryLatency?.length > maxSamples) {
        this.metrics.recoveryLatency =
          this.metrics.recoveryLatency?.slice(-maxSamples);
      }
      if (this.metrics.totalHealingTime?.length > maxSamples) {
        this.metrics.totalHealingTime =
          this.metrics.totalHealingTime?.slice(-maxSamples);
      }
    }, 60000);
    this.intervals.push(interval);
  }

  private updateHealingSpeedRatio(): void {
    if (this.metrics.totalHealingTime?.length === 0) return;

    const avgHealingTime = this.calculatePercentile(
      this.metrics.totalHealingTime,
      95,
    );
    this.metrics.healingSpeedRatio =
      this.slo.attackDwellTimeMinimum / Math.max(1, avgHealingTime);
  }

  private calculatePercentile(arr: number[], percentile: number): number {
    if (arr?.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted?.length) - 1;
    return sorted[Math.max(0, index)];
  }

  public getMetrics(): HealingMetrics & {
    sloCompliance: Record<string, boolean>;
  } {
    const mttdP95 = this.calculatePercentile(this.metrics.detectionLatency, 95);
    const mttrP95 = this.calculatePercentile(this.metrics.responseLatency, 95);
    const mttr2P95 = this.calculatePercentile(this.metrics.recoveryLatency, 95);
    this.calculatePercentile(
      this.metrics.totalHealingTime,
      95,
    );

    return {
      ...this.metrics,
      sloCompliance: {
        mttdMet: mttdP95 <= this.slo.mttdP95Target,
        mttrMet: mttrP95 <= this.slo.mttrP95Target,
        mttr2Met: mttr2P95 <= this.slo.mttr2P95Target,
        healingRatioMet:
          this.metrics.healingSpeedRatio >= this.slo.healingRatioTarget,
        overallCompliant:
          mttdP95 <= this.slo.mttdP95Target &&
          mttrP95 <= this.slo.mttrP95Target &&
          mttr2P95 <= this.slo.mttr2P95Target &&
          this.metrics.healingSpeedRatio >= this.slo.healingRatioTarget,
      },
    };
  }

  public getStatus(): {
    isRunning: boolean;
    blockedIpsCount: number;
    activeThreats: number;
    queueSize: number;
    healingSpeedRatio: number;
  } {
    return {
      isRunning: this.isRunning,
      blockedIpsCount: this.getBlockedIps().length,
      activeThreats: this.threatAssessments.size,
      queueSize: this.eventQueue.length,
      healingSpeedRatio: this.metrics.healingSpeedRatio,
    };
  }

  public isIpBlocked(ip: string): boolean {
    const record = this.blockedIps.get(ip);
    if (record === undefined) return false;
    if (record.expiresAt <= this.now()) {
      this.blockedIps.delete(ip);
      return false;
    }
    return true;
  }

  public getIpBlockStatus(ip: string): "blocked" | "allowed" | "unknown" {
    if (!this.blocklistReady) return "unknown";
    return this.isIpBlocked(ip) ? "blocked" : "allowed";
  }

  public isIpRateLimited(ip: string): boolean {
    const now = this.now();
    for (const prefix of ["auth", "request"]) {
      const state = this.rateLimitState.get(`${prefix}:${ip}`);
      if (state?.blocked && state.resetTime > now) return true;
    }
    return false;
  }

  public async unblockIp(ip: string): Promise<void> {
    try {
      await this.database.delete(ipBlacklist).where(eq(ipBlacklist.ip, ip));
      this.blockedIps.delete(ip);
      logger.info(`✅ Unblocked IP ${ip}`);
    } catch (error) {
      logger.warn({ err: error }, `Failed to unblock IP ${ip}:`);
      throw error;
    }
  }

  public async clearAllBlocks(): Promise<void> {
    try {
      await this.database.delete(ipBlacklist).where(eq(ipBlacklist.isActive, true));
      this.blockedIps.clear();
      this.ipThreatScores.clear();
      logger.warn("⚠️ All blocked IPs cleared by admin");
    } catch (error) {
      logger.warn({ err: error }, "Failed to clear all blocked IPs:");
      throw error;
    }
  }

  public getBlockedIps(): string[] {
    return Array.from(this.blockedIps.keys()).filter((ip) => this.isIpBlocked(ip));
  }

  public stop(): void {
    this.isRunning = false;
    for (const interval of this.intervals) clearInterval(interval);
    this.intervals = [];
    logger.info("🛡️  Self-Healing Security Engine stopped");
  }
}

export const selfHealingEngine = SelfHealingSecurityEngine?.getInstance();
