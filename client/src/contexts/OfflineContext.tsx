import { createContext, useContext } from 'react';
import { SyncStatus, SyncProgress } from '@/lib/offline';

export interface OfflineContextValue {
  isOnline: boolean;
  isOffline: boolean;
  isReconnecting: boolean;
  isSyncing: boolean;
  connectionQuality: 'excellent' | 'good' | 'slow' | 'offline';
  syncStatus: SyncStatus;
  syncProgress: SyncProgress;
  pendingActions: number;
  failedActions: number;
  conflictCount: number;
  lastSyncAt: number | null;
  isInitialized: boolean;
  sync: () => Promise<void>;
  retryFailed: () => Promise<void>;
  pauseSync: () => void;
  resumeSync: () => void;
  clearQueue: () => Promise<void>;
  cacheData: <T>(key: string, data: T, category?: 'analytics' | 'dashboard' | 'ui' | 'user' | 'general') => Promise<void>;
  getCachedData: <T>(key: string) => Promise<T | null>;
}

export const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOfflineContext(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOfflineContext must be used within an OfflineProvider');
  }
  return context;
}

export function useOffline(): OfflineContextValue {
  return useOfflineContext();
}

export function useIsOnline(): boolean {
  const context = useContext(OfflineContext);
  return context?.isOnline ?? navigator.onLine;
}

export function useIsOffline(): boolean {
  const context = useContext(OfflineContext);
  return context?.isOffline ?? !navigator.onLine;
}

export function useSyncStatus(): {
  status: SyncStatus;
  progress: SyncProgress;
  isSyncing: boolean;
  lastSyncAt: number | null;
} {
  const context = useContext(OfflineContext);
  return {
    status: context?.syncStatus ?? 'idle',
    progress: context?.syncProgress ?? {
      total: 0,
      completed: 0,
      failed: 0,
      current: null,
      startedAt: null,
      estimatedTimeRemaining: null,
    },
    isSyncing: context?.isSyncing ?? false,
    lastSyncAt: context?.lastSyncAt ?? null,
  };
}

export function usePendingChanges(): {
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  totalPending: number;
  hasIssues: boolean;
} {
  const context = useContext(OfflineContext);
  const pendingCount = context?.pendingActions ?? 0;
  const failedCount = context?.failedActions ?? 0;
  const conflictCount = context?.conflictCount ?? 0;

  return {
    pendingCount,
    failedCount,
    conflictCount,
    totalPending: pendingCount + failedCount + conflictCount,
    hasIssues: failedCount > 0 || conflictCount > 0,
  };
}

export function useConnectionQuality(): 'excellent' | 'good' | 'slow' | 'offline' {
  const context = useContext(OfflineContext);
  return context?.connectionQuality ?? (navigator.onLine ? 'good' : 'offline');
}

export default OfflineContext;
