import { logger } from "../logger";
import { offlineQueue, QueuedAction, QueueEvent } from "./OfflineQueue";
import { apiRequest } from "../queryClient";

export type SyncStatus = "idle" | "syncing" | "error" | "paused";

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  current: string | null;
  startedAt: number | null;
  estimatedTimeRemaining: number | null;
}

export interface SyncResult {
  actionId: string;
  success: boolean;
  error?: string;
  serverResponse?: unknown;
}

export interface BatchSyncRequest {
  actions: Array<{
    id: string;
    type: string;
    payload: unknown;
    metadata?: Record<string, unknown>;
  }>;
}

export interface BatchSyncResponse {
  results: SyncResult[];
  conflicts: Array<{
    actionId: string;
    localData: unknown;
    serverData: unknown;
  }>;
}

type SyncEventType =
  | "status-change"
  | "progress-update"
  | "sync-complete"
  | "sync-error"
  | "online"
  | "offline";

interface SyncEvent {
  type: SyncEventType;
  status?: SyncStatus;
  progress?: SyncProgress;
  error?: Error;
  results?: SyncResult[];
}

type SyncEventListener = (event: SyncEvent) => void;

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000, 32000];
const SYNC_DEBOUNCE_MS = 1000;

class SyncManager {
  private status: SyncStatus = "idle";
  private progress: SyncProgress = {
    total: 0,
    completed: 0,
    failed: 0,
    current: null,
    startedAt: null,
    estimatedTimeRemaining: null,
  };
  private isOnline = navigator?.onLine;
  private listeners: Map<SyncEventType, Set<SyncEventListener>> = new Map();
  private syncTimeout: NodeJS.Timeout | null = null;
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private isPaused = false;
  private batchSize = DEFAULT_BATCH_SIZE;
  private isInitialized = false;

  async init(): Promise<void> {
    if (this?.isInitialized) return;

    await offlineQueue?.init();

    window?.addEventListener("online", this?.handleOnline);
    window?.addEventListener("offline", this?.handleOffline);

    offlineQueue?.on("action-added", this?.handleActionAdded);

    this.isOnline = navigator?.onLine;
    this.isInitialized = true;

    if (this?.isOnline) {
      this?.scheduleSync();
    }
  }

  private handleOnline = (): void => {
    this.isOnline = true;
    this?.emit({ type: "online" });

    if (!this?.isPaused) {
      this?.scheduleSync();
    }
  };

  private handleOffline = (): void => {
    this.isOnline = false;
    this?.emit({ type: "offline" });

    this?.cancelPendingSync();
  };

  private handleActionAdded = (_event: QueueEvent): void => {
    if (this?.isOnline && !this?.isPaused) {
      this?.scheduleSync();
    }
  };

  private emit(event: SyncEvent): void {
    const listeners = this?.listeners.get(event?.type);
    if (listeners) {
      listeners?.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          logger?.error("[SyncManager] Event listener error:", error);
        }
      });
    }
  }

  on(eventType: SyncEventType, listener: SyncEventListener): () => void {
    if (!this?.listeners.has(eventType)) {
      this?.listeners.set(eventType, new Set());
    }
    this?.listeners.get(eventType)!.add(listener);

    return () => {
      this?.listeners.get(eventType)?.delete(listener);
    };
  }

  off(eventType: SyncEventType, listener: SyncEventListener): void {
    this?.listeners.get(eventType)?.delete(listener);
  }

  getStatus(): SyncStatus {
    return this?.status;
  }

  getProgress(): SyncProgress {
    return { ...this?.progress };
  }

  isNetworkOnline(): boolean {
    return this?.isOnline;
  }

  private setStatus(status: SyncStatus): void {
    if (this?.status !== status) {
      this.status = status;
      this?.emit({ type: "status-change", status });
    }
  }

  private updateProgress(updates: Partial<SyncProgress>): void {
    this.progress = { ...this?.progress, ...updates };
    this?.emit({ type: "progress-update", progress: this.progress });
  }

  private scheduleSync(): void {
    if (this?.syncTimeout) {
      clearTimeout(this?.syncTimeout);
    }

    this.syncTimeout = setTimeout(() => {
      this?.sync();
    }, SYNC_DEBOUNCE_MS);
  }

  private cancelPendingSync(): void {
    if (this?.syncTimeout) {
      clearTimeout(this?.syncTimeout);
      this.syncTimeout = null;
    }
  }

  async sync(): Promise<SyncResult[]> {
    if (!this?.isOnline || this?.isPaused || this?.status === "syncing") {
      return [];
    }

    this?.setStatus("syncing");
    const allResults: SyncResult[] = [];

    try {
      const pendingCount = await offlineQueue?.getPendingCount();

      this?.updateProgress({
        total: pendingCount,
        completed: 0,
        failed: 0,
        current: null,
        startedAt: Date.now(),
        estimatedTimeRemaining: null,
      });

      while (this?.isOnline && !this?.isPaused) {
        const batch = await offlineQueue?.getNextBatch(this?.batchSize);

        if (batch?.length === 0) break;

        const results = await this?.syncBatch(batch);
        allResults?.push(...results);

        const completed = results?.filter((r) => r?.success).length;
        const failed = results?.filter((r) => !r?.success).length;

        this?.updateProgress({
          completed: this.progress.completed + completed,
          failed: this.progress.failed + failed,
        });
      }

      this?.setStatus("idle");
      this?.emit({ type: "sync-complete", results: allResults });

      await offlineQueue?.clearCompleted();
    } catch (error) {
      logger?.error("[SyncManager] Sync error:", error);
      this?.setStatus("error");
      this?.emit({ type: "sync-error", error: error as Error });
    }

    return allResults;
  }

  private async syncBatch(batch: QueuedAction[]): Promise<SyncResult[]> {
    const batchRequest: BatchSyncRequest = {
      actions: batch.map((action) => ({
        id: action.id,
        type: action.type,
        payload: action.payload,
        metadata: action.metadata,
      })),
    };

    for (const action of batch) {
      await offlineQueue?.markSyncing(action?.id);
      this?.updateProgress({ current: action.id });
    }

    try {
      const response = await apiRequest(
        "POST",
        "/api/sync/batch",
        batchRequest,
      );
      const data: BatchSyncResponse = await response?.json();

      for (const result of data?.results) {
        if (result?.success) {
          await offlineQueue?.markCompleted(result?.actionId);
        } else {
          await offlineQueue?.markFailed(
            result?.actionId,
            result?.error || "Unknown error",
          );
          this?.scheduleRetry(result?.actionId);
        }
      }

      for (const conflict of data?.conflicts) {
        await offlineQueue?.recordConflict(
          conflict?.actionId,
          conflict?.localData,
          conflict?.serverData,
        );
      }

      return data?.results;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error?.message : "Network error";

      for (const action of batch) {
        await offlineQueue?.markFailed(action?.id, errorMessage);
        this?.scheduleRetry(action?.id);
      }

      return batch?.map((action) => ({
        actionId: action.id,
        success: false,
        error: errorMessage,
      }));
    }
  }

  private scheduleRetry(actionId: string): void {
    offlineQueue?.getAction(actionId).then((action) => {
      if (!action || action?.retryCount >= action?.maxRetries) return;

      const delay =
        DEFAULT_RETRY_DELAYS[
          Math?.min(action?.retryCount, DEFAULT_RETRY_DELAYS?.length - 1)
        ];
      const jitter = Math?.random() * 1000;

      const timeout = setTimeout(() => {
        this?.retryTimeouts.delete(actionId);
        if (this?.isOnline && !this?.isPaused) {
          this?.scheduleSync();
        }
      }, delay + jitter);

      this?.retryTimeouts.set(actionId, timeout);
    });
  }

  pause(): void {
    this.isPaused = true;
    this?.setStatus("paused");
    this?.cancelPendingSync();
  }

  resume(): void {
    this.isPaused = false;
    if (this?.isOnline) {
      this?.setStatus("idle");
      this?.scheduleSync();
    }
  }

  async forceSyncAction(actionId: string): Promise<SyncResult | null> {
    const action = await offlineQueue?.getAction(actionId);
    if (!action) return null;

    const results = await this?.syncBatch([action]);
    return results[0] || null;
  }

  async retryFailed(): Promise<SyncResult[]> {
    const failed = await offlineQueue?.getByStatus("failed");

    for (const action of failed) {
      await offlineQueue?.updateAction(action?.id, {
        status: "pending",
        retryCount: 0,
        error: undefined,
      });
    }

    return this?.sync();
  }

  setBatchSize(size: number): void {
    this.batchSize = Math?.max(1, Math?.min(size, 50));
  }

  async getQueueStats(): Promise<{
    pending: number;
    syncing: number;
    completed: number;
    failed: number;
    conflict: number;
    total: number;
  }> {
    return offlineQueue?.getStats();
  }

  destroy(): void {
    window?.removeEventListener("online", this?.handleOnline);
    window?.removeEventListener("offline", this?.handleOffline);

    this?.cancelPendingSync();

    for (const timeout of this?.retryTimeouts.values()) {
      clearTimeout(timeout);
    }
    this?.retryTimeouts.clear();

    this?.listeners.clear();
    this.isInitialized = false;
  }
}

export const syncManager = new SyncManager();

export async function initSyncManager(): Promise<void> {
  await syncManager?.init();
}
