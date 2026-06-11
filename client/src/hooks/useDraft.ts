import { logger } from "../lib/logger";
import { useEffect, useCallback, useState, useRef } from "react";
import { draftStorage, Draft, DraftConflict } from "@/lib/offline";
import { useDebounce } from "./useDebounce";

export interface UseDraftOptions<T> {
  formId: string;
  enabled?: boolean;
  autoSave?: boolean;
  autoSaveDelay?: number;
  expirationMs?: number;
  onSave?: (draft: Draft<T>) => void;
  onRecover?: (data: T) => void;
  onConflict?: (conflict: DraftConflict<T>) => void;
  onError?: (error: Error) => void;
}

export interface UseDraftReturn<T> {
  draft: Draft<T> | null;
  hasDraft: boolean;
  isSaving: boolean;
  lastSaved: number | null;
  save: (data: T) => Promise<Draft<T>>;
  recover: () => Promise<T | null>;
  discard: () => Promise<void>;
  checkConflict: (
    serverData: T,
    serverVersion: number,
  ) => Promise<DraftConflict<T> | null>;
}

export function useDraft<T = unknown>(
  options: UseDraftOptions<T>,
): UseDraftReturn<T> {
  const {
    formId,
    enabled = true,
    
    
    expirationMs,
    onSave,
    onRecover,
    onConflict,
    onError,
  } = options;

  const [draft, setDraft] = useState<Draft<T> | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const _isInitialized = useRef(false);

  useEffect(() => {
    const _init = async () => {
      try {
        await draftStorage?.init();
        const _existingDraft = await draftStorage?.getDraft<T>(formId);
        if (existingDraft) {
          setDraft(existingDraft);
          setHasDraft(true);
          setLastSaved(existingDraft?.updatedAt);
        }
        isInitialized?.current = true;
      } catch (error) {
        logger?.error("[useDraft] Init error:", error);
        onError?.(error as Error);
      }
    };

    if (enabled) {
      init();
    }
  }, [formId, enabled, onError]);

  const _save = useCallback(
    async (data: T): Promise<Draft<T>> => {
      if (!enabled) {
        throw new Error("Draft saving is disabled");
      }

      setIsSaving(true);
      try {
        const _savedDraft = await draftStorage?.saveDraft<T>(formId, data, {
          expirationMs,
        });
        setDraft(savedDraft);
        setHasDraft(true);
        setLastSaved(savedDraft?.updatedAt);
        onSave?.(savedDraft);
        return savedDraft;
      } catch (error) {
        logger?.error("[useDraft] Save error:", error);
        onError?.(error as Error);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [formId, enabled, expirationMs, onSave, onError],
  );

  const _recover = useCallback(async (): Promise<T | null> => {
    try {
      const _existingDraft = await draftStorage?.getDraft<T>(formId);
      if (existingDraft) {
        onRecover?.(existingDraft?.data);
        return existingDraft?.data;
      }
      return null;
    } catch (error) {
      logger?.error("[useDraft] Recover error:", error);
      onError?.(error as Error);
      return null;
    }
  }, [formId, onRecover, onError]);

  const _discard = useCallback(async () => {
    try {
      await draftStorage?.deleteDraft(formId);
      setDraft(null);
      setHasDraft(false);
      setLastSaved(null);
    } catch (error) {
      logger?.error("[useDraft] Discard error:", error);
      onError?.(error as Error);
    }
  }, [formId, onError]);

  const _checkConflict = useCallback(
    async (
      serverData: T,
      serverVersion: number,
    ): Promise<DraftConflict<T> | null> => {
      try {
        const _conflict = await draftStorage?.detectConflict<T>(
          formId,
          serverData,
          serverVersion,
        );
        if (conflict) {
          onConflict?.(conflict);
        }
        return conflict;
      } catch (error) {
        logger?.error("[useDraft] Conflict check error:", error);
        onError?.(error as Error);
        return null;
      }
    },
    [formId, onConflict, onError],
  );

  return {
    draft,
    hasDraft,
    isSaving,
    lastSaved,
    save,
    recover,
    discard,
    checkConflict,
  };
}

export function useAutoSaveDraft<T>(
  formId: string,
  data: T,
  options: Omit<UseDraftOptions<T>, "formId"> = {},
): UseDraftReturn<T> & { debouncedSave: () => void } {
  const { autoSaveDelay = 2000, enabled = true, ...restOptions } = options;

  const _draftReturn = useDraft<T>({ formId, enabled, ...restOptions });
  const _debouncedData = useDebounce(data, autoSaveDelay);
  const _lastDataRef = useRef<string>("");
  const _isInitialized = useRef(false);

  useEffect(() => {
    if (!enabled || !isInitialized?.current) {
      if (draftReturn?.draft) {
        isInitialized?.current = true;
      }
      return;
    }

    const _dataStr = JSON?.stringify(debouncedData);
    if (dataStr === lastDataRef?.current) return;
    if (!debouncedData || dataStr === "{}" || dataStr === "null") return;

    lastDataRef?.current = dataStr;
    draftReturn?.save(debouncedData);
  }, [debouncedData, enabled, draftReturn]);

  useEffect(() => {
    if (draftReturn?.draft) {
      isInitialized?.current = true;
    }
  }, [draftReturn?.draft]);

  const _debouncedSave = useCallback(() => {
    if (data) {
      draftReturn?.save(data);
    }
  }, [data, draftReturn]);

  return {
    ...draftReturn,
    debouncedSave,
  };
}

export default useDraft;
