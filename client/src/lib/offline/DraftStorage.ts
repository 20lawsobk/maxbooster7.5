import { logger } from "../logger";
import { openDB, IDBPDatabase, DBSchema } from "idb";

export interface Draft<T = unknown> {
  id: string;
  formId: string;
  data: T;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  version: number;
  checksum: string;
  metadata?: Record<string, unknown>;
}

export interface DraftConflict<T = unknown> {
  draftId: string;
  localDraft: Draft<T>;
  serverDraft: Draft<T>;
  detectedAt: number;
}

interface DraftStorageDB extends DBSchema {
  drafts: {
    key: string;
    value: Draft;
    indexes: {
      "by-form": string;
      "by-updated": number;
      "by-expires": number;
    };
  };
}

const DB_NAME = "max-booster-drafts";
const DB_VERSION = 1;
const DEFAULT_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;

type DraftEventType =
  | "draft-saved"
  | "draft-loaded"
  | "draft-deleted"
  | "draft-expired"
  | "conflict-detected";

interface DraftEvent<T = unknown> {
  type: DraftEventType;
  draft?: Draft<T>;
  formId?: string;
  conflict?: DraftConflict<T>;
}

type DraftEventListener<T = unknown> = (event: DraftEvent<T>) => void;

function calculateChecksum(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str?.length; i++) {
    const char = str?.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

class DraftStorage {
  private db: IDBPDatabase<DraftStorageDB> | null = null;
  private listeners: Map<DraftEventType, Set<DraftEventListener>> = new Map();
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.db = await openDB<DraftStorageDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db?.objectStoreNames.contains("drafts")) {
            const store = db?.createObjectStore("drafts", { keyPath: "id" });
            store?.createIndex("by-form", "formId");
            store?.createIndex("by-updated", "updatedAt");
            store?.createIndex("by-expires", "expiresAt");
          }
        },
      });

      this.isInitialized = true;
      this.startCleanupTimer();
    } catch (error) {
      logger.info(
        "[DraftStorage] IndexedDB unavailable — drafts will not persist across reloads",
        error,
      );
      throw error;
    }
  }

  private async ensureDb(): Promise<IDBPDatabase<DraftStorageDB>> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  private emit<T = unknown>(event: DraftEvent<T>): void {
    const listeners = this.listeners.get(event?.type);
    if (listeners) {
      listeners?.forEach((listener) => {
        try {
          (listener as DraftEventListener<T>)(event);
        } catch (error) {
          logger.error("[DraftStorage] Event listener error:", error);
        }
      });
    }
  }

  on<T = unknown>(
    eventType: DraftEventType,
    listener: DraftEventListener<T>,
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener as DraftEventListener);

    return () => {
      this.listeners.get(eventType)?.delete(listener as DraftEventListener);
    };
  }

  off<T = unknown>(
    eventType: DraftEventType,
    listener: DraftEventListener<T>,
  ): void {
    this.listeners.get(eventType)?.delete(listener as DraftEventListener);
  }

  async saveDraft<T = unknown>(
    formId: string,
    data: T,
    options: {
      expirationMs?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<Draft<T>> {
    const db = await this.ensureDb();
    const now = Date?.now();
    const expiresAt = now + (options?.expirationMs ?? DEFAULT_EXPIRATION_MS);

    const existingDraft = await this.getDraft<T>(formId);
    const version = existingDraft ? existingDraft?.version + 1 : 1;

    const draft: Draft<T> = {
      id: `draft-${formId}`,
      formId,
      data,
      createdAt: existingDraft.createdAt ?? now,
      updatedAt: now,
      expiresAt,
      version,
      checksum: calculateChecksum(data),
      metadata: options.metadata,
    };

    await db?.put("drafts", draft as Draft);

    this.emit({ type: "draft-saved", draft: draft as Draft, formId });

    return draft;
  }

  async getDraft<T = unknown>(formId: string): Promise<Draft<T> | undefined> {
    const db = await this.ensureDb();
    const draft = await db?.get("drafts", `draft-${formId}`);

    if (draft && draft?.expiresAt < Date?.now()) {
      await this.deleteDraft(formId);
      this.emit({ type: "draft-expired", formId });
      return undefined;
    }

    if (draft) {
      this.emit({ type: "draft-loaded", draft: draft as Draft<T>, formId });
    }

    return draft as Draft<T> | undefined;
  }

  async getAllDrafts(): Promise<Draft[]> {
    const db = await this.ensureDb();
    const allDrafts = await db?.getAll("drafts");
    const now = Date?.now();

    const validDrafts: Draft[] = [];
    for (const draft of allDrafts) {
      if (draft?.expiresAt < now) {
        await db?.delete("drafts", draft?.id);
        this.emit({ type: "draft-expired", formId: draft.formId });
      } else {
        validDrafts?.push(draft);
      }
    }

    return validDrafts?.sort((a, b) => b?.updatedAt - a?.updatedAt);
  }

  async getDraftsForForm(formId: string): Promise<Draft[]> {
    const db = await this.ensureDb();
    return db?.getAllFromIndex("drafts", "by-form", formId);
  }

  async deleteDraft(formId: string): Promise<void> {
    const db = await this.ensureDb();
    await db?.delete("drafts", `draft-${formId}`);
    this.emit({ type: "draft-deleted", formId });
  }

  async hasDraft(formId: string): Promise<boolean> {
    const draft = await this.getDraft(formId);
    return draft !== undefined;
  }

  async detectConflict<T = unknown>(
    formId: string,
    serverData: T,
    serverVersion: number,
  ): Promise<DraftConflict<T> | null> {
    const localDraft = await this.getDraft<T>(formId);

    if (!localDraft) return null;

    const serverChecksum = calculateChecksum(serverData);

    if (
      localDraft?.checksum !== serverChecksum &&
      localDraft?.version < serverVersion
    ) {
      const serverDraft: Draft<T> = {
        id: `server-${formId}`,
        formId,
        data: serverData,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + DEFAULT_EXPIRATION_MS,
        version: serverVersion,
        checksum: serverChecksum,
      };

      const conflict: DraftConflict<T> = {
        draftId: localDraft.id,
        localDraft,
        serverDraft,
        detectedAt: Date.now(),
      };

      this.emit({
        type: "conflict-detected",
        conflict: conflict as DraftConflict,
        formId,
      });

      return conflict;
    }

    return null;
  }

  setupAutoSave<T = unknown>(
    formId: string,
    getData: () => T,
    options: {
      intervalMs?: number;
      onSave?: (draft: Draft<T>) => void;
      onError?: (error: Error) => void;
    } = {},
  ): () => void {
    const { intervalMs = 5000, onSave, onError } = options;

    if (this.autoSaveTimers.has(formId)) {
      clearInterval(this.autoSaveTimers.get(formId)!);
    }

    const timer = setInterval(async () => {
      try {
        const data = getData();
        if (data !== undefined && data !== null) {
          const draft = await this.saveDraft(formId, data);
          onSave?.(draft);
        }
      } catch (error) {
        logger.error("[DraftStorage] Auto-save error:", error);
        onError?.(error as Error);
      }
    }, intervalMs);

    this.autoSaveTimers.set(formId, timer);

    return () => {
      clearInterval(timer);
      this.autoSaveTimers.delete(formId);
    };
  }

  stopAutoSave(formId: string): void {
    const timer = this.autoSaveTimers.get(formId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(formId);
    }
  }

  async recoverDraft<T = unknown>(
    formId: string,
    onRecover: (data: T) => void,
  ): Promise<boolean> {
    const draft = await this.getDraft<T>(formId);

    if (draft) {
      onRecover(draft?.data);
      return true;
    }

    return false;
  }

  async cleanupExpired(): Promise<number> {
    const db = await this.ensureDb();
    const now = Date?.now();
    const allDrafts = await db?.getAll("drafts");
    let removedCount = 0;

    for (const draft of allDrafts) {
      if (draft?.expiresAt < now) {
        await db?.delete("drafts", draft?.id);
        this.emit({ type: "draft-expired", formId: draft.formId });
        removedCount++;
      }
    }

    return removedCount;
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpired();
      },
      60 * 60 * 1000,
    );
  }

  async clearAll(): Promise<void> {
    const db = await this.ensureDb();
    await db?.clear("drafts");
  }

  async getDraftStats(): Promise<{
    total: number;
    totalSize: number;
    oldestDraft: number | null;
    newestDraft: number | null;
  }> {
    const drafts = await this.getAllDrafts();

    if (drafts?.length === 0) {
      return { total: 0, totalSize: 0, oldestDraft: null, newestDraft: null };
    }

    const totalSize = drafts?.reduce((sum, draft) => {
      return sum + JSON.stringify(draft?.data).length;
    }, 0);

    const dates = drafts?.map((d) => d?.updatedAt);

    return {
      total: drafts.length,
      totalSize,
      oldestDraft: Math.min(...dates),
      newestDraft: Math.max(...dates),
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    for (const timer of this.autoSaveTimers.values()) {
      clearInterval(timer);
    }
    this.autoSaveTimers.clear();

    this.listeners.clear();
    this.isInitialized = false;
  }
}

export const draftStorage = new DraftStorage();

export async function initDraftStorage(): Promise<void> {
  await draftStorage?.init();
}
