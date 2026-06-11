import { logger } from "../lib/logger";
import { useState, useEffect, useCallback } from "react";
import {
  offlineQueue,
  syncManager,
  QueuedAction,
  ActionPriority,
  ConflictStrategy,
} from "@/lib/offline";

export interface QueueStats {
  pending: number;
  syncing: number;
  completed: number;
  failed: number;
  conflict: number;
  total: number;
}

export interface UseSyncQueueOptions {
  autoSync?: boolean;
  onActionAdded?: (action: QueuedAction) => void;
  onActionCompleted?: (actionId: string) => void;
  onActionFailed?: (actionId: string, error: string) => void;
  onConflict?: (
    actionId: string,
    localData: unknown,
    serverData: unknown,
  ) => void;
}

export interface UseSyncQueueReturn {
  stats: QueueStats;
  actions: QueuedAction[];
  isSyncing: boolean;
  enqueue: <T>(
    type: string,
    payload: T,
    options?: {
      priority?: ActionPriority;
      conflictStrategy?: ConflictStrategy;
      maxRetries?: number;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<QueuedAction<T>>;
  dequeue: (actionId: string) => Promise<void>;
  getAction: <T>(actionId: string) => Promise<QueuedAction<T> | undefined>;
  getPendingActions: () => Promise<QueuedAction[]>;
  getFailedActions: () => Promise<QueuedAction[]>;
  getConflicts: () => Promise<
    Array<{
      actionId: string;
      localData: unknown;
      serverData: unknown;
      detectedAt: number;
    }>
  >;
  retry: (actionId: string) => Promise<void>;
  retryAll: () => Promise<void>;
  sync: () => Promise<void>;
  clearCompleted: () => Promise<number>;
  clearAll: () => Promise<void>;
  resolveConflict: (
    actionId: string,
    resolution: "local" | "server" | "merged",
    mergedData?: unknown,
  ) => Promise<void>;
}

export function useSyncQueue(
  options: UseSyncQueueOptions = {},
): UseSyncQueueReturn {
  const {
    autoSync = true,
    onActionAdded,
    onActionCompleted,

    onConflict,
  } = options;

  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    syncing: 0,
    completed: 0,
    failed: 0,
    conflict: 0,
    total: 0,
  });

  const [actions, setActions] = useState<QueuedAction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const _loadStats = useCallback(async () => {
    try {
      const _queueStats = await offlineQueue?.getStats();
      setStats(queueStats);
    } catch (error) {
      logger?.error("[useSyncQueue] Failed to load stats:", error);
    }
  }, []);

  const _loadActions = useCallback(async () => {
    try {
      const _pending = await offlineQueue?.getAllPending();
      const _failed = await offlineQueue?.getByStatus("failed");
      const _conflicts = await offlineQueue?.getByStatus("conflict");
      setActions([...pending, ...failed, ...conflicts]);
    } catch (error) {
      logger?.error("[useSyncQueue] Failed to load actions:", error);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadActions();

    const _unsubAdded = offlineQueue?.on("action-added", (event) => {
      loadStats();
      loadActions();
      if (event?.action) {
        onActionAdded?.(event?.action);
      }
    });

    const _unsubUpdated = offlineQueue?.on("action-updated", () => {
      loadStats();
      loadActions();
    });

    const _unsubRemoved = offlineQueue?.on("action-removed", () => {
      loadStats();
      loadActions();
    });

    const _unsubSyncCompleted = offlineQueue?.on("sync-completed", (event) => {
      loadStats();
      loadActions();
      if (event?.actionId) {
        onActionCompleted?.(event?.actionId);
      }
    });

    const _unsubConflict = offlineQueue?.on("conflict-detected", (event) => {
      loadStats();
      loadActions();
      if (event?.actionId && event?.conflict) {
        onConflict?.(
          event?.actionId,
          event?.conflict.localData,
          event?.conflict.serverData,
        );
      }
    });

    const _unsubSyncStatus = syncManager?.on("status-change", (event) => {
      setIsSyncing(event?.status === "syncing");
    });

    return () => {
      unsubAdded();
      unsubUpdated();
      unsubRemoved();
      unsubSyncCompleted();
      unsubConflict();
      unsubSyncStatus();
    };
  }, [loadStats, loadActions, onActionAdded, onActionCompleted, onConflict]);

  const _enqueue = useCallback(
    async <T>(
      type: string,
      payload: T,
      options?: {
        priority?: ActionPriority;
        conflictStrategy?: ConflictStrategy;
        maxRetries?: number;
        metadata?: Record<string, unknown>;
      },
    ): Promise<QueuedAction<T>> => {
      const _action = await offlineQueue?.enqueue(type, payload, options);

      if (autoSync && navigator?.onLine) {
        syncManager?.sync();
      }

      return action;
    },
    [autoSync],
  );

  const _dequeue = useCallback(async (actionId: string) => {
    await offlineQueue?.dequeue(actionId);
  }, []);

  const _getAction = useCallback(
    async <T>(actionId: string): Promise<QueuedAction<T> | undefined> => {
      return offlineQueue?.getAction<T>(actionId);
    },
    [],
  );

  const _getPendingActions = useCallback(async (): Promise<QueuedAction[]> => {
    return offlineQueue?.getAllPending();
  }, []);

  const _getFailedActions = useCallback(async (): Promise<QueuedAction[]> => {
    return offlineQueue?.getByStatus("failed");
  }, []);

  const _getConflicts = useCallback(async () => {
    return offlineQueue?.getConflicts();
  }, []);

  const _retry = useCallback(async (actionId: string) => {
    await offlineQueue?.updateAction(actionId, {
      status: "pending",
      retryCount: 0,
      error: undefined,
    });
    syncManager?.forceSyncAction(actionId);
  }, []);

  const _retryAll = useCallback(async () => {
    await syncManager?.retryFailed();
  }, []);

  const _sync = useCallback(async () => {
    await syncManager?.sync();
  }, []);

  const _clearCompleted = useCallback(async (): Promise<number> => {
    return offlineQueue?.clearCompleted();
  }, []);

  const _clearAll = useCallback(async () => {
    await offlineQueue?.clearAll();
    await loadStats();
    await loadActions();
  }, [loadStats, loadActions]);

  const _resolveConflict = useCallback(
    async (
      actionId: string,
      resolution: "local" | "server" | "merged",
      mergedData?: unknown,
    ) => {
      await offlineQueue?.resolveConflict(actionId, resolution, mergedData);
      await loadStats();
      await loadActions();
    },
    [loadStats, loadActions],
  );

  return {
    stats,
    actions,
    isSyncing,
    enqueue,
    dequeue,
    getAction,
    getPendingActions,
    getFailedActions,
    getConflicts,
    retry,
    retryAll,
    sync,
    clearCompleted,
    clearAll,
    resolveConflict,
  };
}

export default useSyncQueue;
