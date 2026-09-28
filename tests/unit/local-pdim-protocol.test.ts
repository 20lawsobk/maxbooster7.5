import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const previousPort = process.env.LOCAL_PDIM_PORT;
const port = 15_556;
let client: import("../../server/lib/pdimClient.js").PdimRedisClient;
let stopServer: () => Promise<void>;
let capsuleSnapshot = "";

describe("local PDIM real HTTP protocol", () => {
  beforeAll(async () => {
    process.env.LOCAL_PDIM_PORT = String(port);
    vi.resetModules();
    vi.doMock("../../server/lib/localPdimCapsuleJournal.js", () => ({
      LocalPdimCapsuleJournal: class {
        publishedSeq = 0;
        private entries: Record<string, unknown> = {};
        recover() {}
        async compact() {}
        async commit(changes: Record<string, string | null>, publish: () => void) {
          for (const [key, value] of Object.entries(changes)) {
            if (value === null) delete this.entries[key];
            else this.entries[key] = { type: "string", value };
          }
          publish();
          this.publishedSeq++;
          capsuleSnapshot = JSON.stringify(this.entries);
        }
      },
    }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        default: {
          ...actual.default,
          promises: {
            ...actual.default.promises,
            open: async (...args: Parameters<typeof actual.default.promises.open>) => {
              if (String(args[0]).includes("local-pdim-store.json.async-")) {
                return {
                  writeFile: async (value: string) => { capsuleSnapshot = String(value); },
                  sync: async () => {},
                  close: async () => {},
                };
              }
              return actual.default.promises.open(...args);
            },
          },
          existsSync: (path: import("node:fs").PathLike) =>
            String(path).endsWith("local-pdim-store.json")
              ? false
              : actual.default.existsSync(path),
          writeFileSync: (...args: Parameters<typeof actual.default.writeFileSync>) => {
            if (String(args[0]).includes("local-pdim-store.json.tmp-")) {
              capsuleSnapshot = String(args[1]);
              return;
            }
            return actual.default.writeFileSync(...args);
          },
          renameSync: (source: import("node:fs").PathLike, target: import("node:fs").PathLike) => {
            if (String(target).endsWith("local-pdim-store.json")) return;
            return actual.default.renameSync(source, target);
          },
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

  it("probes BullMQ-shaped BZPOPMIN consumption and timeout over the PDIM HTTP adapter", async () => {
    const key = `test:local-pdim:bullmq-zset:${process.pid}`;
    try {
      await client.scriptExec(["ZADD", key, "2", "later", "1", "first"]);
      await expect(client.bzpopmin(key, 1)).resolves.toEqual([key, "first", "1"]);
      await expect(client.bzpopmin(key, 1)).resolves.toEqual([key, "later", "2"]);
      await expect(client.bzpopmin(key, 0.01)).resolves.toBeNull();
    } finally {
      await client.del(key);
    }
  });

  it("probes stream-group delivery and acknowledgement over the PDIM HTTP adapter", async () => {
    const key = `test:local-pdim:stream:${process.pid}`;
    try {
      await client.scriptExec(["XGROUP", "CREATE", key, "workers", "0", "MKSTREAM"]);
      const id = await client.scriptExec(["XADD", key, "*", "payload", "work"]);
      await expect(client.scriptExec([
        "XREADGROUP", "GROUP", "workers", "consumer-1", "STREAMS", key, ">",
      ])).resolves.toEqual([[key, [[id, ["payload", "work"]]]]]);
      await expect(client.scriptExec(["XACK", key, "workers", String(id)])).resolves.toBe(1);
      await expect(client.scriptExec([
        "XREADGROUP", "GROUP", "workers", "consumer-2", "STREAMS", key, ">",
      ])).resolves.toBeNull();
    } finally {
      await client.del(key);
    }
  });

  it("probes concurrent multi-key Lua execution over the PDIM HTTP adapter", async () => {
    const firstKey = `test:local-pdim:lua:first:${process.pid}`;
    const secondKey = `test:local-pdim:lua:second:${process.pid}`;
    const script = [
      "local first = redis.call('INCR', KEYS[1])",
      "local second = redis.call('INCR', KEYS[2])",
      "return {first, second}",
    ].join("\n");
    try {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => client.eval(script, 2, firstKey, secondKey)),
      );
      expect(results.every((result) =>
        Array.isArray(result) && result[0] === result[1],
      )).toBe(true);
      await expect(client.get(firstKey)).resolves.toBe("8");
      await expect(client.get(secondKey)).resolves.toBe("8");
    } finally {
      await client.del(firstKey, secondKey);
    }
  });

  it("returns an explicit protocol error for unknown commands", async () => {
    await expect(client.scriptExec(["NOT_A_REDIS_COMMAND"])).rejects.toThrow(
      /ERR unknown command/,
    );
  });

  it("never trusts forged identity headers on the private authenticated channel", async () => {
    const previous = process.env.PDIM_LOCAL_CHANNEL_TOKEN;
    process.env.PDIM_LOCAL_CHANNEL_TOKEN = "test-private-channel";
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/redis/instances/local/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": "127.0.0.1", "X-Admin": "true" },
        body: JSON.stringify({ cmd: "PING", args: [] }),
      });
      expect(response.status).toBe(401);
    } finally {
      if (previous === undefined) delete process.env.PDIM_LOCAL_CHANNEL_TOKEN;
      else process.env.PDIM_LOCAL_CHANNEL_TOKEN = previous;
    }
  });

  it("routes actual HTTP GPU state writes into compressed nested capsules", async () => {
    const payload = JSON.stringify({ dtype: "float32", shape: [8192], vram: Buffer.alloc(32768, 7).toString("base64") });
    const exec = async (cmd: string, args: string[]) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/redis/instances/local/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, args }),
      });
      expect(response.status).toBe(200);
      return response.json();
    };
    expect(await exec("CAPSULE.SET", ["gpu-state/http-roundtrip", payload])).toBe("OK");
    const snapshot = JSON.parse(capsuleSnapshot);
    const chunkKeys = Object.keys(snapshot).filter((key) =>
      key.startsWith("pdim:chunk:local-compute-capsules/gpu-state/"));
    expect(chunkKeys.length).toBeGreaterThan(0);
    expect(Buffer.from(snapshot[chunkKeys[0]].value, "base64").subarray(0, 4).toString()).toBe("PDCF");
    expect(await exec("CAPSULE.GET", ["gpu-state/http-roundtrip"])).toBe(payload);
  });
});