import { useCallback, useRef } from "react";
import { useUndo } from "@/contexts/UndoContext";
import {
  ActionType,
  ActionCategory,
  ActionMetadata,
  UndoableAction,
} from "@/lib/undo/types";

export interface RecoverableOptions<T> {
  type: ActionType;
  category?: ActionCategory;
  module: string;
  entityType?: string;
  description?: string | ((data: T) => string);
  isDestructive?: boolean;
  requiresConfirmation?: boolean;
  timeout?: number;
  onExecute?: (data: T) => void;
  onUndo?: (data: T) => void;
  onRedo?: (data: T) => void;
}

export interface RecoverableResult<T, R = void> {
  execute: (data: T) => Promise<R>;
  executeWithRecovery: (
    data: T,
    executeFn: (data: T) => Promise<R>,
    undoFn: (data: T, result: R) => Promise<void>,
    redoFn?: (data: T) => Promise<R>,
  ) => Promise<R>;
  lastData: T | null;
  lastResult: R | null;
  canRecover: boolean;
}

export function useRecoverable<T, R = void>(
  options: RecoverableOptions<T>,
): RecoverableResult<T, R> {
  const { executeAction } = useUndo();
  const lastDataRef = useRef<T | null>(null);
  const lastResultRef = useRef<R | null>(null);

  const executeWithRecovery = useCallback(
    async (
      data: T,
      executeFn: (data: T) => Promise<R>,
      undoFn: (data: T, result: R) => Promise<void>,
      redoFn?: (data: T) => Promise<R>,
    ): Promise<R> => {
      const description =
        typeof options.description === "function"
          ? options.description(data)
          : options.description || `${options.type} action`;

      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module: options.module,
        description,
        category: options.category || "other",
        entityType: options.entityType,
        isDestructive: options.isDestructive ?? false,
        requiresConfirmation: options.requiresConfirmation ?? false,
        previousState: data,
      };

      let result: R;

      const action: Omit<UndoableAction<R>, "id" | "isUndone" | "result"> = {
        type: options.type,
        metadata,
        execute: async () => {
          result = await executeFn(data);
          lastDataRef.current = data;
          lastResultRef.current = result;
          options.onExecute?.(data);
          return result;
        },
        undo: async () => {
          await undoFn(data, result);
          options.onUndo?.(data);
        },
        redo: redoFn
          ? async () => {
              result = await redoFn(data);
              options.onRedo?.(data);
              return result;
            }
          : undefined,
        canUndo: () => true,
        canRedo: redoFn ? () => true : undefined,
      };

      return executeAction(action);
    },
    [executeAction, options],
  );

  const execute = useCallback(
    async (data: T): Promise<R> => {
      return executeWithRecovery(
        data,
        async () => undefined as R,
        async () => {},
      );
    },
    [executeWithRecovery],
  );

  return {
    execute,
    executeWithRecovery,
    lastData: lastDataRef.current,
    lastResult: lastResultRef.current,
    canRecover: lastDataRef.current !== null,
  };
}

export function useRecoverableDelete<T extends { id: string }>(
  module: string,
  entityType: string,
  deleteFn: (item: T) => Promise<void>,
  restoreFn: (item: T) => Promise<void>,
) {
  const { executeAction } = useUndo();

  return useCallback(
    async (item: T, description?: string): Promise<void> => {
      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module,
        description: description || `Delete ${entityType}`,
        category: "CRUD",
        entityId: item.id,
        entityType,
        isDestructive: true,
        requiresConfirmation: true,
        previousState: item,
      };

      const action: Omit<UndoableAction<void>, "id" | "isUndone" | "result"> = {
        type: "delete",
        metadata,
        execute: async () => {
          await deleteFn(item);
        },
        undo: async () => {
          await restoreFn(item);
        },
        redo: async () => {
          await deleteFn(item);
        },
        canUndo: () => true,
        canRedo: () => true,
      };

      return executeAction(action);
    },
    [executeAction, module, entityType, deleteFn, restoreFn],
  );
}

export function useRecoverableUpdate<T extends { id: string }>(
  module: string,
  entityType: string,
  updateFn: (id: string, newData: Partial<T>) => Promise<T>,
  revertFn: (id: string, previousData: T) => Promise<void>,
) {
  const { executeAction } = useUndo();

  return useCallback(
    async (
      id: string,
      newData: Partial<T>,
      previousData: T,
      description?: string,
    ): Promise<T> => {
      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module,
        description: description || `Update ${entityType}`,
        category: "CRUD",
        entityId: id,
        entityType,
        previousState: previousData,
        newState: newData,
      };

      let result: T;

      const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
        type: "update",
        metadata,
        execute: async () => {
          result = await updateFn(id, newData);
          return result;
        },
        undo: async () => {
          await revertFn(id, previousData);
        },
        redo: async () => {
          result = await updateFn(id, newData);
          return result;
        },
        canUndo: () => true,
        canRedo: () => true,
      };

      return executeAction(action);
    },
    [executeAction, module, entityType, updateFn, revertFn],
  );
}

export function useRecoverableCreate<T extends { id: string }>(
  module: string,
  entityType: string,
  createFn: (data: Omit<T, "id">) => Promise<T>,
  deleteFn: (id: string) => Promise<void>,
) {
  const { executeAction } = useUndo();

  return useCallback(
    async (data: Omit<T, "id">, description?: string): Promise<T> => {
      let createdItem: T;

      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module,
        description: description || `Create ${entityType}`,
        category: "CRUD",
        entityType,
        newState: data,
      };

      const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
        type: "create",
        metadata,
        execute: async () => {
          createdItem = await createFn(data);
          return createdItem;
        },
        undo: async () => {
          if (createdItem) {
            await deleteFn(createdItem.id);
          }
        },
        redo: async () => {
          createdItem = await createFn(data);
          return createdItem;
        },
        canUndo: () => !!createdItem,
        canRedo: () => true,
      };

      return executeAction(action);
    },
    [executeAction, module, entityType, createFn, deleteFn],
  );
}

export function useRecoverableSettingsChange<T extends Record<string, unknown>>(
  module: string,
  updateSettingsFn: (settings: Partial<T>) => Promise<T>,
  revertSettingsFn: (previousSettings: T) => Promise<void>,
) {
  const { executeAction } = useUndo();

  return useCallback(
    async (
      newSettings: Partial<T>,
      previousSettings: T,
      description?: string,
    ): Promise<T> => {
      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module,
        description: description || "Settings changed",
        category: "settings",
        previousState: previousSettings,
        newState: newSettings,
      };

      const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
        type: "settings_change",
        metadata,
        execute: async () => updateSettingsFn(newSettings),
        undo: async () => revertSettingsFn(previousSettings),
        redo: async () => updateSettingsFn(newSettings),
        canUndo: () => true,
        canRedo: () => true,
      };

      return executeAction(action);
    },
    [executeAction, module, updateSettingsFn, revertSettingsFn],
  );
}

export function useRecoverableBatch(module: string) {
  const { startGroup, endGroup, undoGroup } = useUndo();

  const startBatch = useCallback(
    (name: string): string => {
      return startGroup(`${module}: ${name}`);
    },
    [startGroup, module],
  );

  const endBatch = useCallback(
    (batchId: string): void => {
      endGroup(batchId);
    },
    [endGroup],
  );

  const undoBatch = useCallback(
    async (batchId: string): Promise<void> => {
      await undoGroup(batchId);
    },
    [undoGroup],
  );

  const executeBatch = useCallback(
    async <T>(name: string, operations: (() => Promise<T>)[]): Promise<T[]> => {
      const batchId = startBatch(name);
      try {
        const results: T[] = [];
        for (const operation of operations) {
          const result = await operation();
          results.push(result);
        }
        return results;
      } finally {
        endBatch(batchId);
      }
    },
    [startBatch, endBatch],
  );

  return {
    startBatch,
    endBatch,
    undoBatch,
    executeBatch,
  };
}

export default useRecoverable;
