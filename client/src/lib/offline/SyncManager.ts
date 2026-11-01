import { logger } from "../logger";
import { offlineQueue, QueuedAction, QueueEvent } from "./OfflineQueue";
import { apiRequest } from "../queryClient";
import { offlineIdentity, assertOfflineIdentity } from "./identity";
import { operationFingerprint } from "./operationFingerprint";

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
  protocolVersion?: 1;
  ownerId?: string;
  receipt?: boolean;
  payloadHash?: string;
  outcome?: "applied" | "rejected" | "conflict";
}

export interface BatchSyncRequest {
  protocolVersion: 1;
  ownerId: string;
  actions: Array<{
    id: string;
    type: string;
    payload: unknown;
    metadata?: Record<string, unknown>;
  }>;
}

export interface BatchSyncResponse {
  protocolVersion: 1;
  ownerId: string;
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
    if (this.isInitialized) return;

    await offlineQueue?.init();

    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    navigator.serviceWorker?.addEventListener("message", this.handleWorkerMessage);

    offlineQueue?.on("action-added", this.handleActionAdded);

    this.isOnline = navigator?.onLine;
    this.isInitialized = true;

    if (this.isOnline) {
      this.scheduleSync();
    }
  }

  private handleOnline = (): void => {
    this.isOnline = true;
    this.emit({ type: "online" });

    if (!this.isPaused) {
      this.scheduleSync();
    }
  };

  private handleWorkerMessage = (event: MessageEvent): void => {
    if (event.data?.type === "SYNC_RECEIPTS_AVAILABLE" &&
        event.data.ownerId === offlineIdentity().owner) {
      void (async () => {
        for (const action of await offlineQueue.getByStatus("syncing")) {
          if (action.handoffId === event.data.handoffId) await offlineQueue.updateAction(action.id, { leaseExpiresAt: 0 });
        }
        this.scheduleSync();
      })().catch(error => this.emit({ type: "sync-error", error: error as Error }));
    }
  };

  private handleOffline = (): void => {
    this.isOnline = false;
    this.emit({ type: "offline" });

    this.cancelPendingSync();
  };

  private handleActionAdded = (_event: QueueEvent): void => {
    if (this.isOnline && !this.isPaused) {
      this.scheduleSync();
    }
  };

  private emit(event: SyncEvent): void {
    const listeners = this.listeners.get(event?.type);
    if (listeners) {
      listeners?.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          logger.error("[SyncManager] Event listener error:", error);
        }
      });
    }
  }

  on(eventType: SyncEventType, listener: SyncEventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  off(eventType: SyncEventType, listener: SyncEventListener): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  getProgress(): SyncProgress {
    return { ...this.progress };
  }

  isNetworkOnline(): boolean {
    return this.isOnline;
  }

  private setStatus(status: SyncStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit({ type: "status-change", status });
    }
  }

  private updateProgress(updates: Partial<SyncProgress>): void {
    this.progress = { ...this.progress, ...updates };
    this.emit({ type: "progress-update", progress: this.progress });
  }

  private scheduleSync(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    this.syncTimeout = setTimeout(() => {
      this.sync();
    }, SYNC_DEBOUNCE_MS);
  }

  private cancelPendingSync(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
  }

  async sync(): Promise<SyncResult[]> {
    if (!this.isOnline || this.isPaused || this.status === "syncing") {
      return [];
    }

    this.setStatus("syncing");
    const allResults: SyncResult[] = [];

    try {
      await this.reconcileUncertain();
      const pendingCount = await offlineQueue?.getPendingCount();

      this.updateProgress({
        total: pendingCount,
        completed: 0,
        failed: 0,
        current: null,
        startedAt: Date.now(),
        estimatedTimeRemaining: null,
      });

      while (this.isOnline && !this.isPaused) {
        const batch = await offlineQueue?.getNextBatch(this.batchSize);

        if (batch?.length === 0) break;

        const results = await this.syncBatch(batch);
        allResults?.push(...results);

        const completed = results?.filter((r) => r?.success).length;
        const failed = results?.filter((r) => !r?.success).length;

        this.updateProgress({
          completed: this.progress.completed + completed,
          failed: this.progress.failed + failed,
        });
      }

      this.setStatus("idle");
      this.emit({ type: "sync-complete", results: allResults });

      await offlineQueue?.clearCompleted();
      for (const action of await offlineQueue.getAllPending()) {
        if ((action.nextAttemptAt || 0) > Date.now()) this.scheduleRetry(action.id);
      }
      const uncertain = (await offlineQueue.getByStatus("failed"))
        .some(action => action.error?.startsWith("Reconciliation required"));
      const handedOff = (await offlineQueue.getByStatus("syncing")).length > 0;
      if (uncertain || handedOff) {
        this.syncTimeout = setTimeout(() => { void this.sync(); }, 15000);
      }
    } catch (error) {
      logger.error("[SyncManager] Sync error:", error);
      this.setStatus("error");
      this.emit({ type: "sync-error", error: error as Error });
      if (this.isOnline && !this.isPaused && offlineIdentity().owner) {
        this.syncTimeout = setTimeout(() => { void this.sync(); }, 60000);
      }
    }

    return allResults;
  }

  private async syncBatch(batch: QueuedAction[]): Promise<SyncResult[]> {
    const identity = offlineIdentity();
    const batchRequest: BatchSyncRequest = {
      protocolVersion: 1,
      ownerId: identity.owner!,
      actions: batch.map((action) => ({
        id: action.id,
        type: action.type,
        payload: action.payload,
        metadata: action.metadata,
      })),
    };

    for (const action of batch) {
      await offlineQueue?.markSyncing(action?.id);
      this.updateProgress({ current: action.id });
    }

    try {
      assertOfflineIdentity(identity);
      const response = await apiRequest(
        "POST",
        "/api/sync/batch",
        batchRequest,
      );
      const data: BatchSyncResponse = await response?.json();
      assertOfflineIdentity(identity);
      if (response.status === 202) {
        const handoff = data as unknown as { protocolVersion: number; ownerId: string; state: string; handoffId: string; actionIds: string[] };
        if (handoff.protocolVersion !== 1 || handoff.ownerId !== identity.owner ||
            handoff.state !== "handed-off" || !handoff.handoffId ||
            !Array.isArray(handoff.actionIds) || handoff.actionIds.length !== batch.length ||
            batch.some(action => !handoff.actionIds.includes(action.id))) {
          throw new Error("Invalid durable handoff acknowledgment");
        }
        for (const action of batch) await offlineQueue.updateAction(action.id, {
          handoffId: handoff.handoffId, leaseExpiresAt: Date.now() + 60000,
        });
        return [];
      }
      if (data.protocolVersion !== 1 || data.ownerId !== identity.owner || !Array.isArray(data.results) ||
          batch.some(action => data.results.filter(r => r.actionId === action.id).length !== 1) ||
          data.results.some(r => !batch.some(a => a.id === r.actionId) || typeof r.success !== "boolean" ||
            !r.receipt || r.ownerId !== identity.owner || r.protocolVersion !== 1)) {
        throw new Error("Invalid sync receipt; reconciliation required");
      }

      for (const result of data?.results ?? []) {
        await this.applyReceipt(result);
      }

      for (const conflict of data?.conflicts ?? []) {
        await offlineQueue?.recordConflict(
          conflict?.actionId,
          conflict?.localData,
          conflict?.serverData,
        );
      }

      return data?.results;
    } catch (error) {
      if (offlineIdentity().epoch !== identity.epoch) throw error;
      const errorMessage =
        error instanceof Error ? error?.message : "Network error";

      for (const action of batch) {
        await offlineQueue.updateAction(action.id, {
          status: "failed",
          error: `Reconciliation required: ${errorMessage}`,
        });
      }

      return batch?.map((action) => ({
        actionId: action.id,
        success: false,
        error: errorMessage,
      }));
    }
  }

  private async applyReceipt(result: SyncResult): Promise<void> {
    const identity = offlineIdentity();
    if (result.ownerId !== identity.owner || !result.receipt) throw new Error("Receipt owner changed");
    const action = await offlineQueue.getAction(result.actionId);
    if (!action) return;
    if (result.payloadHash !== await operationFingerprint(action)) {
      throw new Error("Operation receipt does not match the durable payload");
    }
    assertOfflineIdentity(identity);
    if (result.outcome === "conflict") {
      await offlineQueue.recordConflict(result.actionId, action.payload, result.serverResponse);
    } else if (result.success && result.outcome === "applied") {
      await offlineQueue.markCompleted(result.actionId);
    } else if (!result.success && result.outcome === "rejected") {
      await offlineQueue.updateAction(result.actionId, {
        status: "failed", terminalReceipt: true, error: result.error || "Server rejected this change",
      });
    } else {
      throw new Error("Inconsistent operation receipt");
    }
  }

  private async reconcileUncertain(): Promise<void> {
    const identity = offlineIdentity();
    const failed = await offlineQueue.getByStatus("failed");
    const syncing = await offlineQueue.getByStatus("syncing");
    const candidates = [...failed.filter(action => action.error?.startsWith("Reconciliation required")),
      ...syncing.filter(action => !action.leaseExpiresAt || action.leaseExpiresAt <= Date.now())];
    for (let index = 0; index < candidates.length; index += 50) {
      const group = candidates.slice(index, index + 50);
      const response = await apiRequest("POST", "/api/sync/receipts", {
        protocolVersion: 1, ownerId: identity.owner, ids: group.map(action => action.id),
      });
      const data = await response.json();
      assertOfflineIdentity(identity);
      if (data.protocolVersion !== 1 || data.ownerId !== identity.owner ||
          !Array.isArray(data.receipts) || !Array.isArray(data.missing) ||
          group.some(action => data.receipts.filter((receipt: SyncResult) => receipt.actionId === action.id).length +
            data.missing.filter((id: string) => id === action.id).length !== 1)) {
        throw new Error("Invalid authoritative reconciliation response");
      }
      for (const receipt of data.receipts as SyncResult[]) {
        if (!receipt.receipt || receipt.ownerId !== identity.owner || receipt.protocolVersion !== 1 ||
            !group.some(action => action.id === receipt.actionId)) throw new Error("Invalid reconciliation receipt");
        await this.applyReceipt(receipt);
      }
      for (const id of data.missing) {
        if (!group.some(action => action.id === id)) throw new Error("Unexpected reconciliation operation ID");
        // Authoritative absence + atomic server deduplication makes same-ID
        // resubmission safe even when a worker is concurrently finishing it.
        await offlineQueue.updateAction(id, {
          status: "pending", error: undefined, handoffId: undefined, nextAttemptAt: Date.now() + 1000,
        });
      }
    }
  }

  private scheduleRetry(actionId: string): void {
    offlineQueue?.getAction(actionId).then((action) => {
      if (!action || action?.retryCount >= action?.maxRetries) return;

      const delay = Math.max(0, (action.nextAttemptAt || Date.now()) - Date.now());
      const jitter = Math.random() * 1000;

      const timeout = setTimeout(() => {
        this.retryTimeouts.delete(actionId);
        if (this.isOnline && !this.isPaused) {
          this.scheduleSync();
        }
      }, delay + jitter);

      this.retryTimeouts.set(actionId, timeout);
    });
  }

  pause(): void {
    this.isPaused = true;
    this.setStatus("paused");
    this.cancelPendingSync();
  }

  resume(): void {
    this.isPaused = false;
    if (this.isOnline) {
      this.setStatus("idle");
      this.scheduleSync();
    }
  }

  async forceSyncAction(actionId: string): Promise<SyncResult | null> {
    if (!this.isOnline || this.isPaused) return null;
    const batch = await offlineQueue.getNextBatch(1, actionId);
    if (!batch.length) return null;
    const results = await this.syncBatch(batch);
    return results[0] || null;
  }

  async retryFailed(): Promise<SyncResult[]> {
    const failed = await offlineQueue?.getByStatus("failed");

    for (const action of failed) {
      if (action.error?.startsWith("Reconciliation required") || action.terminalReceipt) continue;
      await offlineQueue?.updateAction(action?.id, {
        status: "pending",
        retryCount: 0,
        error: undefined,
      });
    }

    return this.sync();
  }

  setBatchSize(size: number): void {
    this.batchSize = Math.max(1, Math.min(size, 50));
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
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    navigator.serviceWorker?.removeEventListener("message", this.handleWorkerMessage);

    this.cancelPendingSync();

    for (const timeout of this.retryTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.retryTimeouts.clear();

    this.listeners.clear();
    this.isInitialized = false;
  }
}

export const syncManager = new SyncManager();

export async function initSyncManager(): Promise<void> {
  await syncManager?.init();
}
