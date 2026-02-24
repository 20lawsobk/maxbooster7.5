import { logger } from '../lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { syncManager, offlineQueue, SyncStatus, SyncProgress } from '@/lib/offline';

export interface OfflineStatusState {
  isOnline: boolean;
  isOffline: boolean;
  isReconnecting: boolean;
  status: 'online' | 'offline' | 'slow' | 'reconnecting';
  syncStatus: SyncStatus;
  syncProgress: SyncProgress;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  lastSyncAt: number | null;
}

export function useOfflineStatus(): OfflineStatusState & {
  refresh: () => Promise<void>;
  forcSync: () => Promise<void>;
} {
  const [state, setState] = useState<OfflineStatusState>({
    isOnline: navigator.onLine,
    isOffline: !navigator.onLine,
    isReconnecting: false,
    status: navigator.onLine ? 'online' : 'offline',
    syncStatus: 'idle',
    syncProgress: {
      total: 0,
      completed: 0,
      failed: 0,
      current: null,
      startedAt: null,
      estimatedTimeRemaining: null,
    },
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    lastSyncAt: null,
  });

  const loadStats = useCallback(async () => {
    try {
      const stats = await offlineQueue.getStats();
      setState(prev => ({
        ...prev,
        pendingCount: stats.pending + stats.syncing,
        failedCount: stats.failed,
        conflictCount: stats.conflict,
      }));
    } catch (error) {
      logger.error('[useOfflineStatus] Failed to load stats:', error);
    }
  }, []);

  useEffect(() => {
    loadStats();

    const handleOnline = () => {
      setState(prev => ({
        ...prev,
        isOnline: true,
        isOffline: false,
        status: 'online',
        isReconnecting: false,
      }));
    };

    const handleOffline = () => {
      setState(prev => ({
        ...prev,
        isOnline: false,
        isOffline: true,
        status: 'offline',
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubStatusChange = syncManager.on('status-change', (event) => {
      setState(prev => ({
        ...prev,
        syncStatus: event.status || prev.syncStatus,
        isReconnecting: event.status === 'syncing',
      }));
    });

    const unsubProgress = syncManager.on('progress-update', (event) => {
      if (event.progress) {
        setState(prev => ({
          ...prev,
          syncProgress: event.progress!,
        }));
      }
    });

    const unsubComplete = syncManager.on('sync-complete', () => {
      setState(prev => ({
        ...prev,
        lastSyncAt: Date.now(),
      }));
      loadStats();
    });

    const unsubQueueChange = offlineQueue.on('action-added', loadStats);
    const unsubQueueRemove = offlineQueue.on('action-removed', loadStats);
    const unsubQueueUpdate = offlineQueue.on('action-updated', loadStats);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubStatusChange();
      unsubProgress();
      unsubComplete();
      unsubQueueChange();
      unsubQueueRemove();
      unsubQueueUpdate();
    };
  }, [loadStats]);

  const refresh = useCallback(async () => {
    await loadStats();
  }, [loadStats]);

  const forcSync = useCallback(async () => {
    await syncManager.sync();
  }, []);

  return {
    ...state,
    refresh,
    forcSync,
  };
}

export default useOfflineStatus;
