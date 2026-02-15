import { useState, useEffect, useCallback } from 'react';
import { syncManager, offlineQueue, offlineCache, SyncStatus, SyncProgress, QueuedAction } from '@/lib/offline';

export interface OfflineState {
  isOnline: boolean;
  isOffline: boolean;
  isReconnecting: boolean;
  isSyncing: boolean;
  connectionQuality: 'excellent' | 'good' | 'slow' | 'offline';
  syncStatus: SyncStatus;
  syncProgress: SyncProgress;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  lastSyncAt: number | null;
}

export interface UseOfflineReturn extends OfflineState {
  sync: () => Promise<void>;
  retryFailed: () => Promise<void>;
  queueAction: <T>(type: string, payload: T, options?: {
    priority?: 'critical' | 'high' | 'normal' | 'low';
    conflictStrategy?: 'local-wins' | 'server-wins' | 'merge' | 'manual';
  }) => Promise<QueuedAction<T>>;
  getConflicts: () => Promise<Array<{ actionId: string; localData: unknown; serverData: unknown }>>;
  resolveConflict: (actionId: string, resolution: 'local' | 'server' | 'merged', mergedData?: unknown) => Promise<void>;
  cacheData: <T>(key: string, data: T, category?: 'analytics' | 'dashboard' | 'ui' | 'user' | 'general') => Promise<void>;
  getCachedData: <T>(key: string) => Promise<T | null>;
  invalidateCache: (category?: 'analytics' | 'dashboard' | 'ui' | 'user' | 'general') => Promise<void>;
}

export function useOffline(): UseOfflineReturn {
  const [state, setState] = useState<OfflineState>({
    isOnline: navigator.onLine,
    isOffline: !navigator.onLine,
    isReconnecting: false,
    isSyncing: false,
    connectionQuality: navigator.onLine ? 'good' : 'offline',
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
      console.error('[useOffline] Failed to load stats:', error);
    }
  }, []);

  useEffect(() => {
    loadStats();

    const handleOnline = () => {
      setState(prev => ({
        ...prev,
        isOnline: true,
        isOffline: false,
        connectionQuality: 'good',
        isReconnecting: true,
      }));

      syncManager.sync().finally(() => {
        setState(prev => ({ ...prev, isReconnecting: false }));
        loadStats();
      });
    };

    const handleOffline = () => {
      setState(prev => ({
        ...prev,
        isOnline: false,
        isOffline: true,
        connectionQuality: 'offline',
        isReconnecting: false,
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = (navigator as any).connection;
    if (connection) {
      const handleConnectionChange = () => {
        const effectiveType = connection.effectiveType;
        let quality: 'excellent' | 'good' | 'slow' | 'offline';
        if (!navigator.onLine) {
          quality = 'offline';
        } else if (effectiveType === '4g') {
          quality = 'excellent';
        } else if (effectiveType === '3g') {
          quality = 'good';
        } else {
          quality = 'slow';
        }
        setState(prev => ({ ...prev, connectionQuality: quality }));
      };
      connection.addEventListener('change', handleConnectionChange);
    }

    const unsubStatusChange = syncManager.on('status-change', (event) => {
      if (event.status) {
        setState(prev => ({
          ...prev,
          syncStatus: event.status!,
          isSyncing: event.status === 'syncing',
        }));
      }
    });

    const unsubProgress = syncManager.on('progress-update', (event) => {
      if (event.progress) {
        setState(prev => ({ ...prev, syncProgress: event.progress! }));
      }
    });

    const unsubComplete = syncManager.on('sync-complete', () => {
      setState(prev => ({ ...prev, lastSyncAt: Date.now() }));
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

  const sync = useCallback(async () => {
    await syncManager.sync();
  }, []);

  const retryFailed = useCallback(async () => {
    await syncManager.retryFailed();
  }, []);

  const queueAction = useCallback(async <T,>(
    type: string,
    payload: T,
    options?: {
      priority?: 'critical' | 'high' | 'normal' | 'low';
      conflictStrategy?: 'local-wins' | 'server-wins' | 'merge' | 'manual';
    }
  ): Promise<QueuedAction<T>> => {
    return offlineQueue.enqueue(type, payload, options);
  }, []);

  const getConflicts = useCallback(async () => {
    return offlineQueue.getConflicts();
  }, []);

  const resolveConflict = useCallback(async (
    actionId: string,
    resolution: 'local' | 'server' | 'merged',
    mergedData?: unknown
  ) => {
    await offlineQueue.resolveConflict(actionId, resolution, mergedData);
    await loadStats();
  }, [loadStats]);

  const cacheData = useCallback(async <T,>(
    key: string,
    data: T,
    category: 'analytics' | 'dashboard' | 'ui' | 'user' | 'general' = 'general'
  ) => {
    await offlineCache.set(key, data, { category });
  }, []);

  const getCachedData = useCallback(async <T,>(key: string): Promise<T | null> => {
    return offlineCache.get<T>(key);
  }, []);

  const invalidateCache = useCallback(async (
    category?: 'analytics' | 'dashboard' | 'ui' | 'user' | 'general'
  ) => {
    if (category) {
      await offlineCache.invalidateCategory(category);
    } else {
      await offlineCache.clear();
    }
  }, []);

  return {
    ...state,
    sync,
    retryFailed,
    queueAction,
    getConflicts,
    resolveConflict,
    cacheData,
    getCachedData,
    invalidateCache,
  };
}

export default useOffline;
