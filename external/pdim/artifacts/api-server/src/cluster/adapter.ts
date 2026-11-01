// ============================================================================
// Cluster Adapter — gives routes a single import point that works in
// BOTH standalone mode (direct store access) and cluster-worker mode (IPC).
// Routes never reference redisManager or ipcBridge directly.
// ============================================================================

import cluster from "cluster";
import { randomUUID } from "crypto";
import {
  redisManager,
  buildConnectionUrl,
  buildHttpUrl,
} from "../redis/manager.js";
import { ipcBridge } from "./ipc-bridge.js";

// ── Common result types ───────────────────────────────────────────────────────

export interface InstanceCreated {
  id: string;
  name: string;
  token: string;
  connectionUrl: string;
  httpUrl: string;
  createdAt: string;
}

export interface InstanceInfo {
  id: string;
  name: string;
  httpUrl: string;
  tokenHint: string;
  isActive: boolean;
  keyCount: number;
  createdAt: string;
  lastUsedAt: string;
}

export interface StoreStats {
  instanceId: string;
  instanceName: string;
  keyCount: number;
  totalCommandsProcessed: number;
  uptimeSeconds: number;
  createdAt: string;
  lastSavedAt: string;
  persistenceEnabled: boolean;
}

export interface PipelineResult {
  result: unknown;
  error: string | null;
}

// ── Adapter API ───────────────────────────────────────────────────────────────

export const adapter = {
  validateToken(instanceId: string, token: string): Promise<boolean> {
    if (cluster.isWorker) {
      return ipcBridge.call<boolean>({
        kind: "validateToken",
        instanceId,
        token,
      });
    }
    return redisManager.validateToken(instanceId, token);
  },

  async createInstance(
    name: string,
    maxKeys: number,
  ): Promise<InstanceCreated> {
    if (cluster.isWorker) {
      return ipcBridge.call<InstanceCreated>({
        kind: "createInstance",
        name,
        maxKeys,
      });
    }
    const inst = await redisManager.createInstance(name, maxKeys);
    return {
      id: inst.id,
      name: inst.name,
      token: inst.token,
      connectionUrl: inst.connectionUrl,
      httpUrl: inst.httpUrl,
      createdAt:
        inst.createdAt instanceof Date
          ? inst.createdAt.toISOString()
          : String(inst.createdAt),
    };
  },

  listInstances(): Promise<InstanceInfo[]> {
    if (cluster.isWorker) {
      return ipcBridge.call<InstanceInfo[]>({ kind: "listInstances" });
    }
    return redisManager.listInstances().then((rows) =>
      rows.map((r) => ({
        ...r,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt),
        lastUsedAt:
          r.lastUsedAt instanceof Date
            ? r.lastUsedAt.toISOString()
            : String(r.lastUsedAt),
      })),
    );
  },

  async getStats(instanceId: string): Promise<StoreStats | null> {
    if (cluster.isWorker) {
      return ipcBridge.call<StoreStats | null>({ kind: "getInfo", instanceId });
    }
    const store = await redisManager.getStore(instanceId);
    if (!store) return null;
    return store.getStats() as unknown as StoreStats;
  },

  async instanceExists(instanceId: string): Promise<boolean> {
    const stats = await adapter.getStats(instanceId);
    return stats !== null;
  },

  deleteInstance(instanceId: string): Promise<boolean> {
    if (cluster.isWorker) {
      return ipcBridge.call<boolean>({ kind: "deleteInstance", instanceId });
    }
    return redisManager.deleteInstance(instanceId);
  },

  touchInstance(instanceId: string): void {
    if (cluster.isWorker) {
      process.send!({ kind: "touchInstance", reqId: randomUUID(), instanceId });
    } else {
      void redisManager.touchInstance(instanceId);
    }
  },

  async exec(
    instanceId: string,
    cmd: string,
    args: string[],
  ): Promise<unknown> {
    if (cluster.isWorker) {
      return ipcBridge.call<unknown>({ kind: "exec", instanceId, cmd, args });
    }
    const store = await redisManager.getStore(instanceId);
    if (!store) throw new Error("Instance not found");
    return store.exec(cmd, args);
  },

  async pipeline(
    instanceId: string,
    commands: Array<{ cmd: string; args: string[] }>,
  ): Promise<PipelineResult[]> {
    if (cluster.isWorker) {
      return ipcBridge.call<PipelineResult[]>({
        kind: "pipeline",
        instanceId,
        commands,
      });
    }
    const store = await redisManager.getStore(instanceId);
    if (!store) throw new Error("Instance not found");
    const results: PipelineResult[] = [];
    for (const { cmd, args } of commands) {
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
  },
};
