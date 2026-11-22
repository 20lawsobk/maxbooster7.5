import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  load: vi.fn(),
  unload: vi.fn(),
  verifyAccessToken: vi.fn(),
  redisGet: vi.fn(),
  projectAccess: vi.fn(),
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
vi.mock("../../services/jwtAuthService.js", () => ({
  jwtAuthService: { verifyAccessToken: mocks.verifyAccessToken },
}));
vi.mock("../../storage.js", () => ({ storage: {} }));
vi.mock("../../services/studioProjectAccess.js", () => ({
  getStudioProjectAccess: mocks.projectAccess,
}));
vi.mock("../../lib/redisConnectionFactory.js", () => ({
  getRedisClient: vi.fn(async () => ({ get: mocks.redisGet })),
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

  it("revalidates bearer and session credentials for active connections", async () => {
    const server = new StudioCollabServer() as any;
    mocks.verifyAccessToken.mockResolvedValue({ userId: "user-one" });
    await expect(
      server.isCredentialStillValid(
        { headers: { authorization: "Bearer signed-token" } },
        "user-one",
      ),
    ).resolves.toBe(true);
    await expect(
      server.isCredentialStillValid(
        { headers: { authorization: "Bearer signed-token" } },
        "user-two",
      ),
    ).resolves.toBe(false);

    mocks.redisGet.mockResolvedValue(
      JSON.stringify({ passport: { user: "user-one" } }),
    );
    await expect(
      server.isCredentialStillValid(
        { headers: { cookie: "connect.sid=s%3Asession-id.signature" } },
        "user-one",
      ),
    ).resolves.toBe(true);
    mocks.redisGet.mockResolvedValue(null);
    await expect(
      server.isCredentialStillValid(
        { headers: { cookie: "connect.sid=s%3Asession-id.signature" } },
        "user-one",
      ),
    ).resolves.toBe(false);
  });

  it("closes active collaboration sockets when project read access is revoked", async () => {
    mocks.verifyAccessToken.mockResolvedValue({ userId: "user-one" });
    mocks.projectAccess.mockResolvedValue({ read: false, write: false });
    const server = new StudioCollabServer() as any;
    const client = {
      ws: { readyState: 1, close: vi.fn(), ping: vi.fn() },
      userId: "user-one",
      projectId: "project-one",
      roomId: null,
      roomGeneration: null,
      authFingerprint: "auth-one",
      request: { headers: { authorization: "Bearer signed-token" } },
      isAlive: true,
      inCall: false,
      publishingMedia: false,
    };
    server.clients.set("project-one", new Set([client]));
    vi.spyOn(server, "handleDisconnect").mockResolvedValue(undefined);

    await server.refreshActiveConnections();

    expect(client.ws.close).toHaveBeenCalledWith(1008, "Project access revoked");
  });

  it("closes active media publishers when project write access is revoked", async () => {
    mocks.verifyAccessToken.mockResolvedValue({ userId: "user-one" });
    mocks.projectAccess.mockResolvedValue({ read: true, write: false });
    const server = new StudioCollabServer() as any;
    const client = {
      ws: { readyState: 1, close: vi.fn(), ping: vi.fn() },
      userId: "user-one",
      projectId: "project-one",
      roomId: null,
      roomGeneration: null,
      authFingerprint: "auth-one",
      request: { headers: { authorization: "Bearer signed-token" } },
      isAlive: true,
      inCall: true,
      publishingMedia: true,
    };
    server.clients.set("project-one", new Set([client]));
    vi.spyOn(server, "handleDisconnect").mockResolvedValue(undefined);
    const checkAccess = vi.spyOn(server, "checkProjectAccess");

    await server.refreshActiveConnections();

    expect(client.ws.close).toHaveBeenCalledWith(1008, "Project access revoked");
    expect(checkAccess).toHaveBeenCalledWith(
      "user-one",
      "project-one",
      "write",
    );
  });
});
