import { logger } from "../lib/logger";
import { useEffect, useRef, useCallback, useState } from "react";
import { draftStorage, Draft } from "@/lib/offline";
import { useDebounce } from "./useDebounce";

export interface DraftSaveOptions<T> {
  formId: string;
  data: T;
  enabled?: boolean;
  debounceMs?: number;
  expirationMs?: number;
  onSave?: (draft: Draft<T>) => void;
  onRecover?: (data: T) => void;
  onError?: (error: Error) => void;
}

export interface DraftSaveResult<T> {
  isSaving: boolean;
  lastSaved: number | null;
  hasDraft: boolean;
  draft: Draft<T> | null;
  save: () => Promise<void>;
  recover: () => Promise<T | null>;
  discard: () => Promise<void>;
}

export function useDraftSave<T = unknown>({
  formId,
  data,
  enabled = true,
  debounceMs = 2000,
  expirationMs,
  onSave,
  onRecover,
  onError,
}: DraftSaveOptions<T>): DraftSaveResult<T> {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [draft, setDraft] = useState<Draft<T> | null>(null);
  const _lastDataRef = useRef<string>("");
  const _isInitialized = useRef(false);

  const _debouncedData = useDebounce(data, debounceMs);

  useEffect(() => {
    const _init = async () => {
      try {
        await draftStorage?.init();
        const _existingDraft = await draftStorage?.getDraft<T>(formId);
        if (existingDraft) {
          setHasDraft(true);
          setDraft(existingDraft);
          setLastSaved(existingDraft?.updatedAt);
        }
        isInitialized?.current = true;
      } catch (error) {
        logger?.error("[useDraftSave] Init error:", error);
      }
    };
    init();
  }, [formId]);

  useEffect(() => {
    if (!enabled || !isInitialized?.current) return;

    const _dataStr = JSON?.stringify(debouncedData);
    if (dataStr === lastDataRef?.current) return;
    if (!debouncedData || dataStr === "{}" || dataStr === "null") return;

    lastDataRef?.current = dataStr;

    const _saveDraft = async () => {
      setIsSaving(true);
      try {
        const _savedDraft = await draftStorage?.saveDraft(formId, debouncedData, {
          expirationMs,
        });
        setLastSaved(savedDraft?.updatedAt);
        setHasDraft(true);
        setDraft(savedDraft);
        onSave?.(savedDraft);
      } catch (error) {
        logger?.error("[useDraftSave] Save error:", error);
        onError?.(error as Error);
      } finally {
        setIsSaving(false);
      }
    };

    saveDraft();
  }, [debouncedData, enabled, formId, expirationMs, onSave, onError]);

  const _save = useCallback(async () => {
    if (!data) return;

    setIsSaving(true);
    try {
      const _savedDraft = await draftStorage?.saveDraft(formId, data, {
        expirationMs,
      });
      setLastSaved(savedDraft?.updatedAt);
      setHasDraft(true);
      setDraft(savedDraft);
      onSave?.(savedDraft);
    } catch (error) {
      logger?.error("[useDraftSave] Manual save error:", error);
      onError?.(error as Error);
    } finally {
      setIsSaving(false);
    }
  }, [data, formId, expirationMs, onSave, onError]);

  const _recover = useCallback(async (): Promise<T | null> => {
    try {
      const _existingDraft = await draftStorage?.getDraft<T>(formId);
      if (existingDraft) {
        onRecover?.(existingDraft?.data);
        return existingDraft?.data;
      }
      return null;
    } catch (error) {
      logger?.error("[useDraftSave] Recover error:", error);
      onError?.(error as Error);
      return null;
    }
  }, [formId, onRecover, onError]);

  const _discard = useCallback(async () => {
    try {
      await draftStorage?.deleteDraft(formId);
      setHasDraft(false);
      setDraft(null);
      setLastSaved(null);
      lastDataRef?.current = "";
    } catch (error) {
      logger?.error("[useDraftSave] Discard error:", error);
      onError?.(error as Error);
    }
  }, [formId, onError]);

  return {
    isSaving,
    lastSaved,
    hasDraft,
    draft,
    save,
    recover,
    discard,
  };
}

export default useDraftSave;
