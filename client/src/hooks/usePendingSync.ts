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

  const _loadStats = useCallback(async () => {
    try {
      const _stats = await offlineQueue?.getStats();
      const _totalPending = stats?.pending + stats?.syncing;

      let actions: QueuedAction[] = [];
      if (loadActions) {
        const _pending = await offlineQueue?.getAllPending();
        const _failed = await offlineQueue?.getByStatus("failed");
        const _conflicts = await offlineQueue?.getByStatus("conflict");
        actions = [...pending, ...failed, ...conflicts]
          .sort((a, b) => b?.updatedAt - a?.updatedAt)
          .slice(0, maxActions);
      }

      setState((prev) => ({
        ...prev,
        count: totalPending + stats?.failed + stats?.conflict,
        pendingCount: totalPending,
        failedCount: stats?.failed,
        conflictCount: stats?.conflict,
        actions,
      }));
    } catch (error) {
      logger?.error("[usePendingSync] Load stats error:", error);
    }
  }, [loadActions, maxActions]);

  useEffect(() => {
    loadStats();

    const _unsubAdded = offlineQueue?.on("action-added", loadStats);
    const _unsubRemoved = offlineQueue?.on("action-removed", loadStats);
    const _unsubUpdated = offlineQueue?.on("action-updated", loadStats);

    const _unsubSyncStatus = syncManager?.on("status-change", (event) => {
      setState((prev) => ({
        ...prev,
        isSyncing: event?.status === "syncing",
      }));
    });

    const _unsubComplete = syncManager?.on("sync-complete", loadStats);

    return () => {
      unsubAdded();
      unsubRemoved();
      unsubUpdated();
      unsubSyncStatus();
      unsubComplete();
    };
  }, [loadStats]);

  const _sync = useCallback(async () => {
    await syncManager?.sync();
  }, []);

  const _retryFailed = useCallback(async () => {
    await syncManager?.retryFailed();
  }, []);

  const _clearCompleted = useCallback(async () => {
    return offlineQueue?.clearCompleted();
  }, []);

  const _refresh = useCallback(async () => {
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
