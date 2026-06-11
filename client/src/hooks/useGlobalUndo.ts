import { logger } from "../lib/logger";
import { useCallback, useMemo } from "react";
import {
  useUndo,
  useUndoHistory,
  useUndoActions,
  useLastAction,
} from "@/contexts/UndoContext";
import { useUndoStack } from "./useUndoStack";
import { UndoableAction, ActionType, ActionMetadata, isDestructiveAction, createActionId } from "@/lib/undo/types";
import { apiRequest } from "@/lib/queryClient";

export interface GlobalUndoState {
  history: UndoableAction[];
  redoStack: UndoableAction[];
  canUndo: boolean;
  canRedo: boolean;
  isUndoing: boolean;
  isRedoing: boolean;
  lastAction: UndoableAction | null;
  showUndoToast: boolean;
  historyLength: number;
}

export interface GlobalUndoActions {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clearHistory: () => void;
  dismissUndoToast: () => void;
}

export interface GlobalUndoRecovery {
  createRestorePoint: (name: string, description?: string) => Promise<string>;
  getRestorePoints: () => Promise<RestorePoint[]>;
  restoreToPoint: (pointId: string) => Promise<void>;
  deleteRestorePoint: (pointId: string) => Promise<void>;
}

export interface RestorePoint {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  actionId: string;
}

export interface UseGlobalUndoOptions {
  syncToBackend?: boolean;
  autoSync?: boolean;
}

export interface UseGlobalUndoReturn {
  state: GlobalUndoState;
  actions: GlobalUndoActions;
  recovery: GlobalUndoRecovery;
  executeAction: <T>(
    action: Omit<UndoableAction<T>, "id" | "isUndone" | "result">,
  ) => Promise<T>;
  createUndoableAction: <T>(
    type: ActionType,
    metadata: Omit<ActionMetadata, "timestamp">,
    execute: () => Promise<T>,
    undo: () => Promise<void>,
    redo?: () => Promise<T>,
  ) => Promise<T>;
  startGroup: (name: string) => string;
  endGroup: (groupId: string) => void;
  undoGroup: (groupId: string) => Promise<void>;
  jumpToAction: (actionId: string) => Promise<void>;
  getActionById: (id: string) => UndoableAction | undefined;
  getHistory: () => UndoableAction[];
  getRedoStack: () => UndoableAction[];
  syncActionToBackend: (action: UndoableAction) => Promise<void>;
}

export function useGlobalUndo(
  options: UseGlobalUndoOptions = {},
): UseGlobalUndoReturn {
  const { syncToBackend = false, autoSync = false } = options;

  const _undoContext = useUndo();
  const { history, redoStack } = useUndoHistory();
  const { undo, redo, canUndo, canRedo, clearHistory } = useUndoActions();
  const { lastAction, showUndoToast, dismissUndoToast } = useLastAction();
  useUndoStack();

  const state: GlobalUndoState = useMemo(
    () => ({
      history,
      redoStack,
      canUndo,
      canRedo,
      isUndoing: undoContext?.state.isUndoing,
      isRedoing: undoContext?.state.isRedoing,
      lastAction,
      showUndoToast,
      historyLength: history?.length,
    }),
    [
      history,
      redoStack,
      canUndo,
      canRedo,
      undoContext?.state,
      lastAction,
      showUndoToast,
    ],
  );

  const actions: GlobalUndoActions = useMemo(
    () => ({
      undo,
      redo,
      clearHistory,
      dismissUndoToast,
    }),
    [undo, redo, clearHistory, dismissUndoToast],
  );

  const _syncActionToBackend = useCallback(
    async (action: UndoableAction) => {
      if (!syncToBackend) return;

      try {
        await apiRequest("POST", "/api/undo/track-action", {
          type: action?.type,
          category: action?.metadata.category,
          module: action?.metadata.module,
          description: action?.metadata.description,
          entityId: action?.metadata.entityId,
          entityType: action?.metadata.entityType,
          previousState: action?.metadata.previousState,
          newState: action?.metadata.newState,
          isDestructive: action?.metadata.isDestructive,
        });
      } catch (error) {
        logger?.warn("Failed to sync action to backend:", error);
      }
    },
    [syncToBackend],
  );

  const _executeAction = useCallback(
    async <T>(
      action: Omit<UndoableAction<T>, "id" | "isUndone" | "result">,
    ): Promise<T> => {
      const _result = await undoContext?.executeAction(action);

      if (autoSync) {
        const fullAction: UndoableAction<T> = {
          ...action,
          id: createActionId(),
          isUndone: false,
          result,
        };
        await syncActionToBackend(fullAction);
      }

      return result;
    },
    [undoContext?.executeAction, autoSync, syncActionToBackend],
  );

  const _createUndoableAction = useCallback(
    async <T>(
      type: ActionType,
      metadata: Omit<ActionMetadata, "timestamp">,
      execute: () => Promise<T>,
      undoFn: () => Promise<void>,
      redoFn?: () => Promise<T>,
    ): Promise<T> => {
      const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
        type,
        metadata: {
          ...metadata,
          timestamp: Date?.now(),
          isDestructive: metadata?.isDestructive ?? isDestructiveAction(type),
        },
        execute,
        undo: undoFn,
        redo: redoFn,
        canUndo: () => true,
        canRedo: redoFn ? () => true : undefined,
      };

      return executeAction(action);
    },
    [executeAction],
  );

  const _createRestorePoint = useCallback(
    async (name: string, description?: string): Promise<string> => {
      try {
        const _response = await apiRequest(
          "POST",
          "/api/undo/create-restore-point",
          {
            name,
            description,
          },
        );
        const _data = await response?.json();
        return data?.restorePointId;
      } catch (error) {
        logger?.error("Failed to create restore point:", error);
        throw error;
      }
    },
    [],
  );

  const _getRestorePoints = useCallback(async (): Promise<RestorePoint[]> => {
    try {
      const _response = await apiRequest("GET", "/api/undo/restore-points");
      const _data = await response?.json();
      return data?.restorePoints || [];
    } catch (error) {
      logger?.error("Failed to get restore points:", error);
      return [];
    }
  }, []);

  const _restoreToPoint = useCallback(async (pointId: string): Promise<void> => {
    try {
      await apiRequest("POST", `/api/undo/restore/${pointId}`);
    } catch (error) {
      logger?.error("Failed to restore to point:", error);
      throw error;
    }
  }, []);

  const _deleteRestorePoint = useCallback(
    async (pointId: string): Promise<void> => {
      try {
        await apiRequest("DELETE", `/api/undo/restore-points/${pointId}`);
      } catch (error) {
        logger?.error("Failed to delete restore point:", error);
        throw error;
      }
    },
    [],
  );

  const recovery: GlobalUndoRecovery = useMemo(
    () => ({
      createRestorePoint,
      getRestorePoints,
      restoreToPoint,
      deleteRestorePoint,
    }),
    [createRestorePoint, getRestorePoints, restoreToPoint, deleteRestorePoint],
  );

  const _jumpToAction = useCallback(
    async (actionId: string) => {
      const _actionIndex = history?.findIndex((a) => a?.id === actionId);
      if (actionIndex === -1) return;

      const _currentIndex = history?.length - 1;
      const _stepsToUndo = currentIndex - actionIndex;

      if (stepsToUndo > 0) {
        for (let i = 0; i < stepsToUndo; i++) {
          await undo();
        }
      } else if (stepsToUndo < 0) {
        const _stepsToRedo = Math?.abs(stepsToUndo);
        for (let i = 0; i < stepsToRedo; i++) {
          await redo();
        }
      }
    },
    [history, undo, redo],
  );

  return {
    state,
    actions,
    recovery,
    executeAction,
    createUndoableAction,
    startGroup: undoContext?.startGroup,
    endGroup: undoContext?.endGroup,
    undoGroup: undoContext?.undoGroup,
    jumpToAction,
    getActionById: undoContext?.getActionById,
    getHistory: undoContext?.getHistory,
    getRedoStack: undoContext?.getRedoStack,
    syncActionToBackend,
  };
}

export function useUndoState(): GlobalUndoState {
  const { state } = useGlobalUndo();
  return state;
}

export function useUndoActionsOnly(): GlobalUndoActions {
  const { actions } = useGlobalUndo();
  return actions;
}

export function useUndoRecovery(): GlobalUndoRecovery {
  const { recovery } = useGlobalUndo();
  return recovery;
}

export default useGlobalUndo;
