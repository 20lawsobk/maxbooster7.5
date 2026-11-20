import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  load: vi.fn(),
  unload: vi.fn(),
  logger: { warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../../services/yjsService.js", () => ({
  REMOTE_YJS_UPDATE_ORIGIN: Symbol.for("maxbooster.yjs.remote-pubsub"),
  yjsService: {
    subscribeToProjectUpdates: mocks.subscribe,
    loadDocument: mocks.load,
    unloadDocument: mocks.unload,
  },
}));
vi.mock("../../realtime/presenceManager.js", () => ({ presenceManager: {} }));
vi.mock("../../services/jwtAuthService.js", () => ({ jwtAuthService: {} }));
vi.mock("../../storage.js", () => ({ storage: {} }));
vi.mock("../../services/studioProjectAccess.js", () => ({
  getStudioProjectAccess: vi.fn(),
}));
vi.mock("../../lib/redisConnectionFactory.js", () => ({
  getRedisClient: vi.fn(),
}));
vi.mock("../../logger.js", () => ({ logger: mocks.logger }));

import { StudioCollabServer } from "../studioCollabServer.js";

describe("StudioCollabServer shared document loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes before loading and applies updates received during the load", async () => {
    const order: string[] = [];
    const snapshot = new Y.Doc();
    snapshot.getMap("metadata");

    const remoteSource = new Y.Doc();
    remoteSource.getMap("metadata").set("duringLoad", "preserved");
    const remoteUpdate = Y.encodeStateAsUpdate(remoteSource);

    mocks.subscribe.mockImplementation(
      async (_projectId: string, receive: (update: Uint8Array) => void) => {
        order.push("subscribe");
        receive(remoteUpdate);
      },
    );
    mocks.load.mockImplementation(async () => {
      order.push("load");
      return snapshot;
    });

    const server = new StudioCollabServer();
    const loaded = await (server as any).getOrLoadDocument("project-load-race");

    expect(order).toEqual(["subscribe", "load"]);
    expect(loaded.getMap("metadata").get("duringLoad")).toBe("preserved");
  });

  it("shares one in-flight document load for simultaneous room connections", async () => {
    let resolveLoad!: (doc: Y.Doc) => void;
    const doc = new Y.Doc();
    const loadPromise = new Promise<Y.Doc>((resolve) => {
      resolveLoad = resolve;
    });
    mocks.subscribe.mockResolvedValue(undefined);
    mocks.load.mockReturnValue(loadPromise);

    const server = new StudioCollabServer();
    const first = (server as any).getOrLoadDocument("project-concurrent");
    const second = (server as any).getOrLoadDocument("project-concurrent");
    await Promise.resolve();
    resolveLoad(doc);

    const [firstDoc, secondDoc] = await Promise.all([first, second]);
    expect(firstDoc).toBe(doc);
    expect(secondDoc).toBe(doc);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
  });
});
