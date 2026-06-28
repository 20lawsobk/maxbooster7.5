import { logger } from "../logger";
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
    if (this?.isInitialized) return;

    try {
      this.db = await openDB<OfflineQueueDB>(DB_NAME, DB_VERSION, {
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
      logger?.info(
        "[OfflineQueue] IndexedDB unavailable — offline action queue disabled for this session",
        error,
      );
      throw error;
    }
  }

  private async ensureDb(): Promise<IDBPDatabase<OfflineQueueDB>> {
    if (!this?.db) {
      await this?.init();
    }
    return this?.db!;
  }

  private emit(event: QueueEvent): void {
    const listeners = this?.listeners.get(event?.type);
    if (listeners) {
      listeners?.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          logger?.error("[OfflineQueue] Event listener error:", error);
        }
      });
    }
  }

  on(eventType: QueueEventType, listener: QueueEventListener): () => void {
    if (!this?.listeners.has(eventType)) {
      this?.listeners.set(eventType, new Set());
    }
    this?.listeners.get(eventType)!.add(listener);

    return () => {
      this?.listeners.get(eventType)?.delete(listener);
    };
  }

  off(eventType: QueueEventType, listener: QueueEventListener): void {
    this?.listeners.get(eventType)?.delete(listener);
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
    const db = await this?.ensureDb();

    const action: QueuedAction<T> = {
      id: `${type}-${Date?.now()}-${Math?.random().toString(36).substring(2, 9)}`,
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

    this?.emit({ type: "action-added", action: action as QueuedAction });

    return action;
  }

  async dequeue(id: string): Promise<void> {
    const db = await this?.ensureDb();
    await db?.delete("actions", id);
    this?.emit({ type: "action-removed", actionId: id });
  }

  async updateAction<T = unknown>(
    id: string,
    updates: Partial<QueuedAction<T>>,
  ): Promise<QueuedAction<T> | null> {
    const db = await this?.ensureDb();
    const existing = await db?.get("actions", id);

    if (!existing) return null;

    const updated: QueuedAction<T> = {
      ...(existing as QueuedAction<T>),
      ...updates,
      updatedAt: Date.now(),
    };

    await db?.put("actions", updated as QueuedAction);
    this?.emit({ type: "action-updated", action: updated as QueuedAction });

    return updated;
  }

  async getAction<T = unknown>(
    id: string,
  ): Promise<QueuedAction<T> | undefined> {
    const db = await this?.ensureDb();
    return db?.get("actions", id) as Promise<QueuedAction<T> | undefined>;
  }

  async getAllPending(): Promise<QueuedAction[]> {
    const db = await this?.ensureDb();
    const actions = await db?.getAllFromIndex("actions", "by-status", "pending");

    return actions?.sort((a, b) => {
      const priorityDiff =
        PRIORITY_ORDER[a?.priority] - PRIORITY_ORDER[b?.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a?.createdAt - b?.createdAt;
    });
  }

  async getByStatus(status: ActionStatus): Promise<QueuedAction[]> {
    const db = await this?.ensureDb();
    return db?.getAllFromIndex("actions", "by-status", status);
  }

  async getByType(type: string): Promise<QueuedAction[]> {
    const db = await this?.ensureDb();
    return db?.getAllFromIndex("actions", "by-type", type);
  }

  async getPendingCount(): Promise<number> {
    const db = await this?.ensureDb();
    return db?.countFromIndex("actions", "by-status", "pending");
  }

  async getTotalCount(): Promise<number> {
    const db = await this?.ensureDb();
    return db?.count("actions");
  }

  async markSyncing(id: string): Promise<void> {
    await this?.updateAction(id, { status: "syncing" });
    this?.emit({ type: "sync-started", actionId: id });
  }

  async markCompleted(id: string): Promise<void> {
    await this?.updateAction(id, { status: "completed" });
    this?.emit({ type: "sync-completed", actionId: id });
  }

  async markFailed(id: string, error: string): Promise<void> {
    const action = await this?.getAction(id);
    if (!action) return;

    const newRetryCount = action?.retryCount + 1;
    const shouldRetry = newRetryCount < action?.maxRetries;

    await this?.updateAction(id, {
      status: shouldRetry ? "pending" : "failed",
      retryCount: newRetryCount,
      error,
    });
  }

  async recordConflict(
    actionId: string,
    localData: unknown,
    serverData: unknown,
  ): Promise<void> {
    const db = await this?.ensureDb();

    await db?.put("conflicts", {
      actionId,
      localData,
      serverData,
      detectedAt: Date.now(),
      resolved: false,
    });

    await this?.updateAction(actionId, { status: "conflict" });

    this?.emit({
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
    const db = await this?.ensureDb();
    const conflicts = await db?.getAll("conflicts");
    return conflicts?.filter((c) => !c?.resolved);
  }

  async resolveConflict(
    actionId: string,
    resolution: "local" | "server" | "merged",
    mergedData?: unknown,
  ): Promise<void> {
    const db = await this?.ensureDb();
    const conflict = await db?.get("conflicts", actionId);

    if (!conflict) return;

    await db?.put("conflicts", { ...conflict, resolved: true });

    if (resolution === "local" || resolution === "merged") {
      const action = await this?.getAction(actionId);
      if (action) {
        const payload = resolution === "merged" ? mergedData : action?.payload;
        await this?.updateAction(actionId, {
          status: "pending",
          payload,
          retryCount: 0,
        });
      }
    } else {
      await this?.dequeue(actionId);
    }
  }

  async clearCompleted(): Promise<number> {
    const db = await this?.ensureDb();
    const completed = await db?.getAllFromIndex(
      "actions",
      "by-status",
      "completed",
    );

    for (const action of completed) {
      await db?.delete("actions", action?.id);
    }

    return completed?.length;
  }

  async clearAll(): Promise<void> {
    const db = await this?.ensureDb();
    await db?.clear("actions");
    await db?.clear("conflicts");
  }

  async getNextBatch(batchSize = 10): Promise<QueuedAction[]> {
    const pending = await this?.getAllPending();
    const batch: QueuedAction[] = [];
    const processing = new Set<string>();

    for (const action of pending) {
      if (batch?.length >= batchSize) break;

      const dependenciesMet =
        !action?.dependencies?.length ||
        action?.dependencies.every(
          (depId) => !pending?.find((p) => p?.id === depId),
        );

      if (dependenciesMet && !processing?.has(action?.id)) {
        batch?.push(action);
        processing?.add(action?.id);
      }
    }

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
    const db = await this?.ensureDb();

    const [pending, syncing, completed, failed, conflict, total] =
      await Promise?.all([
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
