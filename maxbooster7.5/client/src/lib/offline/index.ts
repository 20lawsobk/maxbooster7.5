export { offlineQueue, initOfflineQueue } from './OfflineQueue';
export type {
  QueuedAction,
  ActionPriority,
  ActionStatus,
  ConflictStrategy,
  QueueEvent,
  QueueEventType,
} from './OfflineQueue';

export { syncManager, initSyncManager } from './SyncManager';
export type {
  SyncStatus,
  SyncProgress,
  SyncResult,
  BatchSyncRequest,
  BatchSyncResponse,
} from './SyncManager';

export { draftStorage, initDraftStorage } from './DraftStorage';
export type { Draft, DraftConflict } from './DraftStorage';

export { offlineCache, initOfflineCache } from './OfflineCache';
export type { CacheEntry, CacheCategory, CacheOptions } from './OfflineCache';

export async function initOfflineSystem(): Promise<void> {
  await Promise.all([
    initOfflineQueue(),
    initDraftStorage(),
    initOfflineCache(),
  ]);

  await initSyncManager();

  console.log('[Offline] System initialized');
}
