import { logger } from "../lib/logger";
import { useState, useEffect, useCallback } from "react";
import { offlineQueue, syncManager, QueuedAction } from "@/lib/offline";

export interface PendingSyncState {
  count: number;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  isSyncing: boolean;
  actions: QueuedAction[];
}

export function usePendingSync(options?: {
  loadActions?: boolean;
  maxActions?: number;
}): PendingSyncState & {
  sync: () => Promise<void>;
  retryFailed: () => Promise<void>;
  clearCompleted: () => Promise<number>;
  refresh: () => Promise<void>;
} {
  const { loadActions = false, maxActions = 50 } = options || {};

  const [state, setState] = useState<PendingSyncState>({
    count: 0,
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    isSyncing: false,
    actions: [],
  });

  const loadStats = useCallback(async () => {
    try {
      const stats = await offlineQueue?.getStats();
      const totalPending = stats?.pending + stats?.syncing;

      let actions: QueuedAction[] = [];
      if (loadActions) {
        const pending = await offlineQueue?.getAllPending();
        const failed = await offlineQueue?.getByStatus("failed");
        const conflicts = await offlineQueue?.getByStatus("conflict");
        actions = [...pending, ...failed, ...conflicts]
          .sort((a, b) => b?.updatedAt - a?.updatedAt)
          .slice(0, maxActions);
      }

      setState((prev) => ({
        ...prev,
        count: totalPending + stats?.failed + stats?.conflict,
        pendingCount: totalPending,
        failedCount: stats.failed,
        conflictCount: stats.conflict,
        actions,
      }));
    } catch (error) {
      logger.error("[usePendingSync] Load stats error:", error);
    }
  }, [loadActions, maxActions]);

  useEffect(() => {
    loadStats();

    const unsubAdded = offlineQueue?.on("action-added", loadStats);
    const unsubRemoved = offlineQueue?.on("action-removed", loadStats);
    const unsubUpdated = offlineQueue?.on("action-updated", loadStats);

    const unsubSyncStatus = syncManager?.on("status-change", (event) => {
      setState((prev) => ({
        ...prev,
        isSyncing: event.status === "syncing",
      }));
    });

    const unsubComplete = syncManager?.on("sync-complete", loadStats);

    return () => {
      unsubAdded();
      unsubRemoved();
      unsubUpdated();
      unsubSyncStatus();
      unsubComplete();
    };
  }, [loadStats]);

  const sync = useCallback(async () => {
    await syncManager?.sync();
  }, []);

  const retryFailed = useCallback(async () => {
    await syncManager?.retryFailed();
  }, []);

  const clearCompleted = useCallback(async () => {
    return offlineQueue?.clearCompleted();
  }, []);

  const refresh = useCallback(async () => {
    await loadStats();
  }, [loadStats]);

  return {
    ...state,
    sync,
    retryFailed,
    clearCompleted,
    refresh,
  };
}

export default usePendingSync;
