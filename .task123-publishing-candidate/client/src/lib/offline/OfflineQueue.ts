import { logger } from "../logger";
import { accountDatabase, guardDatabase, offlineIdentity, assertOfflineIdentity } from "./identity";
import { openDB, IDBPDatabase, DBSchema } from "idb";

export type ActionPriority = "critical" | "high" | "normal" | "low";
export type ConflictStrategy =
  | "local-wins"
  | "server-wins"
  | "merge"
  | "manual";
export type ActionStatus =
  | "pending"
  | "syncing"
  | "completed"
  | "failed"
  | "conflict";

export interface QueuedAction<T = unknown> {
  id: string;
  type: string;
  payload: T;
  priority: ActionPriority;
  status: ActionStatus;
  conflictStrategy: ConflictStrategy;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  maxRetries: number;
  error?: string;
  metadata?: Record<string, unknown>;
  dependencies?: string[];
  serverVersion?: number;
  localVersion?: number;
  nextAttemptAt?: number;
  leaseExpiresAt?: number;
  handoffId?: string;
  terminalReceipt?: boolean;
}

interface OfflineQueueDB extends DBSchema {
  actions: {
    key: string;
    value: QueuedAction;
    indexes: {
      "by-status": ActionStatus;
      "by-priority": ActionPriority;
      "by-type": string;
      "by-created": number;
    };
  };
  conflicts: {
    key: string;
    value: {
      actionId: string;
      localData: unknown;
      serverData: unknown;
      detectedAt: number;
      resolved: boolean;
    };
  };
}

const DB_NAME = "max-booster-offline-queue";
const DB_VERSION = 1;

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export type QueueEventType =
  | "action-added"
  | "action-updated"
  | "action-removed"
  | "sync-started"
  | "sync-completed"
  | "conflict-detected";

export interface QueueEvent {
  type: QueueEventType;
  action?: QueuedAction;
  actionId?: string;
  conflict?: { localData: unknown; serverData: unknown };
}

type QueueEventListener = (event: QueueEvent) => void;

class OfflineQueue {
  private db: IDBPDatabase<OfflineQueueDB> | null = null;
  private listeners: Map<QueueEventType, Set<QueueEventListener>> = new Map();
  private isInitialized = false;

  async init(): Promise<void> {
    const name = accountDatabase(DB_NAME);
    if (this.db && this.db.name !== name) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
    if (this.isInitialized) return;

    try {
      this.db = await openDB<OfflineQueueDB>(name, DB_VERSION, {
        upgrade(db) {
          if (!db?.objectStoreNames.contains("actions")) {
            const actionsStore = db?.createObjectStore("actions", {
              keyPath: "id",
            });
            actionsStore?.createIndex("by-status", "status");
            actionsStore?.createIndex("by-priority", "priority");
            actionsStore?.createIndex("by-type", "type");
            actionsStore?.createIndex("by-created", "createdAt");
          }

          if (!db?.objectStoreNames.contains("conflicts")) {
            db?.createObjectStore("conflicts", { keyPath: "actionId" });
          }
        },
      });
      this.isInitialized = true;
    } catch (error) {
      logger.info(
        "[OfflineQueue] IndexedDB unavailable — offline action queue disabled for this session",
        error,
      );
      throw error;
    }
  }

  private async ensureDb(): Promise<IDBPDatabase<OfflineQueueDB>> {
    const identity = offlineIdentity();
    await this.init();
    assertOfflineIdentity(identity);
    if (this.db?.name !== accountDatabase(DB_NAME)) throw new Error("Offline queue account changed during initialization");
    return guardDatabase(this.db!, identity);
  }

  private emit(event: QueueEvent): void {
    const listeners = this.listeners.get(event?.type);
    if (listeners) {
      listeners?.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          logger.error("[OfflineQueue] Event listener error:", error);
        }
      });
    }
  }

  on(eventType: QueueEventType, listener: QueueEventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  off(eventType: QueueEventType, listener: QueueEventListener): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  async enqueue<T = unknown>(
    type: string,
    payload: T,
    options: {
      priority?: ActionPriority;
      conflictStrategy?: ConflictStrategy;
      maxRetries?: number;
      metadata?: Record<string, unknown>;
      dependencies?: string[];
    } = {},
  ): Promise<QueuedAction<T>> {
    const db = await this.ensureDb();

    const action: QueuedAction<T> = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      payload,
      priority: options.priority ?? "normal",
      status: "pending",
      conflictStrategy: options.conflictStrategy ?? "local-wins",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      metadata: options.metadata,
      dependencies: options.dependencies,
      localVersion: 1,
    };

    await db?.put("actions", action as QueuedAction);

    this.emit({ type: "action-added", action: action as QueuedAction });

    return action;
  }

  async dequeue(id: string): Promise<void> {
    const db = await this.ensureDb();
    await db?.delete("actions", id);
    this.emit({ type: "action-removed", actionId: id });
  }

  async updateAction<T = unknown>(
    id: string,
    updates: Partial<QueuedAction<T>>,
  ): Promise<QueuedAction<T> | null> {
    if (["id", "type", "payload", "metadata"].some(key => Object.prototype.hasOwnProperty.call(updates, key))) {
      throw new Error("Operation identity and payload are immutable. Enqueue a new operation for a corrected change.");
    }
    const db = await this.ensureDb();
    const existing = await db?.get("actions", id);

    if (!existing) return null;

    const updated: QueuedAction<T> = {
      ...(existing as QueuedAction<T>),
      ...updates,
      updatedAt: Date.now(),
    };

    await db?.put("actions", updated as QueuedAction);
    this.emit({ type: "action-updated", action: updated as QueuedAction });

    return updated;
  }

  async getAction<T = unknown>(
    id: string,
  ): Promise<QueuedAction<T> | undefined> {
    const db = await this.ensureDb();
    return db?.get("actions", id) as Promise<QueuedAction<T> | undefined>;
  }

  async getAllPending(): Promise<QueuedAction[]> {
    const db = await this.ensureDb();
    const actions = await db?.getAllFromIndex("actions", "by-status", "pending");

    return actions?.sort((a, b) => {
      const priorityDiff =
        PRIORITY_ORDER[a?.priority] - PRIORITY_ORDER[b?.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a?.createdAt - b?.createdAt;
    });
  }

  async getByStatus(status: ActionStatus): Promise<QueuedAction[]> {
    const db = await this.ensureDb();
    return db?.getAllFromIndex("actions", "by-status", status);
  }

  async getByType(type: string): Promise<QueuedAction[]> {
    const db = await this.ensureDb();
    return db?.getAllFromIndex("actions", "by-type", type);
  }

  async getPendingCount(): Promise<number> {
    const db = await this.ensureDb();
    return db?.countFromIndex("actions", "by-status", "pending");
  }

  async getTotalCount(): Promise<number> {
    const db = await this.ensureDb();
    return db?.count("actions");
  }

  async markSyncing(id: string): Promise<void> {
    await this.updateAction(id, { status: "syncing" });
    this.emit({ type: "sync-started", actionId: id });
  }

  async markCompleted(id: string): Promise<void> {
    await this.updateAction(id, { status: "completed" });
    this.emit({ type: "sync-completed", actionId: id });
  }

  async markFailed(id: string, error: string): Promise<void> {
    const action = await this.getAction(id);
    if (!action) return;

    const newRetryCount = action?.retryCount + 1;
    const shouldRetry = newRetryCount < action?.maxRetries;

    await this.updateAction(id, {
      status: shouldRetry ? "pending" : "failed",
      retryCount: newRetryCount,
      nextAttemptAt: Date.now() + Math.min(60000, 1000 * 2 ** newRetryCount),
      error,
    });
  }

  async recordConflict(
    actionId: string,
    localData: unknown,
    serverData: unknown,
  ): Promise<void> {
    const db = await this.ensureDb();

    await db?.put("conflicts", {
      actionId,
      localData,
      serverData,
      detectedAt: Date.now(),
      resolved: false,
    });

    await this.updateAction(actionId, { status: "conflict" });

    this.emit({
      type: "conflict-detected",
      actionId,
      conflict: { localData, serverData },
    });
  }

  async getConflicts(): Promise<
    Array<{
      actionId: string;
      localData: unknown;
      serverData: unknown;
      detectedAt: number;
    }>
  > {
    const db = await this.ensureDb();
    const conflicts = await db?.getAll("conflicts");
    return conflicts?.filter((c) => !c?.resolved);
  }

  async resolveConflict(
    actionId: string,
    resolution: "local" | "server" | "merged",
    mergedData?: unknown,
  ): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction(["actions", "conflicts"], "readwrite");
    const conflicts = tx.objectStore("conflicts");
    const actions = tx.objectStore("actions");
    const conflict = await conflicts.get(actionId);
    const action = await actions.get(actionId);
    if (!conflict || conflict.resolved || !action) { await tx.done; return; }
    let replacement: QueuedAction | undefined;
    if (resolution !== "server") {
      const server = conflict.serverData as { updatedAt?: string | null };
      const original = action.payload as Record<string, unknown>;
      replacement = {
        ...action, id: crypto.randomUUID(), status: "pending", retryCount: 0,
        error: undefined, terminalReceipt: false, handoffId: undefined,
        leaseExpiresAt: undefined, nextAttemptAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
        payload: { ...original, ...(resolution === "merged" ? { changes: mergedData } : {}),
          expectedUpdatedAt: server.updatedAt ?? null },
        metadata: { ...action.metadata, resolvesOperationId: actionId },
      };
      await actions.put(replacement);
      // Downstream work must wait for the reviewed replacement, not mistake
      // the original conflicted operation for an applied prerequisite.
      for (const dependent of await actions.getAll()) {
        if (dependent.dependencies?.includes(actionId)) await actions.put({
          ...dependent, dependencies: dependent.dependencies.map(id => id === actionId ? replacement!.id : id),
        });
      }
    }
    await conflicts.put({ ...conflict, resolved: true });
    await actions.delete(actionId);
    await tx.done;
    this.emit({ type: "action-removed", actionId });
    if (replacement) this.emit({ type: "action-added", action: replacement });
  }

  async clearCompleted(): Promise<number> {
    const db = await this.ensureDb();
    const completed = await db?.getAllFromIndex(
      "actions",
      "by-status",
      "completed",
    );

    for (const action of completed) {
      // Keep prerequisite receipts until the dependent actions are removed.
      const dependents = (await db.getAll("actions")).some(a => a.dependencies?.includes(action.id));
      if (!dependents) await db?.delete("actions", action?.id);
    }

    return completed?.length;
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.isInitialized = false;
  }

  async clearAll(): Promise<void> {
    const db = await this.ensureDb();
    await db?.clear("actions");
    await db?.clear("conflicts");
  }

  async getNextBatch(batchSize = 10, actionId?: string): Promise<QueuedAction[]> {
    const db = await this.ensureDb();
    const tx = db.transaction("actions", "readwrite");
    const all = await tx.store.getAll();
    const now = Date.now();
    for (const action of all) {
      if (action.status === "syncing" && (!action.leaseExpiresAt || action.leaseExpiresAt <= now)) {
        // No server operation receipt API exists yet. Never blindly resend an
        // uncertain commit, including legacy records left in syncing.
        action.status = "failed";
        action.error = "Reconciliation required: the previous request may have committed.";
        await tx.store.put(action);
      }
    }
    const pending = all.filter(a => a.status === "pending" && (a.nextAttemptAt || 0) <= now)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.createdAt - b.createdAt);
    const batch: QueuedAction[] = [];
    const processing = new Set<string>();

    for (const action of pending) {
      if (actionId && action.id !== actionId) continue;
      if (batch?.length >= batchSize) break;

      const dependenciesMet =
        !action?.dependencies?.length ||
        action?.dependencies.every(
          (depId) => all.find(p => p.id === depId)?.status === "completed",
        );

      if (dependenciesMet && !processing?.has(action?.id)) {
        action.status = "syncing";
        action.leaseExpiresAt = now + 60000;
        await tx.store.put(action);
        batch?.push(action);
        processing?.add(action?.id);
      }
    }

    await tx.done;
    return batch;
  }

  async getStats(): Promise<{
    pending: number;
    syncing: number;
    completed: number;
    failed: number;
    conflict: number;
    total: number;
  }> {
    const db = await this.ensureDb();

    const [pending, syncing, completed, failed, conflict, total] =
      await Promise.all([
        db?.countFromIndex("actions", "by-status", "pending"),
        db?.countFromIndex("actions", "by-status", "syncing"),
        db?.countFromIndex("actions", "by-status", "completed"),
        db?.countFromIndex("actions", "by-status", "failed"),
        db?.countFromIndex("actions", "by-status", "conflict"),
        db?.count("actions"),
      ]);

    return { pending, syncing, completed, failed, conflict, total };
  }
}

export const offlineQueue = new OfflineQueue();

export async function initOfflineQueue(): Promise<void> {
  await offlineQueue?.init();
}
