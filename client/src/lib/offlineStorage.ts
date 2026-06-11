import { logger } from "@/lib/logger";
export {
  offlineQueue,
  initOfflineQueue,
  syncManager,
  initSyncManager,
  draftStorage,
  initDraftStorage,
  offlineCache,
  initOfflineCache,
  initOfflineSystem,
} from "./offline";

export type {
  QueuedAction,
  ActionPriority,
  ActionStatus,
  ConflictStrategy,
  QueueEvent,
  QueueEventType,
  SyncStatus,
  SyncProgress,
  SyncResult,
  BatchSyncRequest,
  BatchSyncResponse,
  Draft,
  DraftConflict,
  CacheEntry,
  CacheCategory,
  CacheOptions,
} from "./offline";

import {
  offlineQueue,
  draftStorage,
  offlineCache,
  initOfflineSystem,
  syncManager,
} from "./offline";
import type { CacheCategory } from "./offline";

export interface OfflineStorageAPI {
  queue: {
    enqueue: typeof offlineQueue.enqueue;
    dequeue: typeof offlineQueue.dequeue;
    getAction: typeof offlineQueue.getAction;
    getAllPending: typeof offlineQueue.getAllPending;
    getByStatus: typeof offlineQueue.getByStatus;
    getPendingCount: typeof offlineQueue.getPendingCount;
    markCompleted: typeof offlineQueue.markCompleted;
    markFailed: typeof offlineQueue.markFailed;
    recordConflict: typeof offlineQueue.recordConflict;
    resolveConflict: typeof offlineQueue.resolveConflict;
    getConflicts: typeof offlineQueue.getConflicts;
    clearCompleted: typeof offlineQueue.clearCompleted;
    clearAll: typeof offlineQueue.clearAll;
    getStats: typeof offlineQueue.getStats;
    on: typeof offlineQueue.on;
    off: typeof offlineQueue.off;
  };
  drafts: {
    save: typeof draftStorage.saveDraft;
    get: typeof draftStorage.getDraft;
    getAll: typeof draftStorage.getAllDrafts;
    delete: typeof draftStorage.deleteDraft;
    hasDraft: typeof draftStorage.hasDraft;
    detectConflict: typeof draftStorage.detectConflict;
    setupAutoSave: typeof draftStorage.setupAutoSave;
    stopAutoSave: typeof draftStorage.stopAutoSave;
    recover: typeof draftStorage.recoverDraft;
    cleanupExpired: typeof draftStorage.cleanupExpired;
    clearAll: typeof draftStorage.clearAll;
    getStats: typeof draftStorage.getDraftStats;
    on: typeof draftStorage.on;
    off: typeof draftStorage.off;
  };
  cache: {
    set: typeof offlineCache.set;
    get: typeof offlineCache.get;
    getWithMetadata: typeof offlineCache.getWithMetadata;
    has: typeof offlineCache.has;
    delete: typeof offlineCache.delete;
    getByCategory: typeof offlineCache.getByCategory;
    invalidateCategory: typeof offlineCache.invalidateCategory;
    invalidateByVersion: typeof offlineCache.invalidateByVersion;
    cleanupExpired: typeof offlineCache.cleanupExpired;
    clear: typeof offlineCache.clear;
    getStats: typeof offlineCache.getStats;
    cacheAnalytics: typeof offlineCache.cacheAnalytics;
    cacheDashboard: typeof offlineCache.cacheDashboard;
    cacheUserData: typeof offlineCache.cacheUserData;
    cacheUIData: typeof offlineCache.cacheUIData;
    prefetch: typeof offlineCache.prefetch;
    on: typeof offlineCache.on;
  };
  sync: {
    sync: typeof syncManager.sync;
    pause: typeof syncManager.pause;
    resume: typeof syncManager.resume;
    retryFailed: typeof syncManager.retryFailed;
    forceSyncAction: typeof syncManager.forceSyncAction;
    getStatus: typeof syncManager.getStatus;
    getProgress: typeof syncManager.getProgress;
    isOnline: typeof syncManager.isNetworkOnline;
    getQueueStats: typeof syncManager.getQueueStats;
    on: typeof syncManager.on;
    off: typeof syncManager.off;
  };
  init: typeof initOfflineSystem;
}

export const offlineStorage: OfflineStorageAPI = {
  queue: {
    enqueue: offlineQueue.enqueue.bind(offlineQueue),
    dequeue: offlineQueue.dequeue.bind(offlineQueue),
    getAction: offlineQueue.getAction.bind(offlineQueue),
    getAllPending: offlineQueue.getAllPending.bind(offlineQueue),
    getByStatus: offlineQueue.getByStatus.bind(offlineQueue),
    getPendingCount: offlineQueue.getPendingCount.bind(offlineQueue),
    markCompleted: offlineQueue.markCompleted.bind(offlineQueue),
    markFailed: offlineQueue.markFailed.bind(offlineQueue),
    recordConflict: offlineQueue.recordConflict.bind(offlineQueue),
    resolveConflict: offlineQueue.resolveConflict.bind(offlineQueue),
    getConflicts: offlineQueue.getConflicts.bind(offlineQueue),
    clearCompleted: offlineQueue.clearCompleted.bind(offlineQueue),
    clearAll: offlineQueue.clearAll.bind(offlineQueue),
    getStats: offlineQueue.getStats.bind(offlineQueue),
    on: offlineQueue.on.bind(offlineQueue),
    off: offlineQueue.off.bind(offlineQueue),
  },
  drafts: {
    save: draftStorage.saveDraft.bind(draftStorage),
    get: draftStorage.getDraft.bind(draftStorage),
    getAll: draftStorage.getAllDrafts.bind(draftStorage),
    delete: draftStorage.deleteDraft.bind(draftStorage),
    hasDraft: draftStorage.hasDraft.bind(draftStorage),
    detectConflict: draftStorage.detectConflict.bind(draftStorage),
    setupAutoSave: draftStorage.setupAutoSave.bind(draftStorage),
    stopAutoSave: draftStorage.stopAutoSave.bind(draftStorage),
    recover: draftStorage.recoverDraft.bind(draftStorage),
    cleanupExpired: draftStorage.cleanupExpired.bind(draftStorage),
    clearAll: draftStorage.clearAll.bind(draftStorage),
    getStats: draftStorage.getDraftStats.bind(draftStorage),
    on: draftStorage.on.bind(draftStorage),
    off: draftStorage.off.bind(draftStorage),
  },
  cache: {
    set: offlineCache.set.bind(offlineCache),
    get: offlineCache.get.bind(offlineCache),
    getWithMetadata: offlineCache.getWithMetadata.bind(offlineCache),
    has: offlineCache.has.bind(offlineCache),
    delete: offlineCache.delete.bind(offlineCache),
    getByCategory: offlineCache.getByCategory.bind(offlineCache),
    invalidateCategory: offlineCache.invalidateCategory.bind(offlineCache),
    invalidateByVersion: offlineCache.invalidateByVersion.bind(offlineCache),
    cleanupExpired: offlineCache.cleanupExpired.bind(offlineCache),
    clear: offlineCache.clear.bind(offlineCache),
    getStats: offlineCache.getStats.bind(offlineCache),
    cacheAnalytics: offlineCache.cacheAnalytics.bind(offlineCache),
    cacheDashboard: offlineCache.cacheDashboard.bind(offlineCache),
    cacheUserData: offlineCache.cacheUserData.bind(offlineCache),
    cacheUIData: offlineCache.cacheUIData.bind(offlineCache),
    prefetch: offlineCache.prefetch.bind(offlineCache),
    on: offlineCache.on.bind(offlineCache),
  },
  sync: {
    sync: syncManager.sync.bind(syncManager),
    pause: syncManager.pause.bind(syncManager),
    resume: syncManager.resume.bind(syncManager),
    retryFailed: syncManager.retryFailed.bind(syncManager),
    forceSyncAction: syncManager.forceSyncAction.bind(syncManager),
    getStatus: syncManager.getStatus.bind(syncManager),
    getProgress: syncManager.getProgress.bind(syncManager),
    isOnline: syncManager.isNetworkOnline.bind(syncManager),
    getQueueStats: syncManager.getQueueStats.bind(syncManager),
    on: syncManager.on.bind(syncManager),
    off: syncManager.off.bind(syncManager),
  },
  init: initOfflineSystem,
};

export async function queueOfflineAction<T = unknown>(
  type: string,
  payload: T,
  options?: {
    priority?: "critical" | "high" | "normal" | "low";
    conflictStrategy?: "local-wins" | "server-wins" | "merge" | "manual";
    maxRetries?: number;
    metadata?: Record<string, unknown>;
  },
) {
  return offlineQueue?.enqueue(type, payload, options);
}

export async function saveDraft<T = unknown>(
  formId: string,
  data: T,
  options?: {
    expirationMs?: number;
    metadata?: Record<string, unknown>;
  },
) {
  return draftStorage?.saveDraft(formId, data, options);
}

export async function recoverDraft<T = unknown>(formId: string) {
  return draftStorage?.getDraft<T>(formId);
}

export async function clearDraft(formId: string) {
  return draftStorage?.deleteDraft(formId);
}

export async function cacheData<T = unknown>(
  key: string,
  data: T,
  options?: {
    category?: CacheCategory;
    ttlMs?: number;
    version?: number;
    etag?: string;
  },
) {
  return offlineCache?.set(key, data, options);
}

export async function getCachedData<T = unknown>(key: string) {
  return offlineCache?.get<T>(key);
}

export async function fetchWithCache<T = unknown>(
  key: string,
  fetcher: () => Promise<T>,
  options?: {
    category?: CacheCategory;
    ttlMs?: number;
    staleWhileRevalidate?: boolean;
  },
): Promise<T> {
  const cached = await offlineCache?.get<T>(key);

  if (cached !== null) {
    if (options?.staleWhileRevalidate) {
      fetcher()
        .then((data) => {
          offlineCache?.set(key, data, {
            category: options.category,
            ttlMs: options.ttlMs,
          });
        })
        .catch((err: unknown) =>
          logger?.error("Offline cache fetch failed:", err),
        );
    }
    return cached;
  }

  try {
    const data = await fetcher();
    await offlineCache?.set(key, data, {
      category: options.category,
      ttlMs: options.ttlMs,
    });
    return data;
  } catch (error) {
    const staleCached = await offlineCache?.get<T>(key);
    if (staleCached !== null) {
      return staleCached;
    }
    throw error;
  }
}

export async function triggerSync() {
  return syncManager?.sync();
}

export function isOnline(): boolean {
  return syncManager?.isNetworkOnline();
}

export default offlineStorage;
