import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let messageHandler:
    | ((channel: string, message: string) => void)
    | undefined;
  const subscriber = {
    on: vi.fn((event: string, callback: typeof messageHandler) => {
      if (event === "message") messageHandler = callback;
    }),
    subscribe: vi.fn(async (_channel: string) => undefined),
    unsubscribe: vi.fn(async (_channel: string) => undefined),
    quit: vi.fn(async () => "OK"),
    deliver: (channel: string, message: string) => messageHandler?.(channel, message),
  };
  const publisher = {
    publish: vi.fn(async (channel: string, message: string) => {
      subscriber.deliver(channel, message);
      return 1;
    }),
  };
  return {
    subscriber,
    publisher,
    createRedisClient: vi.fn(async () => subscriber),
    getRedisClient: vi.fn(async () => publisher),
    logger: { warn: vi.fn() },
  };
});

vi.mock("../../lib/redisConnectionFactory.js", () => ({
  createRedisClient: mocks.createRedisClient,
  getRedisClient: mocks.getRedisClient,
}));
vi.mock("../../lib/pdimClient.js", () => ({
  isPdimConfigured: () => true,
}));
vi.mock("../../logger.js", () => ({ logger: mocks.logger }));

import {
  CollaborationEventBus,
  type CollaborationRoomMessageEvent,
} from "../collaborationEventBus.js";

describe("CollaborationEventBus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes persisted room messages over one process-wide subscription", async () => {
    const bus = new CollaborationEventBus();
    const received: Array<{
      projectId: string;
      event: CollaborationRoomMessageEvent;
    }> = [];
    const unsubscribe = await bus.subscribe((projectId, event) => {
      received.push({ projectId, event });
    });
    const event: CollaborationRoomMessageEvent = {
      type: "room:message",
      payload: {
        id: "message-one",
        clientMessageId: "9c731e7c-7815-4f88-94bd-291cc1ac7632",
        senderId: "user-one",
        senderName: "A collaborator",
        content: "A persisted message",
        createdAt: "2026-11-21T12:00:00.000Z",
      },
    };

    await expect(bus.publishProjectEvent("project-one", event)).resolves.toBe(1);
    expect(received).toEqual([{ projectId: "project-one", event }]);
    expect(mocks.subscriber.subscribe).toHaveBeenCalledWith(
      "maxbooster:collaboration:room-events",
    );

    await unsubscribe();
    expect(received).toHaveLength(1);
    await bus.shutdown();
    expect(mocks.subscriber.unsubscribe).toHaveBeenCalledWith(
      "maxbooster:collaboration:room-events",
    );
    expect(mocks.subscriber.quit).toHaveBeenCalledOnce();
  });

  it("rejects malformed or oversized events instead of publishing arbitrary payloads", async () => {
    const bus = new CollaborationEventBus();
    await expect(
      bus.publishProjectEvent("project-one", {
        type: "room:message",
        payload: { content: "missing required fields" },
      } as unknown as CollaborationRoomMessageEvent),
    ).rejects.toThrow("Invalid collaboration event");

    const oversized: CollaborationRoomMessageEvent = {
      type: "room:message",
      payload: {
        id: "message-two",
        clientMessageId: "9c731e7c-7815-4f88-94bd-291cc1ac7632",
        senderId: "user-one",
        senderName: "A collaborator",
        content: "x".repeat(20_000),
        createdAt: "2026-11-21T12:00:00.000Z",
      },
    };
    await expect(
      bus.publishProjectEvent("project-one", oversized),
    ).rejects.toThrow("exceeds the size limit");
    expect(mocks.publisher.publish).not.toHaveBeenCalled();
  });

  it("reports the persisted-event delivery failure when no server is subscribed", async () => {
    const bus = new CollaborationEventBus();
    mocks.publisher.publish.mockResolvedValueOnce(0);
    await expect(
      bus.publishProjectEvent("project-one", {
        type: "room:message",
        payload: {
          id: "message-three",
          clientMessageId: "a10d714c-1838-4056-99ba-2b3b2ba08691",
          senderId: "user-one",
          senderName: "A collaborator",
          content: "No subscriber is listening",
          createdAt: "2026-11-21T12:00:00.000Z",
        },
      }),
    ).rejects.toThrow("No collaboration event subscribers are available");
  });
});
