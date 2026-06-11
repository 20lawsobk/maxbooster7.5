import { useState, useCallback, useEffect, useMemo } from "react";
import {
  UndoStack,
  UndoAction,
  UndoActionType,
  getUndoStack,
  UndoStackConfig,
} from "@/lib/undoSystem";

export interface UseUndoStackOptions extends Partial<UndoStackConfig> {
  createNewInstance?: boolean;
}

export interface UseUndoStackReturn {
  push: (action: Omit<UndoAction, "id" | "timestamp">) => Promise<UndoAction>;
  undo: () => Promise<UndoAction | null>;
  redo: () => Promise<UndoAction | null>;
  canUndo: boolean;
  canRedo: boolean;
  history: UndoAction[];
  redoStack: UndoAction[];
  lastAction: UndoAction | undefined;
  clear: () => void;
  startGroup: (name: string) => string;
  endGroup: (groupId?: string) => void;
  undoToRestorePoint: (actionId: string) => Promise<void>;
  createRestorePoint: (description: string) => UndoAction;
  getRestorePoints: () => UndoAction[];
  historyLength: number;
  isGrouping: boolean;
}

export function useUndoStack(
  options: UseUndoStackOptions = {},
): UseUndoStackReturn {
  const { createNewInstance, ...config } = options;

  const undoStack = useMemo(() => {
    if (createNewInstance) {
      return new UndoStack(config);
    }
    return getUndoStack(config);
  }, [createNewInstance]);

  const [state, setState] = useState(() => undoStack?.getState());
  const [history, setHistory] = useState<UndoAction[]>(() =>
    undoStack?.getHistory(),
  );
  const [redoStackList, setRedoStack] = useState<UndoAction[]>(() =>
    undoStack?.getRedoStack(),
  );

  useEffect(() => {
    const unsubscribe = undoStack?.subscribe(() => {
      setState(undoStack?.getState());
      setHistory(undoStack?.getHistory());
      setRedoStack(undoStack?.getRedoStack());
    });

    return unsubscribe;
  }, [undoStack]);

  const push = useCallback(
    async (
      action: Omit<UndoAction, "id" | "timestamp">,
    ): Promise<UndoAction> => {
      return undoStack?.push(action);
    },
    [undoStack],
  );

  const undo = useCallback(async (): Promise<UndoAction | null> => {
    return undoStack?.undo();
  }, [undoStack]);

  const redo = useCallback(async (): Promise<UndoAction | null> => {
    return undoStack?.redo();
  }, [undoStack]);

  const clear = useCallback(() => {
    undoStack?.clear();
  }, [undoStack]);

  const startGroup = useCallback(
    (name: string): string => {
      return undoStack?.startGroup(name);
    },
    [undoStack],
  );

  const endGroup = useCallback(
    (groupId?: string): void => {
      undoStack?.endGroup(groupId);
    },
    [undoStack],
  );

  const undoToRestorePoint = useCallback(
    async (actionId: string): Promise<void> => {
      await undoStack?.undoToRestorePoint(actionId);
    },
    [undoStack],
  );

  const createRestorePoint = useCallback(
    (description: string): UndoAction => {
      return undoStack?.createRestorePoint(description);
    },
    [undoStack],
  );

  const getRestorePoints = useCallback((): UndoAction[] => {
    return undoStack?.getRestorePoints();
  }, [undoStack]);

  return {
    push,
    undo,
    redo,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    history,
    redoStack: redoStackList,
    lastAction: state.lastAction,
    clear,
    startGroup,
    endGroup,
    undoToRestorePoint,
    createRestorePoint,
    getRestorePoints,
    historyLength: state.historyLength,
    isGrouping: state.isGrouping,
  };
}

export interface UseUndoableOperationOptions {
  type: UndoActionType;
  module: string;
  description?: string | ((args: Record<string, unknown>) => string);
  entityType?: string;
}

export function useUndoableOperation<T, Args extends any[] = any[]>(
  options: UseUndoableOperationOptions,
  execute: (...args: Args) => Promise<T>,
  undo: (result: T, ...args: Args) => Promise<void>,
  redo?: (...args: Args) => Promise<T>,
): (...args: Args) => Promise<T> {
  const { push } = useUndoStack();

  return useCallback(
    async (...args: Args): Promise<T> => {
      let result: T;

      const description =
        typeof options?.description === "function"
          ? options?.description(args)
          : options?.description || `${options?.type} action`;

      const action: Omit<UndoAction, "id" | "timestamp"> = {
        type: options.type,
        description,
        module: options.module,
        entityType: options.entityType,
        execute: async () => {
          result = await execute(...args);
        },
        undo: async () => {
          await undo(result!, ...args);
        },
        redo: redo
          ? async () => {
              result = await redo(...args);
            }
          : undefined,
      };

      await push(action);

      return result!;
    },
    [push, execute, undo, redo, options],
  );
}

export default useUndoStack;
