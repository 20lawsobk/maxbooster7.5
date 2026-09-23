import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const previousPort = process.env.LOCAL_PDIM_PORT;
const port = 15_556;
let client: import("../../server/lib/pdimClient.js").PdimRedisClient;
let stopServer: () => Promise<void>;

describe("local PDIM real HTTP protocol", () => {
  beforeAll(async () => {
    process.env.LOCAL_PDIM_PORT = String(port);
    vi.resetModules();
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        default: {
          ...actual.default,
          existsSync: (path: import("node:fs").PathLike) =>
            String(path).endsWith("local-pdim-store.json")
              ? false
              : actual.default.existsSync(path),
        },
      };
    });
    const local = await import("../../server/lib/localPdimServer.js");
    const pdim = await import("../../server/lib/pdimClient.js");
    await local.startLocalPdimServer();
    stopServer = local.stopLocalPdimServer;
    client = new pdim.PdimRedisClient(local.getLocalPdimUrl(), "");
  });

  afterAll(async () => {
    await stopServer?.();
    if (previousPort === undefined) delete process.env.LOCAL_PDIM_PORT;
    else process.env.LOCAL_PDIM_PORT = previousPort;
  });

  it("executes HMGET through the Lua fast-lane with Redis null slots", async () => {
    const key = `test:local-pdim:hash:${process.pid}`;
    try {
      await client.scriptExec(["HSET", key, "present", "value"]);
      await expect(
        client.scriptExec(["HMGET", key, "present", "missing"]),
      ).resolves.toEqual(["value", null]);
    } finally {
      await client.del(key);
    }
  });

  it("executes ZPOPMIN through the Lua fast-lane and removes the minimum", async () => {
    const key = `test:local-pdim:zset:${process.pid}`;
    try {
      await client.scriptExec(["ZADD", key, "2", "later", "1", "first"]);
      await expect(
        client.scriptExec(["ZPOPMIN", key, "1"]),
      ).resolves.toEqual(["first", "1"]);
      await expect(client.scriptExec(["ZRANGE", key, "0", "-1"])).resolves.toEqual([
        "later",
      ]);
    } finally {
      await client.del(key);
    }
  });

  it("returns an explicit protocol error for unknown commands", async () => {
    await expect(client.scriptExec(["NOT_A_REDIS_COMMAND"])).rejects.toThrow(
      /ERR unknown command/,
    );
  });
});