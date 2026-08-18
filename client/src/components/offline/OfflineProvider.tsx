// @ts-nocheck
import { logger } from "@/lib/logger";
import { useEffect, useState, useCallback, ReactNode } from "react";
import {
  initOfflineSystem,
  syncManager,
  offlineQueue,
  offlineCache,
  SyncStatus,
  SyncProgress,
} from "@/lib/offline";
import { toast } from "@/hooks/use-toast";
import { OfflineContext, OfflineContextValue } from "@/contexts/OfflineContext";

export type { OfflineContextValue } from "@/contexts/OfflineContext";
export {
  useOfflineContext,
  useOffline,
  useIsOnline,
  useIsOffline,
  useSyncStatus,
  usePendingChanges,
  useConnectionQuality,
} from "@/contexts/OfflineContext";

interface OfflineProviderProps {
  children: ReactNode;
  showToasts?: boolean;
  autoSync?: boolean;
}

export function OfflineProvider({
  children,
  showToasts = true,
  autoSync = true,
}: OfflineProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<
    "excellent" | "good" | "slow" | "offline"
  >(navigator.onLine ? "good" : "offline");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    current: null,
    startedAt: null,
    estimatedTimeRemaining: null,
  });
  const [pendingActions, setPendingActions] = useState(0);
  const [failedActions, setFailedActions] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await initOfflineSystem();
        setIsInitialized(true);
        await loadStats();
      } catch (error) {
        logger.info(
          "[OfflineProvider] Offline features unavailable (IndexedDB not accessible in this environment):",
          error,
        );
      }
    };
    init();
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const stats = await offlineQueue.getStats();
      setPendingActions(stats.pending + stats.syncing);
      setFailedActions(stats.failed);
      setConflictCount(stats.conflict);
    } catch (error) {
      logger.info("[OfflineProvider] Failed to load offline stats:", error);
    }
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    const handleOnline = async () => {
      setIsOnline(true);
      setIsReconnecting(true);
      setConnectionQuality("good");

      if (showToasts) {
        toast({
          title: "You're back online",
          description: "Syncing your changes...",
        });
      }

      if (autoSync) {
        await syncManager.sync();
      }

      setIsReconnecting(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setConnectionQuality("offline");

      if (showToasts) {
        toast({
          title: "You're offline",
          description:
            "Your changes will be saved locally and synced when you reconnect.",
          variant: "warning",
        });
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const connection = (navigator as Record<string, unknown>).connection;
    if (connection) {
      const handleConnectionChange = () => {
        const effectiveType = connection.effectiveType;
        if (effectiveType === "4g") {
          setConnectionQuality("excellent");
        } else if (effectiveType === "3g") {
          setConnectionQuality("good");
        } else {
          setConnectionQuality("slow");
        }
      };
      connection.addEventListener("change", handleConnectionChange);
      handleConnectionChange();
    }

    const unsubStatusChange = syncManager.on("status-change", (event) => {
      if (event.status) {
        setSyncStatus(event.status);
        setIsSyncing(event.status === "syncing");
      }
    });

    const unsubProgress = syncManager.on("progress-update", (event) => {
      if (event.progress) {
        setSyncProgress(event.progress);
      }
    });

    const unsubComplete = syncManager.on("sync-complete", () => {
      setLastSyncAt(Date.now());
      loadStats();
      if (showToasts) {
        toast({
          title: "Sync complete",
          description: "All your changes have been saved.",
        });
      }
    });

    const unsubError = syncManager.on("sync-error", (event) => {
      loadStats();
      if (showToasts && event.error) {
        toast({
          title: "Sync failed",
          description: event.error.message,
          variant: "destructive",
        });
      }
    });

    const unsubQueueChange = offlineQueue.on("action-added", loadStats);
    const unsubQueueRemove = offlineQueue.on("action-removed", loadStats);
    const unsubQueueUpdate = offlineQueue.on("action-updated", loadStats);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubStatusChange();
      unsubProgress();
      unsubComplete();
      unsubError();
      unsubQueueChange();
      unsubQueueRemove();
      unsubQueueUpdate();
    };
  }, [isInitialized, showToasts, autoSync, loadStats]);

  const sync = useCallback(async () => {
    await syncManager.sync();
  }, []);

  const retryFailed = useCallback(async () => {
    await syncManager.retryFailed();
  }, []);

  const pauseSync = useCallback(() => {
    syncManager.pause();
  }, []);

  const resumeSync = useCallback(() => {
    syncManager.resume();
  }, []);

  const clearQueue = useCallback(async () => {
    await offlineQueue.clearAll();
    await loadStats();
  }, [loadStats]);

  const cacheData = useCallback(
    async <T,>(
      key: string,
      data: T,
      category:
        | "analytics"
        | "dashboard"
        | "ui"
        | "user"
        | "general" = "general",
    ) => {
      await offlineCache.set(key, data, { category });
    },
    [],
  );

  const getCachedData = useCallback(
    async <T,>(key: string): Promise<T | null> => {
      return offlineCache.get<T>(key);
    },
    [],
  );

  const value: OfflineContextValue = {
    isOnline,
    isOffline: !isOnline,
    isReconnecting,
    isSyncing,
    connectionQuality,
    syncStatus,
    syncProgress,
    pendingActions,
    failedActions,
    conflictCount,
    lastSyncAt,
    isInitialized,
    sync,
    retryFailed,
    pauseSync,
    resumeSync,
    clearQueue,
    cacheData,
    getCachedData,
  };

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
}

export default OfflineProvider;
