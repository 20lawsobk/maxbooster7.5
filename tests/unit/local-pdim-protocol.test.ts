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