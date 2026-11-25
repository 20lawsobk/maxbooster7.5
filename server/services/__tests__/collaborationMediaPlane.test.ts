import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CollaborationMediaPlane } from "../collaborationMediaPlane.js";

const relevantKeys = [
  "COLLABORATION_MEDIA_ENABLED",
  "COLLABORATION_MEDIA_REGION",
  "COLLABORATION_MEDIA_LISTEN_IP",
  "COLLABORATION_MEDIA_ANNOUNCED_ADDRESS",
  "COLLABORATION_MEDIA_RTP_MIN_PORT",
  "COLLABORATION_MEDIA_RTP_MAX_PORT",
  "COLLABORATION_TURN_URLS",
  "COLLABORATION_TURN_SHARED_SECRET",
  "COLLABORATION_MEDIA_CAPACITY_REPORT",
  "COLLABORATION_MEDIA_CAPACITY_REPORT_SHA256",
] as const;

const originalEnvironment = new Map(
  relevantKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of relevantKeys) {
    const original = originalEnvironment.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("CollaborationMediaPlane readiness", () => {
  it("does not enable a media plane unless a region is explicitly enabled", async () => {
    const plane = new CollaborationMediaPlane();
    const status = await plane.getAvailability({} as NodeJS.ProcessEnv);

    expect(status).toEqual({
      available: false,
      state: "unavailable",
      region: null,
      participantLimit: null,
      reason: "No regional media service is enabled.",
    });
  });

  it("fails closed when regional, relay, and capacity evidence are incomplete", async () => {
    const plane = new CollaborationMediaPlane();
    const status = await plane.getAvailability({
      COLLABORATION_MEDIA_ENABLED: "true",
      COLLABORATION_MEDIA_REGION: "us-central",
    } as NodeJS.ProcessEnv);

    expect(status.available).toBe(false);
    expect(status.state).toBe("unavailable");
    expect(status.region).toBe("us-central");
    expect(status.participantLimit).toBeNull();
    expect(status.reason).toContain("configuration is incomplete");
  });

  it("does not accept missing capacity or relay evidence", async () => {
    const plane = new CollaborationMediaPlane();
    const status = await plane.getAvailability({
      COLLABORATION_MEDIA_ENABLED: "true",
      COLLABORATION_MEDIA_REGION: "us-central",
      COLLABORATION_MEDIA_LISTEN_IP: "0.0.0.0",
      COLLABORATION_MEDIA_ANNOUNCED_ADDRESS: "media.example.invalid",
      COLLABORATION_MEDIA_RTP_MIN_PORT: "40000",
      COLLABORATION_MEDIA_RTP_MAX_PORT: "40100",
      COLLABORATION_TURN_URLS: "turns:turn.example.invalid:5349",
      COLLABORATION_TURN_SHARED_SECRET: "test-only",
      COLLABORATION_MEDIA_CAPACITY_REPORT:
        "reports/collaboration-media/missing-test-report.json",
      COLLABORATION_MEDIA_CAPACITY_REPORT_SHA256: "0".repeat(64),
    } as NodeJS.ProcessEnv);

    expect(status.available).toBe(false);
    expect(status.participantLimit).toBeNull();
    expect(status.reason).toContain("could not be read");
  });

  it("shuts down without leaving a worker or room state", async () => {
    const plane = new CollaborationMediaPlane();

    await expect(plane.shutdown()).resolves.toBeUndefined();
    expect(plane.isJoined("unknown-connection")).toBe(false);
  });

  it("starts the local SFU worker, allocates a router and binds a WebRTC transport", async () => {
    const plane = new CollaborationMediaPlane();
    const reportDirectory = path.resolve(
      process.cwd(),
      "reports",
      "collaboration-media",
    );
    const reportPath = path.join(
      reportDirectory,
      `.unit-${process.pid}-${randomUUID()}.json`,
    );
    await mkdir(reportDirectory, { recursive: true });
    const evidence = {
      schemaVersion: 1,
      region: "local-test",
      maxParticipants: 2,
      testedParticipants: 2,
      testRunId: randomUUID(),
      measuredAt: new Date().toISOString(),
      durationSeconds: 300,
      loadTestPassed: true,
      turnRelayVerified: true,
    };
    const report = Buffer.from(JSON.stringify(evidence));
    await writeFile(reportPath, report, { mode: 0o600 });

    const testEnvironment: Record<string, string> = {
      COLLABORATION_MEDIA_ENABLED: "true",
      COLLABORATION_MEDIA_REGION: "local-test",
      COLLABORATION_MEDIA_LISTEN_IP: "127.0.0.1",
      COLLABORATION_MEDIA_ANNOUNCED_ADDRESS: "127.0.0.1",
      COLLABORATION_MEDIA_RTP_MIN_PORT: "40000",
      COLLABORATION_MEDIA_RTP_MAX_PORT: "40100",
      COLLABORATION_TURN_URLS: "turn:127.0.0.1:3478",
      COLLABORATION_TURN_SHARED_SECRET: "unit-test-only",
      COLLABORATION_MEDIA_CAPACITY_REPORT: path.relative(
        process.cwd(),
        reportPath,
      ),
      COLLABORATION_MEDIA_CAPACITY_REPORT_SHA256: createHash("sha256")
        .update(report)
        .digest("hex"),
    };
    const previousEnvironment = new Map(
      relevantKeys.map((key) => [key, process.env[key]]),
    );

    try {
      for (const [key, value] of Object.entries(testEnvironment)) {
        process.env[key] = value;
      }
      const readiness = await plane.prepare();
      expect(readiness).toMatchObject({
        available: true,
        state: "available",
        region: "local-test",
        participantLimit: 2,
        reason: null,
      });
      const roomId = randomUUID();
      const connectionId = randomUUID();
      const joined = await plane.join({
        roomId,
        roomGeneration: 1,
        userId: randomUUID(),
        connectionId,
      });
      expect(joined.routerRtpCapabilities.codecs.length).toBeGreaterThan(0);
      const transport = await plane.createTransport(connectionId);
      expect(transport.id).toBeTruthy();
      expect(transport.iceCandidates.length).toBeGreaterThan(0);
      await plane.leave(connectionId);
    } finally {
      await plane.shutdown();
      for (const key of relevantKeys) {
        const value = previousEnvironment.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await rm(reportPath, { force: true });
    }
  }, 30_000);
});
