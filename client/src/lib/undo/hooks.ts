import { useCallback } from "react";
import { useUndo } from "@/contexts/UndoContext";
import {
  UndoableAction,
  ActionType,
  ActionCategory,
  ActionMetadata,
  isDestructiveAction,
} from "./types";

export interface UseUndoableActionOptions {
  type: ActionType;
  category: ActionCategory;
  module: string;
  description?: string;
  entityId?: string;
  entityType?: string;
  isDestructive?: boolean;
  requiresConfirmation?: boolean;
}

export function useUndoableAction<T, Args extends unknown[]>(
  options: UseUndoableActionOptions,
  execute: (...args: Args) => Promise<T>,
  undo: (result: T, ...args: Args) => Promise<void>,
  redo?: (...args: Args) => Promise<T>,
) {
  const { executeAction } = useUndo();

  const performAction = useCallback(
    async (...args: Args): Promise<T> => {
      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module: options.module,
        description: options.description || `${options.type} action`,
        category: options.category,
        entityId: options.entityId,
        entityType: options.entityType,
        isDestructive:
          options.isDestructive ?? isDestructiveAction(options.type),
        requiresConfirmation: options.requiresConfirmation,
      };

      let actionResult: T;

      const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
        type: options.type,
        metadata,
        execute: async () => {
          actionResult = await execute(...args);
          return actionResult;
        },
        undo: async () => {
          await undo(actionResult!, ...args);
        },
        redo: redo ? async () => redo(...args) : undefined,
        canUndo: () => true,
        canRedo: redo ? () => true : undefined,
      };

      return executeAction(action);
    },
    [executeAction, execute, undo, redo, options],
  );

  return performAction;
}

export function useUndoableDelete<T>(
  module: string,
  entityType: string,
  deleteFn: (id: string) => Promise<T>,
  restoreFn: (id: string, data: T) => Promise<void>,
  _getDescription?: (id: string) => string,
) {
  return useUndoableAction<T, [string]>(
    {
      type: "delete",
      category: "CRUD",
      module,
      entityType,
      isDestructive: true,
      requiresConfirmation: true,
    },
    async (id: string) => deleteFn(id),
    async (result: T, id: string) => restoreFn(id, result),
    undefined,
  );
}

export function useUndoableCreate<T extends { id: string }>(
  module: string,
  entityType: string,
  createFn: (data: Omit<T, "id">) => Promise<T>,
  deleteFn: (id: string) => Promise<void>,
  getDescription?: (data: Omit<T, "id">) => string,
) {
  const { executeAction } = useUndo();

  const performCreate = useCallback(
    async (data: Omit<T, "id">): Promise<T> => {
      let createdEntity: T;

      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module,
        description: getDescription?.(data) || `Create ${entityType}`,
        category: "CRUD",
        entityType,
        newState: data,
      };

      const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
        type: "create",
        metadata,
        execute: async () => {
          createdEntity = await createFn(data);
          return createdEntity;
        },
        undo: async () => {
          if (createdEntity) {
            await deleteFn(createdEntity.id);
          }
        },
        redo: async () => {
          createdEntity = await createFn(data);
          return createdEntity;
        },
        canUndo: () => !!createdEntity,
        canRedo: () => true,
      };

      return executeAction(action);
    },
    [executeAction, createFn, deleteFn, module, entityType, getDescription],
  );

  return performCreate;
}

export function useUndoableMove<T>(
  module: string,
  entityType: string,
  moveFn: (id: string, newPosition: number) => Promise<T>,
  getDescription?: (id: string, newPosition: number) => string,
) {
  const { executeAction } = useUndo();

  const performMove = useCallback(
    async (
      id: string,
      fromPosition: number,
      toPosition: number,
    ): Promise<T> => {
      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module,
        description: getDescription?.(id, toPosition) || `Move ${entityType}`,
        category: "CRUD",
        entityId: id,
        entityType,
        previousState: { position: fromPosition },
        newState: { position: toPosition },
      };

      const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
        type: "move",
        metadata,
        execute: async () => moveFn(id, toPosition),
        undo: async () => {
          await moveFn(id, fromPosition);
        },
        redo: async () => moveFn(id, toPosition),
        canUndo: () => true,
        canRedo: () => true,
      };

      return executeAction(action);
    },
    [executeAction, moveFn, module, entityType, getDescription],
  );

  return performMove;
}

export function useUndoableReorder<T>(
  module: string,
  entityType: string,
  reorderFn: (ids: string[]) => Promise<T>,
  getDescription?: () => string,
) {
  const { executeAction } = useUndo();

  const performReorder = useCallback(
    async (previousOrder: string[], newOrder: string[]): Promise<T> => {
      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module,
        description: getDescription?.() || `Reorder ${entityType}`,
        category: "CRUD",
        entityType,
        previousState: previousOrder,
        newState: newOrder,
      };

      const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
        type: "move",
        metadata,
        execute: async () => reorderFn(newOrder),
        undo: async () => {
          await reorderFn(previousOrder);
        },
        redo: async () => reorderFn(newOrder),
        canUndo: () => true,
        canRedo: () => true,
      };

      return executeAction(action);
    },
    [executeAction, reorderFn, module, entityType, getDescription],
  );

  return performReorder;
}

export function useUndoableUpdate<T>(
  module: string,
  entityType: string,
  updateFn: (id: string, newData: Partial<T>) => Promise<T>,
  revertFn: (id: string, previousData: T) => Promise<void>,
  getDescription?: (id: string) => string,
) {
  const { executeAction } = useUndo();

  const performUpdate = useCallback(
    async (id: string, newData: Partial<T>, previousData: T): Promise<T> => {
      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module,
        description: getDescription?.(id) || `Update ${entityType}`,
        category: "CRUD",
        entityId: id,
        entityType,
        previousState: previousData,
        newState: newData,
      };

      const action: Omit<UndoableAction<T>, "id" | "isUndone" | "result"> = {
        type: "update",
        metadata,
        execute: async () => updateFn(id, newData),
        undo: async () => revertFn(id, previousData),
        redo: async () => updateFn(id, newData),
        canUndo: () => true,
        canRedo: () => true,
      };

      return executeAction(action);
    },
    [executeAction, updateFn, revertFn, module, entityType, getDescription],
  );

  return performUpdate;
}

export function useUndoableSettingsChange<T extends Record<string, unknown>>(
  module: string,
  updateSettingsFn: (settings: Partial<T>) => Promise<T>,
  revertSettingsFn: (previousSettings: T) => Promise<void>,
) {
  const { executeAction } = useUndo();

  const changeSettings = useCallback(
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
    [executeAction, updateSettingsFn, revertSettingsFn, module],
  );

  return changeSettings;
}

export interface WithUndoProps {
  onUndo?: () => void;
  onRedo?: () => void;
}

export function createUndoableAction<T>(
  type: ActionType,
  metadata: Omit<ActionMetadata, "timestamp">,
  execute: () => Promise<T>,
  undo: () => Promise<void>,
  redo?: () => Promise<T>,
): Omit<UndoableAction<T>, "id" | "isUndone" | "result"> {
  return {
    type,
    metadata: {
      ...metadata,
      timestamp: Date.now(),
    },
    execute,
    undo,
    redo,
    canUndo: () => true,
    canRedo: redo ? () => true : undefined,
  };
}
