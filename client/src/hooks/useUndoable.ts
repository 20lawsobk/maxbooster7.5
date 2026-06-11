import { useCallback, useRef } from "react";
import { useUndo } from "@/contexts/UndoContext";
import {
  UndoableAction,
  ActionType,
  ActionCategory,
  ActionMetadata,
  isDestructiveAction,
} from "@/lib/undo/types";

export interface UseUndoableOptions<T = unknown> {
  type: ActionType;
  category: ActionCategory;
  module: string;
  description?: string;
  entityId?: string;
  entityType?: string;
  isDestructive?: boolean;
  requiresConfirmation?: boolean;
  onExecute?: (result: T) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export interface UseUndoableReturn<T, Args extends unknown[]> {
  execute: (...args: Args) => Promise<T>;
  isExecuting: boolean;
}

export function useUndoable<T, Args extends unknown[]>(
  options: UseUndoableOptions<T>,
  executeFn: (...args: Args) => Promise<T>,
  undoFn: (result: T, ...args: Args) => Promise<void>,
  redoFn?: (...args: Args) => Promise<T>,
): UseUndoableReturn<T, Args> {
  const { executeAction } = useUndo();
  const isExecutingRef = useRef(false);

  const execute = useCallback(
    async (...args: Args): Promise<T> => {
      if (isExecutingRef?.current) {
        throw new Error("Action already in progress");
      }

      isExecutingRef.current = true;

      try {
        const metadata: ActionMetadata = {
          timestamp: Date.now(),
          module: options.module,
          description: options.description || `${options?.type} action`,
          category: options.category,
          entityId: options.entityId,
          entityType: options.entityType,
          isDestructive:
            options?.isDestructive ?? isDestructiveAction(options?.type),
          requiresConfirmation: options.requiresConfirmation,
        };

        let actionResult: T;

        const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
          type: options.type,
          metadata,
          execute: async () => {
            actionResult = await executeFn(...args);
            options?.onExecute?.(actionResult);
            return actionResult;
          },
          undo: async () => {
            await undoFn(actionResult!, ...args);
            options?.onUndo?.();
          },
          redo: redoFn
            ? async () => {
                const result = await redoFn(...args);
                options?.onRedo?.();
                return result;
              }
            : undefined,
          canUndo: () => true,
          canRedo: redoFn ? () => true : undefined,
        };

        return await executeAction(action);
      } finally {
        isExecutingRef.current = false;
      }
    },
    [executeAction, executeFn, undoFn, redoFn, options],
  );

  return {
    execute,
    isExecuting: isExecutingRef.current,
  };
}

export function useUndoableWithState<T, S>(
  options: UseUndoableOptions<T>,
  executeFn: (previousState: S) => Promise<{ result: T; newState: S }>,
  undoFn: (newState: S, previousState: S) => Promise<void>,
  getCurrentState: () => S,
) {
  const { executeAction } = useUndo();
  const stateRef = useRef<{ previous: S; current: S } | null>(null);

  const execute = useCallback(async (): Promise<T> => {
    const previousState = getCurrentState();

    const metadata: ActionMetadata = {
      timestamp: Date.now(),
      module: options.module,
      description: options.description || `${options?.type} action`,
      category: options.category,
      entityId: options.entityId,
      entityType: options.entityType,
      isDestructive: options.isDestructive ?? isDestructiveAction(options?.type),
      requiresConfirmation: options.requiresConfirmation,
      previousState,
    };

    const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
      type: options.type,
      metadata,
      execute: async () => {
        const { result, newState } = await executeFn(previousState);
        stateRef.current = { previous: previousState, current: newState };
        metadata.newState = newState;
        return result;
      },
      undo: async () => {
        if (stateRef?.current) {
          await undoFn(stateRef?.current.current, stateRef?.current.previous);
        }
      },
      redo: async () => {
        const { result, newState } = await executeFn(
          stateRef?.current?.previous || previousState,
        );
        stateRef.current = {
          previous: stateRef.current?.previous || previousState,
          current: newState,
        };
        return result;
      },
      canUndo: () => stateRef?.current !== null,
      canRedo: () => true,
    };

    return executeAction(action);
  }, [executeAction, executeFn, undoFn, getCurrentState, options]);

  return execute;
}

export function useUndoableAsync<T>(
  options: UseUndoableOptions<T>,
  config: {
    execute: () => Promise<T>;
    undo: (result: T) => Promise<void>;
    redo?: () => Promise<T>;
  },
) {
  const { executeAction } = useUndo();

  return useCallback(async (): Promise<T> => {
    const metadata: ActionMetadata = {
      timestamp: Date.now(),
      module: options.module,
      description: options.description || `${options?.type} action`,
      category: options.category,
      entityId: options.entityId,
      entityType: options.entityType,
      isDestructive: options.isDestructive ?? isDestructiveAction(options?.type),
      requiresConfirmation: options.requiresConfirmation,
    };

    let result: T;

    const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
      type: options.type,
      metadata,
      execute: async () => {
        result = await config?.execute();
        return result;
      },
      undo: async () => {
        await config?.undo(result!);
      },
      redo: config.redo,
      canUndo: () => true,
      canRedo: config.redo ? () => true : undefined,
    };

    return executeAction(action);
  }, [executeAction, config, options]);
}

export function useUndoableBatch<T>(module: string, description: string) {
  const { executeAction, startGroup, endGroup } = useUndo();

  const executeBatch = useCallback(
    async (
      actions: Array<{
        type: ActionType;
        category: ActionCategory;
        execute: () => Promise<T>;
        undo: (result: T) => Promise<void>;
        description?: string;
      }>,
    ): Promise<T[]> => {
      const groupId = startGroup(description);
      const results: T[] = [];

      try {
        for (const actionConfig of actions) {
          const metadata: ActionMetadata = {
            timestamp: Date.now(),
            module,
            description: actionConfig.description || description,
            category: actionConfig.category,
          };

          let actionResult: T;

          const action: Omit<
            UndoableAction<T>,
            "id" | "isUndone" | "result"
          > = {
            type: actionConfig.type,
            metadata,
            execute: async () => {
              actionResult = await actionConfig?.execute();
              return actionResult;
            },
            undo: async () => {
              await actionConfig?.undo(actionResult!);
            },
            canUndo: () => true,
          };

          const result = await executeAction(action);
          results?.push(result);
        }

        return results;
      } finally {
        endGroup(groupId);
      }
    },
    [executeAction, startGroup, endGroup, module, description],
  );

  return executeBatch;
}

export {
  useUndoableAction,
  useUndoableDelete,
  useUndoableCreate,
  useUndoableMove,
  useUndoableReorder,
  useUndoableUpdate,
  useUndoableSettingsChange,
  createUndoableAction,
} from "@/lib/undo/hooks";
