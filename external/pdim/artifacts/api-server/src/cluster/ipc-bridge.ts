// ============================================================================
// IPC Bridge — used inside WORKER processes only.
// Converts async store/manager calls into process.send() round-trips so each
// worker delegates all state operations back to the primary.
// ============================================================================

import { randomUUID } from "crypto";
import type { W2PMessage, P2WMessage, DistributiveOmit } from "./ipc-types.js";

class IPCBridge {
  private readonly pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  constructor() {
    process.on("message", (msg: P2WMessage) => {
      const cb = this.pending.get(msg.reqId);
      if (!cb) return;
      this.pending.delete(msg.reqId);
      if ("error" in msg) cb.reject(new Error(msg.error));
      else cb.resolve(msg.result);
    });
  }

  async call<T>(req: DistributiveOmit<W2PMessage, "reqId">): Promise<T> {
    const reqId = randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(reqId, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      process.send!({ ...req, reqId });
    });
  }
}

export const ipcBridge = new IPCBridge();

// ── Proxy helpers used by the routes in worker mode ──────────────────────────

export interface StoreProxy {
  exec(cmd: string, args: string[]): Promise<unknown>;
  getStats(): Promise<Record<string, unknown>>;
}

export const managerProxy = {
  async validateToken(instanceId: string, token: string): Promise<boolean> {
    return ipcBridge.call<boolean>({
      kind: "validateToken",
      instanceId,
      token,
    });
  },

  async createInstance(name: string, maxKeys: number): Promise<unknown> {
    return ipcBridge.call<unknown>({ kind: "createInstance", name, maxKeys });
  },

  async listInstances(): Promise<unknown> {
    return ipcBridge.call<unknown>({ kind: "listInstances" });
  },

  async getInfo(instanceId: string): Promise<unknown> {
    return ipcBridge.call<unknown>({ kind: "getInfo", instanceId });
  },

  async deleteInstance(instanceId: string): Promise<boolean> {
    return ipcBridge.call<boolean>({ kind: "deleteInstance", instanceId });
  },

  touchInstance(instanceId: string): void {
    const reqId = randomUUID();
    process.send!({ kind: "touchInstance", reqId, instanceId });
  },

  async getStore(instanceId: string): Promise<StoreProxy | null> {
    const exists = await ipcBridge.call<boolean>({
      kind: "getInfo",
      instanceId,
    });
    if (!exists) return null;
    return {
      async exec(cmd: string, args: string[]): Promise<unknown> {
        return ipcBridge.call<unknown>({ kind: "exec", instanceId, cmd, args });
      },
      async getStats(): Promise<Record<string, unknown>> {
        return ipcBridge.call<Record<string, unknown>>({
          kind: "getInfo",
          instanceId,
        });
      },
    };
  },

  async pipeline(
    instanceId: string,
    commands: Array<{ cmd: string; args: string[] }>,
  ): Promise<unknown> {
    return ipcBridge.call<unknown>({ kind: "pipeline", instanceId, commands });
  },
};
