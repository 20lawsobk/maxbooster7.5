import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const previousPort = process.env.LOCAL_PDIM_PORT;
const previousStoreFile = process.env.LOCAL_PDIM_STORE_FILE;
const port = 15_556;
let client: import("../../server/lib/pdimClient.js").PdimRedisClient;
let stopServer: () => Promise<void>;
let capsuleSnapshot = "";
let tempStoreDirectory = "";

describe("local PDIM real HTTP protocol", () => {
  beforeAll(async () => {
    process.env.LOCAL_PDIM_PORT = String(port);
    tempStoreDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "local-pdim-http-"));
    process.env.LOCAL_PDIM_STORE_FILE = path.join(
      tempStoreDirectory,
      "local-pdim-store.json",
    );
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
    if (previousStoreFile === undefined) delete process.env.LOCAL_PDIM_STORE_FILE;
    else process.env.LOCAL_PDIM_STORE_FILE = previousStoreFile;
    if (tempStoreDirectory) {
      fs.rmSync(tempStoreDirectory, { recursive: true, force: true });
      tempStoreDirectory = "";
    }
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
      const startedAt = Date.now();
      await expect(client.bzpopmin(key, 0.01)).resolves.toBeNull();
      expect(Date.now() - startedAt).toBeLessThan(500);
    } finally {
      await client.del(key);
    }
  });

  it("wakes a blocked sorted-set consumer on writes and cancels it on disconnect", async () => {
    const key = `test:local-pdim:blocking:${process.pid}`;
    const consumer = client.duplicate();
    const blocked = consumer.bzpopmin(key, 0);
    await new Promise((resolve) => setTimeout(resolve, 30));

    try {
      await expect(client.zadd(key, 1, "wake")).resolves.toBe(1);
      await expect(Promise.race([
        blocked,
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error("blocking pop did not wake promptly")), 1_000),
        ),
      ])).resolves.toEqual([key, "wake", "1"]);
    } finally {
      await consumer.disconnect();
      await client.del(key);
    }

    const cancelKey = `${key}:cancel`;
    const cancellable = client.duplicate();
    const pending = cancellable.bzpopmin(cancelKey, 0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await cancellable.disconnect();
    await expect(Promise.race([
      pending,
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error("disconnect did not cancel blocking pop")), 1_000),
      ),
    ])).rejects.toThrow(/disconnected/i);
  }, 5_000);

  it("delivers Pub/Sub messages between separate PDIM HTTP clients", async () => {
    const channel = `test:local-pdim:pubsub:${process.pid}`;
    const publisher = client.duplicate();
    const subscriber = client.duplicate();
    const message = new Promise<[string, string]>((resolve) => {
      subscriber.once("message", (receivedChannel: string, body: string) => {
        resolve([receivedChannel, body]);
      });
    });

    try {
      await subscriber.subscribe(channel, `${channel}:broadcast`);
      await expect(publisher.publish(channel, "hello-from-pdim")).resolves.toBe(1);
      await expect(Promise.race([
        message,
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error("PDIM Pub/Sub delivery timed out")), 1_000),
        ),
      ])).resolves.toEqual([channel, "hello-from-pdim"]);
      await expect(subscriber.unsubscribe(channel)).resolves.toBe(1);
      await expect(publisher.publish(channel, "after-unsubscribe")).resolves.toBe(0);
    } finally {
      await subscriber.disconnect();
      await publisher.disconnect();
    }
  }, 5_000);

  it("delivers pattern subscriptions with Redis pmessage shape", async () => {
    const pattern = `test:local-pdim:pattern:${process.pid}:*`;
    const channel = `test:local-pdim:pattern:${process.pid}:room-1`;
    const publisher = client.duplicate();
    const subscriber = client.duplicate();
    const message = new Promise<[string, string, string]>((resolve) => {
      subscriber.once("pmessage", (receivedPattern: string, receivedChannel: string, body: string) => {
        resolve([receivedPattern, receivedChannel, body]);
      });
    });

    try {
      await subscriber.psubscribe(pattern);
      await expect(publisher.publish(channel, "pattern-payload")).resolves.toBe(1);
      await expect(Promise.race([
        message,
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error("PDIM pattern Pub/Sub delivery timed out")), 1_000),
        ),
      ])).resolves.toEqual([pattern, channel, "pattern-payload"]);
    } finally {
      await subscriber.punsubscribe(pattern);
      await subscriber.disconnect();
      await publisher.disconnect();
    }
  }, 5_000);

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

  it("reclaims stream pending entries by idle time, cursor, and consumer over HTTP", async () => {
    const key = `test:local-pdim:stream-claim:${process.pid}`;
    try {
      await client.scriptExec(["XGROUP", "CREATE", key, "workers", "0", "MKSTREAM"]);
      const firstId = String(await client.scriptExec([
        "XADD", key, "*", "payload", "first",
      ]));
      const secondId = String(await client.scriptExec([
        "XADD", key, "*", "payload", "second",
      ]));
      await client.scriptExec([
        "XREADGROUP", "GROUP", "workers", "consumer-a", "COUNT", "2",
        "STREAMS", key, ">",
      ]);

      await expect(client.scriptExec([
        "XCLAIM", key, "workers", "consumer-b", "60000", firstId, "JUSTID",
      ])).resolves.toEqual([]);
      const firstPage = await client.scriptExec([
        "XAUTOCLAIM", key, "workers", "consumer-b", "0", "0-0", "COUNT", "1",
      ]) as unknown[];
      expect(firstPage).toEqual([
        secondId,
        [[firstId, ["payload", "first"]]],
        [],
      ]);

      await expect(client.scriptExec([
        "XCLAIM", key, "workers", "consumer-c", "0", firstId, "JUSTID",
      ])).resolves.toEqual([firstId]);
      await expect(client.scriptExec([
        "XREADGROUP", "GROUP", "workers", "consumer-a", "STREAMS", key, "0",
      ])).resolves.toEqual([[key, [[secondId, ["payload", "second"]]]]]);
      await expect(client.scriptExec([
        "XREADGROUP", "GROUP", "workers", "consumer-b", "STREAMS", key, "0",
      ])).resolves.toBeNull();
      await expect(client.scriptExec([
        "XREADGROUP", "GROUP", "workers", "consumer-c", "STREAMS", key, "0",
      ])).resolves.toEqual([[key, [[firstId, ["payload", "first"]]]]]);

      await expect(client.scriptExec([
        "XAUTOCLAIM", key, "workers", "consumer-d", "0", secondId,
        "COUNT", "1", "JUSTID",
      ])).resolves.toEqual(["0-0", [secondId], []]);
      await expect(client.scriptExec([
        "XREADGROUP", "GROUP", "workers", "consumer-a", "STREAMS", key, "0",
      ])).resolves.toBeNull();
      await client.scriptExec(["XDEL", key, secondId]);
      await expect(client.scriptExec([
        "XAUTOCLAIM", key, "workers", "consumer-d", "0", secondId,
        "COUNT", "1",
      ])).resolves.toEqual(["0-0", [], [secondId]]);

      const forcedId = String(await client.scriptExec([
        "XADD", key, "*", "payload", "forced",
      ]));
      await expect(client.scriptExec([
        "XCLAIM", key, "workers", "consumer-force", "0", forcedId,
        "FORCE", "JUSTID",
      ])).resolves.toEqual([forcedId]);
      await expect(client.scriptExec([
        "XREADGROUP", "GROUP", "workers", "consumer-force", "STREAMS", key, "0",
      ])).resolves.toEqual([[key, [[forcedId, ["payload", "forced"]]]]]);
    } finally {
      await client.del(key);
    }
  }, 5_000);

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

  it("executes multi commands atomically and returns per-command errors over HTTP", async () => {
    const key = `test:local-pdim:multi:${process.pid}`;
    const missingKey = `${key}:after-error`;
    try {
      const replies = await client.multi()
        .set(key, "1")
        .incr(key)
        .get(key)
        .exec();
      expect(replies).toEqual([
        [null, "OK"],
        [null, 2],
        [null, "2"],
      ]);

      const errorReplies = await client.multi()
        .hget(key, "field")
        .set(missingKey, "later-command-ran")
        .exec();
      expect(errorReplies).toHaveLength(2);
      expect((errorReplies[0] as [Error, null])[0]).toBeInstanceOf(Error);
      expect((errorReplies[0] as [Error, null])[0].message).toMatch(/WRONGTYPE/i);
      expect(errorReplies[1]).toEqual([null, "OK"]);
      await expect(client.get(missingKey)).resolves.toBe("later-command-ran");
    } finally {
      await client.del(key, missingKey);
    }
  });

  it("runs a real BullMQ job through PDIM without native Redis", async () => {
    const envKeys = [
      "REDIS_URL",
      "NATIVE_REDIS_URL",
      "PDIM_HTTP_EXEC_URL",
      "PDIM_EXEC_URL",
      "PDIM_BEARER_TOKEN",
      "PDIM_EXEC_TOKEN",
    ] as const;
    const previousEnv = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]]),
    ) as Record<(typeof envKeys)[number], string | undefined>;
    let queue: import("bullmq").Queue | undefined;
    let worker: import("bullmq").Worker | undefined;

    try {
      process.env.REDIS_URL = "";
      process.env.NATIVE_REDIS_URL = "";
      process.env.PDIM_HTTP_EXEC_URL = `http://127.0.0.1:${port}/api/redis/instances/local/exec`;
      process.env.PDIM_EXEC_URL = process.env.PDIM_HTTP_EXEC_URL;
      process.env.PDIM_BEARER_TOKEN = "";
      process.env.PDIM_EXEC_TOKEN = "";
      vi.resetModules();

      const [{ Queue, Worker }, { newBullMQRedisConnection }] = await Promise.all([
        import("bullmq"),
        import("../../server/lib/redisClient.js"),
      ]);
      const withDeadline = async <T>(
        operation: Promise<T>,
        stage: string,
        timeoutMs = 8_000,
      ): Promise<T> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            operation,
            new Promise<T>((_resolve, reject) => {
              timer = setTimeout(
                () => reject(new Error(`PDIM-backed BullMQ timed out during ${stage}`)),
                timeoutMs,
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };
      const executions = new Map<string, number>();
      let markStalledWorkerStarted = () => {};
      const stalledWorkerStarted = new Promise<void>((resolve) => {
        markStalledWorkerStarted = resolve;
      });
      const expectedLockLossErrors: string[] = [];
      const queueName = `pdim-bullmq-probe-${process.pid}`;
      queue = new Queue(queueName, {
        connection: newBullMQRedisConnection() as never,
        defaultJobOptions: { removeOnComplete: false },
      });
      await withDeadline(queue.waitUntilReady(), "queue readiness");

      worker = new Worker(
        queueName,
        async (job) => {
          const execution = (executions.get(job.name) ?? 0) + 1;
          executions.set(job.name, execution);
          if (job.name === "retry-probe" && execution === 1) {
            throw new Error("exercise BullMQ retry path");
          }
          if (job.name === "lock-renewal-probe") {
            await new Promise((resolve) => setTimeout(resolve, 6_500));
          }
          if (job.name === "stalled-recovery-probe" && execution === 1) {
            markStalledWorkerStarted();
            await new Promise((resolve) => setTimeout(resolve, 2_000));
          }
          return { accepted: job.data.value, execution };
        },
        {
          connection: newBullMQRedisConnection() as never,
          concurrency: 1,
          lockDuration: 3_000,
          stalledInterval: 1_500,
        },
      );
      await withDeadline(worker.waitUntilReady(), "worker readiness");

      const completionFor = (
        jobName: string,
        timeoutMs = 12_000,
        expectLockLoss = false,
      ) =>
        new Promise<unknown>((resolve, reject) => {
          let timer: ReturnType<typeof setTimeout>;
          const cleanup = () => {
            clearTimeout(timer);
            worker!.off("completed", onCompleted);
            worker!.off("failed", onFailed);
            worker!.off("error", onError);
          };
          const onCompleted = (job: { name: string }, result: unknown) => {
            if (job.name !== jobName) return;
            cleanup();
            resolve(result);
          };
          const onFailed = (
            job: { name: string; attemptsMade: number; opts: { attempts?: number } },
            error: Error,
          ) => {
            if (job.name !== jobName || job.attemptsMade < (job.opts.attempts ?? 1)) return;
            cleanup();
            reject(error);
          };
          const onError = (error: Error) => {
            if (
              expectLockLoss &&
              /(?:could not renew lock for job|missing lock for job .*moveToFinished)/i.test(error.message)
            ) {
              expectedLockLossErrors.push(error.message);
              return;
            }
            cleanup();
            reject(error);
          };
          worker!.on("completed", onCompleted);
          worker!.on("failed", onFailed);
          worker!.on("error", onError);
          timer = setTimeout(() => {
            cleanup();
            reject(new Error(`PDIM-backed BullMQ timed out waiting for ${jobName}`));
          }, timeoutMs);
        });

      const completion = completionFor("compatibility-probe");
      const job = await withDeadline(
        queue.add("compatibility-probe", { value: "pdim" }),
        "job enqueue",
        15_000,
      );
      await expect(
        completion,
      ).resolves.toEqual({ accepted: "pdim", execution: 1 });
      await expect(
        withDeadline(queue.getJob(job.id!)!.then((queuedJob) => queuedJob?.getState()), "job state"),
      ).resolves.toBe("completed");

      const retryCompletion = completionFor("retry-probe");
      await withDeadline(queue.add(
        "retry-probe",
        { value: "retried" },
        { attempts: 2, backoff: { type: "fixed", delay: 10 } },
      ), "retry enqueue");
      await expect(retryCompletion).resolves.toEqual({ accepted: "retried", execution: 2 });
      expect(executions.get("retry-probe")).toBe(2);

      const delayedCompletion = completionFor("delayed-probe");
      const delayStartedAt = Date.now();
      await withDeadline(queue.add(
        "delayed-probe",
        { value: "delayed" },
        { delay: 200 },
      ), "delayed-job enqueue");
      await expect(delayedCompletion).resolves.toEqual({ accepted: "delayed", execution: 1 });
      expect(Date.now() - delayStartedAt).toBeGreaterThanOrEqual(150);

      const lockCompletion = completionFor("lock-renewal-probe");
      await withDeadline(queue.add(
        "lock-renewal-probe",
        { value: "lock-renewed" },
      ), "lock-renewal enqueue");
      await expect(lockCompletion).resolves.toEqual({
        accepted: "lock-renewed",
        execution: 1,
      });
      expect(executions.get("lock-renewal-probe")).toBe(1);

      const stalledCompletion = completionFor("stalled-recovery-probe", 12_000, true);
      const stalledJob = await withDeadline(queue.add(
        "stalled-recovery-probe",
        { value: "recovered" },
      ), "stalled-job enqueue");
      await withDeadline(stalledWorkerStarted, "stalled-job activation");
      await client.del(`bull:${queueName}:${stalledJob.id}:lock`);
      await expect(stalledCompletion).resolves.toEqual({
        accepted: "recovered",
        execution: 2,
      });
      expect(expectedLockLossErrors.some((message) =>
        message.includes(String(stalledJob.id)),
      )).toBe(true);
      expect(executions.get("stalled-recovery-probe")).toBe(2);
      await expect(
        withDeadline(
          queue.getJob(stalledJob.id!)!.then((queuedJob) => queuedJob?.getState()),
          "stalled-job final state",
        ),
      ).resolves.toBe("completed");

      const repeatCompletion = completionFor("repeat-probe", 10_000);
      await withDeadline(queue.add(
        "repeat-probe",
        { value: "repeat" },
        { repeat: { every: 1_000, limit: 1 } },
      ), "repeat-job enqueue");
      await expect(repeatCompletion).resolves.toEqual({
        accepted: "repeat",
        execution: 1,
      });
      expect(executions.get("repeat-probe")).toBe(1);
    } finally {
      await worker?.close();
      await queue?.close();
      for (const key of envKeys) {
        if (previousEnv[key] === undefined) delete process.env[key];
        else process.env[key] = previousEnv[key];
      }
    }
  }, 35_000);

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