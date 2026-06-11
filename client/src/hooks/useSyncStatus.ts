import { logger } from "../lib/logger";
import { useState, useEffect, useCallback } from "react";
import {
  syncManager,
  offlineQueue,
  SyncStatus,
  SyncProgress,
  SyncResult,
} from "@/lib/offline";

export interface SyncStatusState {
  status: SyncStatus;
  progress: SyncProgress;
  lastSyncAt: number | null;
  lastSyncResult: SyncResult | null;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  isSyncing: boolean;
  isPaused: boolean;
  hasError: boolean;
  hasConflicts: boolean;
  estimatedTimeRemaining: number | null;
}

export interface UseSyncStatusReturn extends SyncStatusState {
  sync: () => Promise<SyncResult>;
  pause: () => void;
  resume: () => void;
  retryFailed: () => Promise<void>;
  forceSyncAction: (actionId: string) => Promise<void>;
  clearCompleted: () => Promise<number>;
  refresh: () => Promise<void>;
}

export function useSyncStatus(): UseSyncStatusReturn {
  const [state, setState] = useState<SyncStatusState>({
    status: "idle",
    progress: {
      total: 0,
      completed: 0,
      failed: 0,
      current: null,
      startedAt: null,
      estimatedTimeRemaining: null,
    },
    lastSyncAt: null,
    lastSyncResult: null,
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    isSyncing: false,
    isPaused: false,
    hasError: false,
    hasConflicts: false,
    estimatedTimeRemaining: null,
  });

  const _loadStats = useCallback(async () => {
    try {
      const _stats = await offlineQueue?.getStats();
      setState((prev) => ({
        ...prev,
        pendingCount: stats?.pending + stats?.syncing,
        failedCount: stats?.failed,
        conflictCount: stats?.conflict,
        hasError: stats?.failed > 0,
        hasConflicts: stats?.conflict > 0,
      }));
    } catch (error) {
      logger?.error("[useSyncStatus] Failed to load stats:", error);
    }
  }, []);

  useEffect(() => {
    loadStats();

    const _unsubStatusChange = syncManager?.on("status-change", (event) => {
      setState((prev) => ({
        ...prev,
        status: event?.status || prev?.status,
        isSyncing: event?.status === "syncing",
        isPaused: event?.status === "paused",
        hasError: event?.status === "error",
      }));
    });

    const _unsubProgress = syncManager?.on("progress-update", (event) => {
      if (event?.progress) {
        setState((prev) => ({
          ...prev,
          progress: event?.progress!,
          estimatedTimeRemaining: event?.progress!.estimatedTimeRemaining,
        }));
      }
    });

    const _unsubComplete = syncManager?.on("sync-complete", (event) => {
      setState((prev) => ({
        ...prev,
        lastSyncAt: Date?.now(),
        lastSyncResult: event?.result || null,
        isSyncing: false,
      }));
      loadStats();
    });

    const _unsubError = syncManager?.on("sync-error", () => {
      setState((prev) => ({
        ...prev,
        hasError: true,
        isSyncing: false,
      }));
      loadStats();
    });

    const _unsubQueueChange = offlineQueue?.on("action-added", loadStats);
    const _unsubQueueRemove = offlineQueue?.on("action-removed", loadStats);
    const _unsubQueueUpdate = offlineQueue?.on("action-updated", loadStats);

    return () => {
      unsubStatusChange();
      unsubProgress();
      unsubComplete();
      unsubError();
      unsubQueueChange();
      unsubQueueRemove();
      unsubQueueUpdate();
    };
  }, [loadStats]);

  const _sync = useCallback(async (): Promise<SyncResult> => {
    return syncManager?.sync();
  }, []);

  const _pause = useCallback((): void => {
    syncManager?.pause();
  }, []);

  const _resume = useCallback((): void => {
    syncManager?.resume();
  }, []);

  const _retryFailed = useCallback(async (): Promise<void> => {
    await syncManager?.retryFailed();
  }, []);

  const _forceSyncAction = useCallback(
    async (actionId: string): Promise<void> => {
      await syncManager?.forceSyncAction(actionId);
    },
    [],
  );

  const _clearCompleted = useCallback(async (): Promise<number> => {
    return offlineQueue?.clearCompleted();
  }, []);

  const _refresh = useCallback(async (): Promise<void> => {
    await loadStats();
  }, [loadStats]);

  return {
    ...state,
    sync,
    pause,
    resume,
    retryFailed,
    forceSyncAction,
    clearCompleted,
    refresh,
  };
}

export default useSyncStatus;
