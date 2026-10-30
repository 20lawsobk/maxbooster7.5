import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const moduleMocks = vi.hoisted(() => {
  const emptyDb = {
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.limit = vi.fn(async () => []);
      return chain;
    }),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  };
  return { emptyDb };
});

vi.mock("../../server/db.js", () => ({ db: moduleMocks.emptyDb }));
vi.mock("../../server/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { SelfHealingSecurityEngine } from "../../server/services/selfHealingSecurityEngine.js";
import { logger } from "../../server/logger.js";
import { SecurityContainment } from "../../server/services/securityContainment.js";
import { createSelfHealingSecurityMiddleware } from "../../server/middleware/selfHealingMiddleware.js";

const BASE_TIME = new Date("2026-01-15T12:00:00.000Z");
const SQL_IP = "192.0.2.10";
const XSS_IP = "198.51.100.20";
const BRUTE_IP = "203.0.113.30";

type FakeDbOptions = {
  loaded?: Array<{ ip: string; expiresAt: Date }>;
  selectError?: Error;
  insertError?: Error;
  deleteError?: Error;
  admins?: Array<{ id: string }>;
};

function fakeDb(options: FakeDbOptions = {}) {
  const writes: Record<string, any>[] = [];
  const selectChain: any = {};
  selectChain.from = vi.fn(() => selectChain);
  selectChain.where = vi.fn(() => selectChain);
  selectChain.limit = vi.fn(async () => {
    if (options.selectError) throw options.selectError;
    return options.loaded ?? [];
  });
  const database = {
    select: vi.fn((selection?: { id?: unknown }) => {
      if (selection?.id) {
        return { from: vi.fn(() => ({ where: vi.fn(async () => {
          if (options.selectError) throw options.selectError;
          return options.admins ?? [{ id: "fixture-admin" }];
        }) })) };
      }
      return selectChain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, any>) => {
        writes.push(...(Array.isArray(value) ? value : [value]));
        if (options.insertError) throw options.insertError;
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        if (options.deleteError) throw options.deleteError;
      }),
    })),
  };
  return { database: database as any, writes };
}

async function newEngine(options: FakeDbOptions = {}) {
  const fake = fakeDb(options);
  const engine = new SelfHealingSecurityEngine({
    database: fake.database,
    autoStart: false,
    initialLoadAttempts: 1,
    retryDelayMs: 1,
  });
  await engine.start();
  return { engine, ...fake };
}

function send(
  engine: SelfHealingSecurityEngine,
  ip: string,
  value: string,
  category = "api",
  method = "POST",
) {
  engine.processSecurityEvent({
    type: "request",
    category,
    source: { ip, userAgent: "SecurityFixture/1.0" },
    payload: {
      path: category === "authentication" ? "/api/auth/login" : "/api/search",
      method,
      body: { q: value },
    },
  });
}

async function settle() {
  // The real pipeline has nested await/Promise.allSettled stages
  // (detect -> concurrent actions -> recover); drain those microtasks without
  // advancing any security windows.
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
}

function responseDouble() {
  const response: any = { statusCode: 200 };
  response.status = vi.fn((status: number) => {
    response.statusCode = status;
    return response;
  });
  response.json = vi.fn(() => response);
  response.on = vi.fn();
  return response;
}

function requestDouble(ip: string | undefined, socketIp: string, headers = {}) {
  return {
    ip,
    socket: { remoteAddress: socketIp },
    headers,
    path: "/api/search",
    method: "GET",
    body: {},
  } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("real self-healing engine detect/respond/recover", () => {
  it("exposes running lifecycle, counters, latency, and SLO status", async () => {
    const { engine } = await newEngine();
    const status = engine.getStatus();
    expect(status).toEqual(
      expect.objectContaining({
        isRunning: true,
        blockedIpsCount: 0,
        activeThreats: 0,
        queueSize: 0,
      }),
    );

    send(engine, SQL_IP, "' UNION SELECT password FROM users --");
    await settle();
    const metrics = engine.getMetrics();
    expect(metrics.totalHealingTime).toHaveLength(1);
    expect(metrics.detectionLatency).toHaveLength(1);
    for (const key of [
      "mttdMet",
      "mttrMet",
      "mttr2Met",
      "healingRatioMet",
      "overallCompliant",
    ]) {
      expect(typeof metrics.sloCompliance[key]).toBe("boolean");
    }
    engine.stop();
  });

  it("keeps benign content below the false-positive boundary", async () => {
    const { engine, writes } = await newEngine();
    for (const value of [
      "How do I order by popularity?",
      "Use CONCAT(first_name, last_name) in my tutorial",
      "Copyright &#169; 2026",
      "A normal artist biography",
    ]) {
      send(engine, SQL_IP, value);
    }
    await vi.advanceTimersByTimeAsync(20);
    expect(engine.getMetrics().threatsDetected).toBe(0);
    expect(writes).toHaveLength(0);
    expect(engine.isIpBlocked(SQL_IP)).toBe(false);
    engine.stop();
  });

  it("handles partial events and exempts only browser session-maintenance paths", async () => {
    const { engine, writes } = await newEngine();
    engine.processSecurityEvent({});
    expect(engine.getStatus().queueSize).toBe(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(engine.getStatus().queueSize).toBe(0);
    expect(engine.getMetrics().threatsDetected).toBe(0);
    for (const path of ["/api/auth/me", "/api/auth/refresh-token", "/api/auth/heartbeat"]) {
      engine.processSecurityEvent({ source: { ip: SQL_IP, userAgent: "Mozilla/5.0" },
        payload: { path, body: { q: "' UNION SELECT password FROM users --" } } });
    }
    await settle();
    expect(writes).toEqual([]);
    engine.processSecurityEvent({ source: { ip: SQL_IP, userAgent: "Mozilla/5.0" },
      payload: { path: "/api/search", body: { q: "' UNION SELECT password FROM users --" } } });
    await settle();
    expect(engine.isIpBlocked(SQL_IP)).toBe(true);
    engine.stop();
  });

  it("retains all indicators and SQL precedence for a mixed injection", async () => {
    const { engine, writes } = await newEngine();
    send(engine, SQL_IP, "' UNION SELECT x FROM users; <script>run()</script> ../../etc/passwd; rm -rf / *)(uid=*) <!DOCTYPE x [<!ENTITY y SYSTEM 'file:///x'>]> {\"$gt\":\"\"}");
    await settle();
    const recovery = writes.find(row => row.threatType === "sql_injection");
    expect(recovery?.indicators).toEqual(expect.arrayContaining([
      "SQL injection pattern detected", "XSS pattern detected", "Path traversal attempt",
      "Command injection pattern", "LDAP injection pattern detected",
      "XXE/XML injection pattern detected", "NoSQL injection pattern detected",
    ]));
    expect(engine.getMetrics().threatsDetected).toBe(1);
    expect(engine.isIpBlocked(SQL_IP)).toBe(true);
    engine.stop();
  });

  it("bounds metrics history while retaining lifetime threat counters", async () => {
    const { engine } = await newEngine();
    for (let index = 0; index < 1005; index++) {
      send(engine, `198.18.${Math.floor(index / 250)}.${index % 250 + 1}`, "' OR 1=1 --");
    }
    await settle();
    expect(engine.getMetrics().totalHealingTime).toHaveLength(1005);
    expect(engine.getMetrics().threatsHealed).toBe(1005);
    await vi.advanceTimersByTimeAsync(60_000);
    const metrics = engine.getMetrics();
    for (const samples of [metrics.detectionLatency, metrics.responseLatency,
      metrics.recoveryLatency, metrics.totalHealingTime]) {
      expect(samples).toHaveLength(1000);
    }
    expect(metrics.threatsDetected).toBe(1005);
    expect(metrics.threatsHealed).toBe(1005);
    expect(metrics.sloCompliance.overallCompliant).toBe(true);
    engine.stop();
  });

  it("expires a completed request-rate window before admitting a new observation", async () => {
    const { engine } = await newEngine();
    send(engine, SQL_IP, "first benign request");
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(10_001);
    send(engine, SQL_IP, "new request window");
    await vi.advanceTimersByTimeAsync(20);
    expect(engine.isIpRateLimited(SQL_IP)).toBe(false);
    expect(engine.getMetrics().threatsDetected).toBe(0);
    await vi.advanceTimersByTimeAsync(3_605_001);
    send(engine, SQL_IP, "new request after stale history cleanup");
    await vi.advanceTimersByTimeAsync(20);
    expect(engine.getMetrics().threatsDetected).toBe(0);
    engine.stop();
  });

  it("accumulates suspicious repeat history without losing the original XSS classification", async () => {
    const { engine, writes } = await newEngine();
    for (let repeat = 0; repeat < 4; repeat++) send(engine, XSS_IP, "<script>run()</script>");
    await settle();
    const recoveries = writes.filter(row => row.threatType === "xss");
    expect(recoveries).toHaveLength(4);
    expect(recoveries.some(row => row.indicators.some((indicator: string) =>
      indicator.startsWith("Suspicious IP history")))).toBe(true);
    expect(engine.getMetrics().threatsDetected).toBe(4);
    engine.stop();
  });

  it("immediately inspects subsequent requests from an IP with established high threat history", async () => {
    const { engine } = await newEngine();
    try {
      send(engine, XSS_IP, "ordinary request before any threat history");
      expect(engine.getStatus().queueSize).toBe(1);
      await vi.advanceTimersByTimeAsync(10);
      for (let repeat = 0; repeat < 3; repeat++) {
        send(engine, XSS_IP, "<img src=x onerror=alert(1)>");
        await settle();
      }
      expect(engine.getMetrics().threatsDetected).toBe(3);
      const detected = vi.fn();
      engine.on("threat_detected", detected);
      send(engine, XSS_IP, "subsequent request without an explicit injection pattern");
      expect(engine.getStatus().queueSize).toBe(0);
      expect(detected).toHaveBeenCalledWith(expect.objectContaining({
        indicators: expect.arrayContaining([expect.stringMatching(/^Suspicious IP history/)]),
      }));
      await settle();
      expect(engine.getMetrics().threatsDetected).toBe(4);
      expect(engine.isIpRateLimited(XSS_IP)).toBe(true);
    } finally {
      engine.stop();
    }
  });

  it("reports slow acknowledged containment as an SLO breach", async () => {
    let clock = BASE_TIME.getTime();
    const { database, writes } = fakeDb();
    const engine = new SelfHealingSecurityEngine({ database, autoStart: false, now: () => clock,
      containment: {
        revokeSessions: async () => { clock += 1000; return { confirmed: true, target: "user:artist-1" }; },
        isolateDependency: vi.fn(), isolateFeature: vi.fn(),
      },
    });
    await engine.start();
    engine.processSecurityEvent({ source: { ip: SQL_IP, userId: "artist-1" },
      payload: { path: "/api/search", body: { q: "' OR 1=1 --" } } });
    await settle();
    const metrics = engine.getMetrics();
    expect(metrics.totalHealingTime).toEqual([1000]);
    expect(metrics.healingSpeedRatio).toBe(7.5);
    expect(metrics.sloCompliance).toEqual(expect.objectContaining({
      mttrMet: false, healingRatioMet: false, overallCompliant: false,
    }));
    expect(writes.find(row => row.threatType === "sql_injection")?.metadata.healed).toBe(true);
    engine.stop();
  });

  it("records failed session containment when the attacker has no authenticated user", async () => {
    const { engine, writes } = await newEngine();
    const revokeSessions = vi.fn();
    engine.configureContainment({ revokeSessions, isolateDependency: vi.fn(), isolateFeature: vi.fn() });
    send(engine, SQL_IP, "' OR 1=1 --");
    await settle();
    const recovery = writes.find(row => row.threatType === "sql_injection");
    expect(recovery?.metadata.actionOutcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "session_kill", status: "failed",
        error: "Error: Session containment requires an authenticated user ID" }),
    ]));
    expect(revokeSessions).not.toHaveBeenCalled();
    expect(engine.isIpBlocked(SQL_IP)).toBe(true);
    engine.stop();
  });

  it("blocks SQLi once and deduplicates persistence and recovery", async () => {
    const { engine, writes } = await newEngine();
    send(engine, SQL_IP, "' UNION SELECT password FROM users --");
    await settle();

    expect(engine.isIpBlocked(SQL_IP)).toBe(true);
    expect(writes.filter((row) => row.ip === SQL_IP)).toHaveLength(1);
    const recoveryRows = writes.filter(
      (row) => row.threatType === "sql_injection",
    );
    expect(recoveryRows).toHaveLength(1);
    expect(recoveryRows[0]).toEqual(
      expect.objectContaining({
        status: "resolved",
        metadata: expect.objectContaining({
          healed: true,
          actionOutcomes: expect.arrayContaining([
            expect.objectContaining({
              type: "block_ip",
              status: "completed",
              supported: true,
            }),
            expect.objectContaining({
              type: "session_kill",
              status: "failed",
              supported: false,
            }),
          ]),
        }),
      }),
    );
    expect(writes.filter((row) => row.type === "security_alert")).toEqual([
      expect.objectContaining({ userId: "fixture-admin" }),
    ]);
    expect(engine.getMetrics().threatsDetected).toBe(1);
    expect(engine.getMetrics().threatsHealed).toBe(1);
    engine.stop();
  });

  it("marks unwired control actions unsupported instead of executed", async () => {
    const { engine } = await newEngine();
    const assessment = {
      id: "assessment-fixture",
      eventId: "event-fixture",
      detectionTime: 0,
      threatLevel: 0.95,
      threatType: "fixture",
      confidence: 1,
      indicators: [],
      recommendedActions: [],
    };

    for (const type of [
      "session_kill",
      "circuit_break",
      "feature_disable",
    ]) {
      const action = {
        id: `action-${type}`,
        threatId: assessment.id,
        type,
        status: "executing",
        startTime: BASE_TIME.getTime(),
        details: {},
      };
      await expect(
        (engine as any).executeAction(action, assessment),
      ).rejects.toThrow("Unsupported healing action");
      expect(action.details).toEqual({ supported: false });
      expect(action.details).not.toHaveProperty("sessionKilled");
      expect(action.details).not.toHaveProperty("circuitBroken");
      expect(action.details).not.toHaveProperty("featureDisabled");
    }
    engine.stop();
  });

  it("dispatches typed controls to real guards and records acknowledgements", async () => {
    const { engine } = await newEngine();
    const revoked = vi.fn(async () => ({ confirmed: true as const }));
    const controls = new SecurityContainment({
      revokeSessions: revoked,
      dependencies: [{ prefix: "/api/search", target: "search-provider" }],
      features: [{ prefix: "/api/search", target: "search" }],
    });
    engine.configureContainment(controls);
    expect((engine as any).determineActions(0.95, "fixture", "/api/search"))
      .toEqual(expect.arrayContaining(["circuit_break", "feature_disable"]));
    (engine as any).eventsById.set("confirmed-event", {
      source: { userId: "artist-1" }, payload: { path: "/api/search" },
    });
    for (const type of ["session_kill", "circuit_break", "feature_disable"]) {
      const action = { type, details: {} as any };
      await (engine as any).executeAction(action, { eventId: "confirmed-event" });
      expect(action.details.effect.confirmed).toBe(true);
    }
    expect(revoked).toHaveBeenCalledWith("artist-1");
    const externalCall = vi.fn(async () => "result");
    await expect(controls.executeDependency("search-provider", externalCall)).rejects.toThrow("containment denies");
    expect(externalCall).not.toHaveBeenCalled();
    expect(() => controls.assertFeatureAllowed("search")).toThrow("containment denies");
    expect(() => engine.configureContainment(controls)).toThrow("already configured");
    engine.stop();
  });

  it("rejects unacknowledged adapter effects instead of crediting healing", async () => {
    const { engine } = await newEngine();
    engine.configureContainment({
      revokeSessions: vi.fn(async () => undefined) as any,
      isolateDependency: vi.fn(),
      isolateFeature: vi.fn(),
    });
    (engine as any).eventsById.set("unconfirmed", { source: { userId: "artist-1" }, payload: {} });
    const actions = await (engine as any).respondToThreat({
      id: "assessment-unconfirmed", eventId: "unconfirmed", recommendedActions: ["session_kill"],
    });
    expect(actions[0].status).toBe("failed");
    expect(actions[0].details.error).toContain("did not acknowledge");
    engine.stop();
  });

  it("detects XSS but bounds response to a finite rate window", async () => {
    const { engine, writes } = await newEngine();
    send(engine, XSS_IP, "<img src=x onerror=alert(1)>");
    await settle();

    expect(writes.some((row) => row.threatType === "xss")).toBe(true);
    expect(engine.isIpBlocked(XSS_IP)).toBe(false);
    expect(engine.isIpRateLimited(XSS_IP)).toBe(true);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(engine.isIpRateLimited(XSS_IP)).toBe(false);
    engine.stop();
  });

  it.each([
    {
      name: "path traversal",
      payload: "../../etc/passwd",
      type: "path_traversal",
      hardBlock: false,
    },
    {
      name: "command injection",
      payload: "; rm -rf /",
      type: "command_injection",
      hardBlock: true,
    },
    {
      name: "LDAP injection",
      payload: "*)(uid=*)",
      type: "ldap_injection",
      hardBlock: false,
    },
    {
      name: "XXE injection",
      payload: '<!DOCTYPE foo [<!ENTITY x SYSTEM "http://example.invalid/x">]>',
      type: "xxe_injection",
      hardBlock: true,
    },
    {
      name: "NoSQL injection",
      payload: '{"$gt":""}',
      type: "nosql_injection",
      hardBlock: false,
    },
  ])(
    "preserves detection, alert, recovery, and bounded response for $name",
    async ({ payload, type, hardBlock }) => {
      const ip =
        type === "path_traversal"
          ? "192.0.2.41"
          : type === "command_injection"
            ? "192.0.2.42"
            : type === "ldap_injection"
              ? "198.51.100.43"
              : type === "xxe_injection"
                ? "198.51.100.44"
                : "203.0.113.45";
      const { engine, writes } = await newEngine();
      send(engine, ip, payload);
      await settle();

      expect(
        writes.some((row) => row.threatType === type && row.status === "resolved"),
      ).toBe(true);
      expect(
        writes.some(
          (row) =>
            row.type === "security_alert" &&
            String(row.title).includes(type),
        ),
      ).toBe(true);
      expect(engine.isIpBlocked(ip)).toBe(hardBlock);
      expect(engine.isIpRateLimited(ip)).toBe(!hardBlock);
      engine.stop();
    },
  );

  it("detects brute force only after the auth threshold and expires the window", async () => {
    const { engine, writes } = await newEngine();
    for (let attempt = 0; attempt < 20; attempt++) {
      send(engine, BRUTE_IP, "wrong-password", "authentication");
    }
    await vi.advanceTimersByTimeAsync(20);
    expect(writes.some((row) => row.threatType === "rate_abuse")).toBe(false);

    send(engine, BRUTE_IP, "wrong-password", "authentication");
    await vi.advanceTimersByTimeAsync(20);
    expect(writes.some((row) => row.threatType === "rate_abuse")).toBe(true);
    expect(engine.isIpRateLimited(BRUTE_IP)).toBe(true);
    await vi.advanceTimersByTimeAsync(300_001);
    expect(engine.isIpRateLimited(BRUTE_IP)).toBe(false);
    engine.stop();
  });

  it("detects request flooding only after the DDoS window threshold", async () => {
    const { engine, writes } = await newEngine();
    for (let request = 0; request < 500; request++) {
      send(engine, "203.0.113.60", "normal request", "api", "GET");
    }
    await vi.advanceTimersByTimeAsync(110);
    expect(writes.some((row) => row.threatType === "rate_abuse")).toBe(false);

    send(engine, "203.0.113.60", "normal request", "api", "GET");
    await vi.advanceTimersByTimeAsync(20);
    expect(writes.some((row) => row.threatType === "rate_abuse")).toBe(true);
    expect(engine.isIpRateLimited("203.0.113.60")).toBe(true);
    engine.stop();
  });
});

describe("persistence, recovery, and database failure policy", () => {
  it("contains an unexpectedly rejected scheduled refresh and keeps the engine running", async () => {
    const { engine } = await newEngine();
    const failure = new Error("unexpected refresh rejection");
    vi.spyOn(engine, "refreshBlocklist").mockRejectedValueOnce(failure);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(logger.error).toHaveBeenCalledWith({ err: failure }, "Blocked-IP re-sync loop failed unexpectedly:");
    expect(engine.getStatus().isRunning).toBe(true);
    expect(engine.getIpBlockStatus(SQL_IP)).toBe("allowed");
    engine.stop();
  });

  it("contains a throwing queued-threat observer and continues draining requests", async () => {
    const { engine } = await newEngine();
    const failure = new Error("security observer failed");
    const observer = () => { throw failure; };
    engine.on("threat_detected", observer);
    for (let attempt = 0; attempt < 21; attempt++) send(engine, BRUTE_IP, "wrong password", "authentication");
    await vi.advanceTimersByTimeAsync(20);
    expect(logger.warn).toHaveBeenCalledWith({ err: failure }, "Detection error:");
    expect(engine.getStatus().queueSize).toBe(0);
    engine.off("threat_detected", observer);
    send(engine, SQL_IP, "ordinary request");
    await vi.advanceTimersByTimeAsync(20);
    expect(engine.getStatus().queueSize).toBe(0);
    expect(engine.getStatus().isRunning).toBe(true);
    engine.stop();
  });

  it("initializes once through concurrent start calls and exposes ready/stop state", async () => {
    const { database } = fakeDb();
    const engine = new SelfHealingSecurityEngine({ database, autoStart: false });
    await engine.ready();
    expect(engine.getStatus().isRunning).toBe(false);
    await Promise.all([engine.start(), engine.start(), engine.ready()]);
    expect(database.select).toHaveBeenCalledTimes(1);
    expect(engine.getStatus().isRunning).toBe(true);
    engine.stop();
    engine.stop();
    expect(engine.getStatus().isRunning).toBe(false);
    expect(SelfHealingSecurityEngine.getInstance()).toBe(SelfHealingSecurityEngine.getInstance());
  });

  it("retries a transient initial policy query with bounded backoff", async () => {
    const { database } = fakeDb({
      loaded: [{ ip: SQL_IP, expiresAt: new Date(BASE_TIME.getTime() + 60_000) }],
    });
    const query = database.select().from().where().limit;
    query.mockRejectedValueOnce(new Error("transient read outage"));
    const engine = new SelfHealingSecurityEngine({
      database, autoStart: false, initialLoadAttempts: 3, retryDelayMs: 10,
    });
    const started = engine.start();
    await settle();
    expect(engine.getIpBlockStatus(SQL_IP)).toBe("unknown");
    await vi.advanceTimersByTimeAsync(10);
    await started;
    expect(query).toHaveBeenCalledTimes(2);
    expect(engine.getIpBlockStatus(SQL_IP)).toBe("blocked");
    engine.stop();
  });

  it("recovers unknown initial policy through the scheduled resynchronization", async () => {
    const options: FakeDbOptions = { selectError: new Error("offline during startup") };
    const { engine } = await newEngine(options);
    expect(engine.getIpBlockStatus(SQL_IP)).toBe("unknown");
    options.selectError = undefined;
    options.loaded = [{ ip: SQL_IP, expiresAt: new Date(BASE_TIME.getTime() + 600_000) }];
    await vi.advanceTimersByTimeAsync(300_000);
    expect(engine.getIpBlockStatus(SQL_IP)).toBe("blocked");
    expect(engine.getIpBlockStatus(XSS_IP)).toBe("allowed");
    engine.stop();
  });

  it("filters expired, malformed and incomplete persisted block records", async () => {
    const { engine } = await newEngine({ loaded: [
      { ip: SQL_IP, expiresAt: new Date(BASE_TIME.getTime() + 60_000) },
      { ip: XSS_IP, expiresAt: new Date(BASE_TIME.getTime() - 1) },
      { ip: BRUTE_IP, expiresAt: new Date("invalid") },
      { ip: "", expiresAt: new Date(BASE_TIME.getTime() + 60_000) },
      { ip: "192.0.2.99" } as any,
    ] });
    expect(engine.getBlockedIps()).toEqual([SQL_IP]);
    engine.stop();
  });

  it("keeps the last finite policy when a refresh fails", async () => {
    const options: FakeDbOptions = {
      loaded: [{ ip: SQL_IP, expiresAt: new Date(BASE_TIME.getTime() + 1_000) }],
    };
    const { engine } = await newEngine(options);
    options.selectError = new Error("refresh read failed");
    await engine.refreshBlocklist();
    expect(engine.getIpBlockStatus(SQL_IP)).toBe("blocked");
    await vi.advanceTimersByTimeAsync(1_001);
    expect(engine.getIpBlockStatus(SQL_IP)).toBe("allowed");
    engine.stop();
  });

  it("does not discard active blocks when bulk durable deletion fails", async () => {
    const { engine } = await newEngine({ deleteError: new Error("bulk delete failed") });
    send(engine, SQL_IP, "' OR 1=1 --");
    await settle();
    await expect(engine.clearAllBlocks()).rejects.toThrow("bulk delete failed");
    expect(engine.getBlockedIps()).toEqual([SQL_IP]);
    engine.stop();
  });

  it("records an undelivered inbox alert when no administrator exists", async () => {
    const { engine, writes } = await newEngine({ admins: [] });
    send(engine, SQL_IP, "' UNION SELECT password FROM users --");
    await settle();
    expect(writes.filter(row => row.type === "security_alert")).toEqual([]);
    const recovery = writes.find(row => row.threatType === "sql_injection");
    expect(recovery?.metadata.actionOutcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "alert", status: "completed", alertSent: false,
        recipientCount: 0, alertDelivery: "structured_log" }),
    ]));
    expect(engine.isIpBlocked(SQL_IP)).toBe(true);
    engine.stop();
  });

  it("redacts non-Error administrator lookup failures without undoing containment", async () => {
    const { engine, database, writes } = await newEngine();
    const ordinarySelect = database.select.getMockImplementation();
    database.select.mockImplementation((selection: unknown) => selection
      ? { from: () => ({ where: async () => { throw "private provider detail"; } }) }
      : ordinarySelect!());
    send(engine, SQL_IP, "' UNION SELECT password FROM users --");
    await settle();
    const recovery = writes.find(row => row.threatType === "sql_injection");
    expect(recovery?.metadata.actionOutcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "alert", status: "failed", error: "Error: Security alert persistence failed" }),
    ]));
    expect(JSON.stringify(recovery)).not.toContain("private provider detail");
    expect(engine.isIpBlocked(SQL_IP)).toBe(true);
    engine.stop();
  });

  it("loads a persisted block, expires it, and supports durable unblock", async () => {
    const { engine, database } = await newEngine({
      loaded: [{ ip: SQL_IP, expiresAt: new Date(BASE_TIME.getTime() + 1_000) }],
    });
    expect(engine.getIpBlockStatus(SQL_IP)).toBe("blocked");
    await vi.advanceTimersByTimeAsync(1_001);
    expect(engine.getIpBlockStatus(SQL_IP)).toBe("allowed");

    send(engine, SQL_IP, "' OR 1=1 --");
    await settle();
    await engine.unblockIp(SQL_IP);
    expect(database.delete).toHaveBeenCalled();
    expect(engine.isIpBlocked(SQL_IP)).toBe(false);
    engine.stop();
  });

  it("fails closed for an unknown initial blocklist", async () => {
    const { engine } = await newEngine({ selectError: new Error("database offline") });
    expect(engine.getIpBlockStatus(SQL_IP)).toBe("unknown");

    const middleware = createSelfHealingSecurityMiddleware(engine);
    const response = responseDouble();
    const next = vi.fn();
    middleware(requestDouble(SQL_IP, SQL_IP), response, next);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SECURITY_STATE_UNAVAILABLE" }),
    );
    expect(next).not.toHaveBeenCalled();
    engine.stop();
  });

  it("enforces a detected block in memory when DB writes fail", async () => {
    const { engine } = await newEngine({ insertError: new Error("write failed") });
    send(engine, SQL_IP, "'; DROP TABLE users; --");
    await settle();
    expect(engine.isIpBlocked(SQL_IP)).toBe(true);
    engine.stop();
  });

  it("does not claim unblock when durable deletion fails", async () => {
    const { engine } = await newEngine({ deleteError: new Error("delete failed") });
    send(engine, SQL_IP, "' OR 1=1 --");
    await settle();
    await expect(engine.unblockIp(SQL_IP)).rejects.toThrow("delete failed");
    expect(engine.isIpBlocked(SQL_IP)).toBe(true);
    engine.stop();
  });

  it("removes a DB-backed block after another instance revokes it", async () => {
    const sharedRows = [
      { ip: SQL_IP, expiresAt: new Date(BASE_TIME.getTime() + 60_000) },
    ];
    const { engine } = await newEngine({ loaded: sharedRows });
    expect(engine.isIpBlocked(SQL_IP)).toBe(true);

    // Simulates a durable unblock committed by another process.
    sharedRows.splice(0);
    await engine.refreshBlocklist();
    expect(engine.isIpBlocked(SQL_IP)).toBe(false);
    engine.stop();
  });

  it("retains a failed-write local block across a successful refresh", async () => {
    const { engine } = await newEngine({ insertError: new Error("write failed") });
    send(engine, SQL_IP, "'; DROP TABLE users; --");
    await settle();
    expect(engine.isIpBlocked(SQL_IP)).toBe(true);

    await engine.refreshBlocklist();
    expect(engine.isIpBlocked(SQL_IP)).toBe(true);
    engine.stop();
  });

  it("lists blocks, short-circuits blocked events, and clears durably", async () => {
    const { engine, database } = await newEngine();
    send(engine, SQL_IP, "' OR 1=1 --");
    await settle();
    expect(engine.getBlockedIps()).toContain(SQL_IP);

    const blockedBefore = engine.getMetrics().threatsBlocked;
    send(engine, SQL_IP, "another request");
    expect(engine.getMetrics().threatsBlocked).toBe(blockedBefore + 1);

    await engine.clearAllBlocks();
    expect(database.delete).toHaveBeenCalled();
    expect(engine.getBlockedIps()).toEqual([]);
    engine.stop();
  });

  it("retains the explicit loopback safety exception", async () => {
    const { engine, writes } = await newEngine();
    for (const ip of ["127.0.0.1", "::1"]) {
      send(engine, ip, "'; DROP TABLE users; --");
    }
    await settle();
    expect(writes).toEqual([]);
    expect(engine.getStatus().queueSize).toBe(0);
    engine.stop();
  });
});

describe("actual middleware address and enforcement boundaries", () => {
  it("does not trust a spoofed forwarded localhost address", async () => {
    const { engine } = await newEngine({
      loaded: [{ ip: SQL_IP, expiresAt: new Date(BASE_TIME.getTime() + 60_000) }],
    });
    const middleware = createSelfHealingSecurityMiddleware(engine);
    const response = responseDouble();
    const next = vi.fn();
    middleware(
      requestDouble(undefined, SQL_IP, { "x-forwarded-for": "127.0.0.1" }),
      response,
      next,
    );
    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    engine.stop();
  });

  it("does not blanket-whitelist RFC1918 client sources", async () => {
    const { engine } = await newEngine();
    const middleware = createSelfHealingSecurityMiddleware(engine);

    const privateNext = vi.fn();
    middleware(
      requestDouble("10.23.45.67", "10.23.45.67"),
      responseDouble(),
      privateNext,
    );
    expect(privateNext).toHaveBeenCalledOnce();
    expect(engine.getStatus().queueSize).toBe(1);

    send(engine, "10.23.45.68", "'; DROP TABLE users; --");
    await settle();
    expect(engine.isIpBlocked("10.23.45.68")).toBe(true);
    engine.stop();
  });

  it("fails closed for private clients when initial policy is unknown", async () => {
    const { engine } = await newEngine({ selectError: new Error("database offline") });
    const middleware = createSelfHealingSecurityMiddleware(engine);
    const response = responseDouble();
    const next = vi.fn();
    middleware(
      requestDouble("192.168.50.12", "192.168.50.12"),
      response,
      next,
    );
    expect(response.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    engine.stop();
  });

  it("preserves only the narrow operational boot path during unknown state", async () => {
    const { engine } = await newEngine({ selectError: new Error("database offline") });
    const middleware = createSelfHealingSecurityMiddleware(engine);
    const request = requestDouble("192.168.50.12", "192.168.50.12");
    request.path = "/api/ready";
    const next = vi.fn();
    middleware(request, responseDouble(), next);
    expect(next).toHaveBeenCalledOnce();
    engine.stop();
  });

  it("passes clean traffic, registers error monitoring, and enforces known blocks", async () => {
    const { engine } = await newEngine({
      loaded: [{ ip: SQL_IP, expiresAt: new Date(BASE_TIME.getTime() + 60_000) }],
    });
    const middleware = createSelfHealingSecurityMiddleware(engine);

    const cleanResponse = responseDouble();
    const cleanNext = vi.fn();
    middleware(
      requestDouble("198.51.100.70", "198.51.100.70"),
      cleanResponse,
      cleanNext,
    );
    expect(cleanNext).toHaveBeenCalledOnce();
    expect(cleanResponse.on).toHaveBeenCalledWith("finish", expect.any(Function));

    const blockedResponse = responseDouble();
    const blockedNext = vi.fn();
    middleware(requestDouble(SQL_IP, SQL_IP), blockedResponse, blockedNext);
    expect(blockedResponse.status).toHaveBeenCalledWith(403);
    expect(blockedResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "IP_BLOCKED" }),
    );
    expect(blockedNext).not.toHaveBeenCalled();
    engine.stop();
  });

  it("does not escalate browser transport headers as XSS input", async () => {
    const { engine, writes } = await newEngine();
    const middleware = createSelfHealingSecurityMiddleware(engine);

    for (let requestIndex = 0; requestIndex < 6; requestIndex++) {
      const request = requestDouble(XSS_IP, XSS_IP, {
        referer: "https://example.test/article?snippet=<script>alert(1)</script>",
        accept: "text/html,application/xhtml+xml",
        "sec-fetch-mode": "navigate",
      });
      request.path = "/";
      request.method = "GET";
      request.query = {};
      middleware(request, responseDouble(), vi.fn());
    }

    await settle();
    expect(engine.getMetrics().threatsDetected).toBe(0);
    expect(engine.isIpRateLimited(XSS_IP)).toBe(false);
    expect(engine.isIpBlocked(XSS_IP)).toBe(false);
    expect(writes).toHaveLength(0);
    engine.stop();
  });

  it("continues inspecting URL query input for XSS", async () => {
    const { engine } = await newEngine();
    const middleware = createSelfHealingSecurityMiddleware(engine);
    const request = requestDouble(XSS_IP, XSS_IP);
    request.path = "/search";
    request.query = { q: "<img src=x onerror=alert(1)>" };

    middleware(request, responseDouble(), vi.fn());
    await settle();

    expect(engine.getMetrics().threatsDetected).toBe(1);
    expect(engine.isIpRateLimited(XSS_IP)).toBe(true);
    expect(engine.isIpBlocked(XSS_IP)).toBe(false);
    engine.stop();
  });
});
