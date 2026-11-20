import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const mocks = vi.hoisted(() => {
  const subscribers: Array<{
    channels: Set<string>;
    emit: (event: string, ...args: unknown[]) => void;
  }> = [];

  const makeSubscriber = () => {
    const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    const channels = new Set<string>();
    const subscriber = {
      channels,
      on(event: string, handler: (...args: unknown[]) => void) {
        const eventHandlers = handlers.get(event) ?? [];
        eventHandlers.push(handler);
        handlers.set(event, eventHandlers);
        return subscriber;
      },
      async subscribe(channel: string) {
        channels.add(channel);
      },
      async unsubscribe(channel: string) {
        channels.delete(channel);
      },
      emit(event: string, ...args: unknown[]) {
        for (const handler of handlers.get(event) ?? []) handler(...args);
      },
    };
    subscribers.push(subscriber);
    return subscriber;
  };

  const redis = {
    get: vi.fn(async () => null),
    publish: vi.fn(async (channel: string, message: string) => {
      for (const subscriber of subscribers) {
        if (subscriber.channels.has(channel)) {
          subscriber.emit("message", channel, message);
        }
      }
      return subscribers.length;
    }),
    setEx: vi.fn(async () => "OK"),
    del: vi.fn(async () => 1),
  };

  const storage = {
    getLatestCollabSnapshot: vi.fn(async () => null),
    saveCollabSnapshot: vi.fn(async () => undefined),
    deleteOldCollabSnapshots: vi.fn(async () => undefined),
  };

  return {
    subscribers,
    makeSubscriber,
    redis,
    storage,
    pdimConfigured: true,
    logger: { warn: vi.fn(), info: vi.fn() },
  };
});

vi.mock("../../lib/redisConnectionFactory.js", () => ({
  getRedisClient: async () => mocks.redis,
  createRedisClient: async () => mocks.makeSubscriber(),
}));
vi.mock("../../lib/pdimClient.js", () => ({
  isPdimConfigured: () => mocks.pdimConfigured,
}));
vi.mock("../../storage.js", () => ({ storage: mocks.storage }));
vi.mock("../../logger.js", () => ({ logger: mocks.logger }));

import {
  REMOTE_YJS_UPDATE_ORIGIN,
  YjsCollaborationService,
} from "../yjsService.js";

describe("Yjs collaboration cross-instance synchronization", () => {
  beforeEach(() => {
    mocks.subscribers.splice(0);
    mocks.pdimConfigured = true;
    vi.clearAllMocks();
  });

  it("delivers a local update to another instance exactly once", async () => {
    const producer = new YjsCollaborationService();
    const replica = new YjsCollaborationService();
    const projectId = "project-cross-instance";
    const producerDoc = await producer.loadDocument(projectId);
    const replicaDoc = await replica.loadDocument(projectId);

    await producer.subscribeToProjectUpdates(projectId, (update) => {
      Y.applyUpdate(producerDoc, update, REMOTE_YJS_UPDATE_ORIGIN);
    });
    await replica.subscribeToProjectUpdates(projectId, (update) => {
      Y.applyUpdate(replicaDoc, update, REMOTE_YJS_UPDATE_ORIGIN);
    });

    producerDoc.getMap("metadata").set("sharedTitle", "visible on replica");

    await vi.waitFor(() => {
      expect(replicaDoc.getMap("metadata").get("sharedTitle")).toBe(
        "visible on replica",
      );
    });
    expect(mocks.redis.publish).toHaveBeenCalledTimes(1);

    await Promise.all([
      producer.unloadDocument(projectId, producerDoc),
      replica.unloadDocument(projectId, replicaDoc),
    ]);
    expect(mocks.storage.saveCollabSnapshot).toHaveBeenCalledTimes(2);
  });

  it("refuses to claim shared collaboration when PDIM is unavailable", async () => {
    mocks.pdimConfigured = false;
    const service = new YjsCollaborationService();

    await expect(
      service.subscribeToProjectUpdates("project-without-pdim", () => undefined),
    ).rejects.toThrow("PDIM is required for cross-instance collaboration");
  });
});
