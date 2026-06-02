import { logger } from "../lib/logger";
import { useState, useEffect, useCallback } from "react";
import {
  offlineQueue,
  syncManager,
  QueuedAction,
  ActionPriority,
  ConflictStrategy,
  ActionStatus,
} from "@/lib/offline";

export interface UseOfflineQueueReturn {
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  totalCount: number;
  isSyncing: boolean;
  pendingActions: QueuedAction[];
  failedActions: QueuedAction[];
  conflictActions: QueuedAction[];
  enqueue: <T>(
    type: string,
    payload: T,
    options?: EnqueueOptions,
  ) => Promise<QueuedAction<T>>;
  dequeue: (id: string) => Promise<void>;
  updateAction: <T>(
    id: string,
    updates: Partial<QueuedAction<T>>,
  ) => Promise<QueuedAction<T> | null>;
  getAction: <T>(id: string) => Promise<QueuedAction<T> | undefined>;
  retryAction: (id: string) => Promise<void>;
  retryAllFailed: () => Promise<void>;
  clearCompleted: () => Promise<number>;
  clearAll: () => Promise<void>;
  sync: () => Promise<void>;
  pauseSync: () => void;
  resumeSync: () => void;
  getStats: () => Promise<QueueStats>;
  refresh: () => Promise<void>;
}

export interface EnqueueOptions {
  priority?: ActionPriority;
  conflictStrategy?: ConflictStrategy;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
  dependencies?: string[];
}

export interface QueueStats {
  pending: number;
  syncing: number;
  completed: number;
  failed: number;
  conflict: number;
  total: number;
}

export function useOfflineQueue(): UseOfflineQueueReturn {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingActions, setPendingActions] = useState<QueuedAction[]>([]);
  const [failedActions, setFailedActions] = useState<QueuedAction[]>([]);
  const [conflictActions, setConflictActions] = useState<QueuedAction[]>([]);

  const loadStats = useCallback(async () => {
    try {
      const stats = await offlineQueue.getStats();
      setPendingCount(stats.pending);
      setFailedCount(stats.failed);
      setConflictCount(stats.conflict);
      setTotalCount(stats.total);
    } catch (error) {
      logger.error("[useOfflineQueue] Failed to load stats:", error);
    }
  }, []);

  const loadActions = useCallback(async () => {
    try {
      const [pending, failed, conflict] = await Promise.all([
        offlineQueue.getAllPending(),
        offlineQueue.getByStatus("failed"),
        offlineQueue.getByStatus("conflict"),
      ]);
      setPendingActions(pending);
      setFailedActions(failed);
      setConflictActions(conflict);
    } catch (error) {
      logger.error("[useOfflineQueue] Failed to load actions:", error);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadStats(), loadActions()]);
  }, [loadStats, loadActions]);

  useEffect(() => {
    refresh();

    const unsubAdded = offlineQueue.on("action-added", () => {
      refresh();
    });

    const unsubUpdated = offlineQueue.on("action-updated", () => {
      refresh();
    });

    const unsubRemoved = offlineQueue.on("action-removed", () => {
      refresh();
    });

    const unsubSyncStatus = syncManager.on("status-change", (event) => {
      setIsSyncing(event.status === "syncing");
    });

    const unsubSyncComplete = syncManager.on("sync-complete", () => {
      refresh();
    });

    return () => {
      unsubAdded();
      unsubUpdated();
      unsubRemoved();
      unsubSyncStatus();
      unsubSyncComplete();
    };
  }, [refresh]);

  const enqueue = useCallback(
    async <T>(
      type: string,
      payload: T,
      options?: EnqueueOptions,
    ): Promise<QueuedAction<T>> => {
      const action = await offlineQueue.enqueue(type, payload, options);
      return action;
    },
    [],
  );

  const dequeue = useCallback(async (id: string): Promise<void> => {
    await offlineQueue.dequeue(id);
  }, []);

  const updateAction = useCallback(
    async <T>(
      id: string,
      updates: Partial<QueuedAction<T>>,
    ): Promise<QueuedAction<T> | null> => {
      return offlineQueue.updateAction(id, updates);
    },
    [],
  );

  const getAction = useCallback(
    async <T>(id: string): Promise<QueuedAction<T> | undefined> => {
      return offlineQueue.getAction<T>(id);
    },
    [],
  );

  const retryAction = useCallback(async (id: string): Promise<void> => {
    await offlineQueue.updateAction(id, {
      status: "pending" as ActionStatus,
      retryCount: 0,
      error: undefined,
    });
    await syncManager.forceSyncAction(id);
  }, []);

  const retryAllFailed = useCallback(async (): Promise<void> => {
    await syncManager.retryFailed();
  }, []);

  const clearCompleted = useCallback(async (): Promise<number> => {
    return offlineQueue.clearCompleted();
  }, []);

  const clearAll = useCallback(async (): Promise<void> => {
    await offlineQueue.clearAll();
  }, []);

  const sync = useCallback(async (): Promise<void> => {
    await syncManager.sync();
  }, []);

  const pauseSync = useCallback((): void => {
    syncManager.pause();
  }, []);

  const resumeSync = useCallback((): void => {
    syncManager.resume();
  }, []);

  const getStats = useCallback(async (): Promise<QueueStats> => {
    return offlineQueue.getStats();
  }, []);

  return {
    pendingCount,
    failedCount,
    conflictCount,
    totalCount,
    isSyncing,
    pendingActions,
    failedActions,
    conflictActions,
    enqueue,
    dequeue,
    updateAction,
    getAction,
    retryAction,
    retryAllFailed,
    clearCompleted,
    clearAll,
    sync,
    pauseSync,
    resumeSync,
    getStats,
    refresh,
  };
}

export default useOfflineQueue;
