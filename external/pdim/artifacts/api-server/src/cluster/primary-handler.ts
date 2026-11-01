// ============================================================================
// Primary IPC Handler — runs only in the PRIMARY (cluster master) process.
// Listens for W2PMessage from worker processes, executes them against the
// real services (RedisManager, HealthMonitor, LuaPool, PocketManager),
// and sends results back to the caller worker.
// ============================================================================

import cluster, { type Worker } from "cluster";
import { redisManager } from "../redis/manager.js";
import { healthMonitor } from "../services/serverHealthMonitor.js";
import { luaPool } from "../workers/lua-pool.js";
import { pocketManager } from "../pocket-dimension/index.js";
import type { W2PMessage } from "./ipc-types.js";

async function handleMessage(msg: W2PMessage): Promise<unknown> {
  switch (msg.kind) {
    // ── Store / manager operations ──────────────────────────────────────────

    case "validateToken":
      return redisManager.validateToken(msg.instanceId, msg.token);

    case "createInstance": {
      const inst = await redisManager.createInstance(msg.name, msg.maxKeys);
      return {
        id: inst.id,
        name: inst.name,
        token: inst.token,
        connectionUrl: inst.connectionUrl,
        httpUrl: inst.httpUrl,
        createdAt: inst.createdAt,
      };
    }

    case "listInstances":
      return redisManager.listInstances();

    case "getInfo": {
      const store = await redisManager.getStore(msg.instanceId);
      if (!store) return null;
      return store.getStats();
    }

    case "deleteInstance":
      return redisManager.deleteInstance(msg.instanceId);

    case "touchInstance":
      void redisManager.touchInstance(msg.instanceId);
      return null;

    case "exec": {
      const store = await redisManager.getStore(msg.instanceId);
      if (!store) throw new Error("Instance not found");
      return store.exec(msg.cmd, msg.args);
    }

    case "pipeline": {
      const store = await redisManager.getStore(msg.instanceId);
      if (!store) throw new Error("Instance not found");
      const results: Array<{ result: unknown; error: string | null }> = [];
      for (const { cmd, args } of msg.commands) {
        try {
          results.push({ result: await store.exec(cmd, args), error: null });
        } catch (err) {
          results.push({
            result: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return results;
    }

    // ── Monitor / diagnostic operations ────────────────────────────────────

    case "getHealthSnapshot":
      return healthMonitor.getSnapshot();

    case "getHealthHistory":
      return healthMonitor.getHistory(msg.limit);

    case "forceProbe":
      return healthMonitor.forceProbe();

    case "getScaleStats": {
      const instances = await redisManager.listInstances();
      return {
        luaPool: {
          ready: luaPool.isReady,
          activeConcurrency: luaPool.activeConcurrency,
          workerThreads: Number(process.env["LUA_WORKER_THREADS"] ?? 2),
        },
        stores: instances.map((i) => ({
          instanceId: i.id,
          instanceName: i.name,
          keyCount: i.keyCount,
        })),
      };
    }

    case "evict": {
      const instances = await redisManager.listInstances();
      const results: Record<string, number> = {};
      for (const { id } of instances) {
        const store = await redisManager.getStore(id);
        if (!store) {
          results[id] = 0;
          continue;
        }
        const count =
          msg.count > 0
            ? msg.count
            : Math.floor((store.getStats().keyCount ?? 0) * 0.1);
        results[id] = store.evictLRU(Math.max(count, 1));
      }
      return results;
    }

    case "compact": {
      const pocketIds = pocketManager.listPockets();
      const results: Record<string, number> = {};
      for (const pid of pocketIds) {
        try {
          const pocket = await pocketManager.openPocket(pid);
          results[pid] = await pocket.compact();
        } catch {
          results[pid] = -1;
        }
      }
      return results;
    }
  }
}

export function registerPrimaryIPCHandler(): void {
  cluster.on("message", (worker: Worker, msg: W2PMessage) => {
    if (!msg?.kind || !msg?.reqId) return;

    handleMessage(msg)
      .then((result) => {
        worker.send({ reqId: msg.reqId, result });
      })
      .catch((err) => {
        worker.send({
          reqId: msg.reqId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  });
}
