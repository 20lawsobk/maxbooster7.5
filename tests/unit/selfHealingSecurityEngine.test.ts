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
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, any>) => {
        writes.push(value);
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
    expect(writes.filter((row) => row.type === "security_alert")).toHaveLength(1);
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
});