import { useCallback } from 'react';
import { useUndo } from '@/contexts/UndoContext';
import {
  UndoableAction,
  ActionType,
  ActionCategory,
  ActionMetadata,
  isDestructiveAction,
} from '@/lib/undo/types';
import { apiRequest } from '@/lib/queryClient';

export interface UseUndoableActionOptions {
  type: ActionType;
  category: ActionCategory;
  module: string;
  description?: string;
  entityId?: string;
  entityType?: string;
  isDestructive?: boolean;
  requiresConfirmation?: boolean;
  syncToBackend?: boolean;
}

export function useUndoableAction<T, Args extends unknown[]>(
  options: UseUndoableActionOptions,
  execute: (...args: Args) => Promise<T>,
  undo: (result: T, ...args: Args) => Promise<void>,
  redo?: (...args: Args) => Promise<T>
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
        isDestructive: options.isDestructive ?? isDestructiveAction(options.type),
        requiresConfirmation: options.requiresConfirmation,
      };

      let actionResult: T;

      const action: Omit<UndoableAction<T>, 'id' | 'isUndone' | 'result'> = {
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

      const result = await executeAction(action);

      if (options.syncToBackend) {
        try {
          await apiRequest('POST', '/api/undo/track-action', {
            type: options.type,
            category: options.category,
            module: options.module,
            description: metadata.description,
            entityId: options.entityId,
            entityType: options.entityType,
            isDestructive: metadata.isDestructive,
          });
        } catch (error) {
          console.warn('Failed to sync action to backend:', error);
        }
      }

      return result;
    },
    [executeAction, execute, undo, redo, options]
  );

  return performAction;
}

export function useUndoableDelete<T>(
  module: string,
  entityType: string,
  deleteFn: (id: string) => Promise<T>,
  restoreFn: (id: string, data: T) => Promise<void>,
  options?: { syncToBackend?: boolean; getDescription?: (id: string) => string }
) {
  return useUndoableAction<T, [string]>(
    {
      type: 'delete',
      category: 'CRUD',
      module,
      entityType,
      isDestructive: true,
      requiresConfirmation: true,
      syncToBackend: options?.syncToBackend,
    },
    async (id: string) => deleteFn(id),
    async (result: T, id: string) => restoreFn(id, result),
    undefined
  );
}

export function useUndoableCreate<T extends { id: string }>(
  module: string,
  entityType: string,
  createFn: (data: Omit<T, 'id'>) => Promise<T>,
  deleteFn: (id: string) => Promise<void>,
  options?: { syncToBackend?: boolean; getDescription?: (data: Omit<T, 'id'>) => string }
) {
  const { executeAction } = useUndo();

  const performCreate = useCallback(
    async (data: Omit<T, 'id'>): Promise<T> => {
      let createdEntity: T;

      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module,
        description: options?.getDescription?.(data) || `Create ${entityType}`,
        category: 'CRUD',
        entityType,
        newState: data,
      };

      const action: Omit<UndoableAction<T>, 'id' | 'isUndone' | 'result'> = {
        type: 'create',
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

      const result = await executeAction(action);

      if (options?.syncToBackend) {
        try {
          await apiRequest('POST', '/api/undo/track-action', {
            type: 'create',
            category: 'CRUD',
            module,
            description: metadata.description,
            entityType,
          });
        } catch (error) {
          console.warn('Failed to sync action to backend:', error);
        }
      }

      return result;
    },
    [executeAction, createFn, deleteFn, module, entityType, options]
  );

  return performCreate;
}

export function useUndoableUpdate<T>(
  module: string,
  entityType: string,
  updateFn: (id: string, newData: Partial<T>) => Promise<T>,
  revertFn: (id: string, previousData: T) => Promise<void>,
  options?: { syncToBackend?: boolean; getDescription?: (id: string) => string }
) {
  const { executeAction } = useUndo();

  const performUpdate = useCallback(
    async (id: string, newData: Partial<T>, previousData: T): Promise<T> => {
      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module,
        description: options?.getDescription?.(id) || `Update ${entityType}`,
        category: 'CRUD',
        entityId: id,
        entityType,
        previousState: previousData,
        newState: newData,
      };

      const action: Omit<UndoableAction<T>, 'id' | 'isUndone' | 'result'> = {
        type: 'update',
        metadata,
        execute: async () => updateFn(id, newData),
        undo: async () => revertFn(id, previousData),
        redo: async () => updateFn(id, newData),
        canUndo: () => true,
        canRedo: () => true,
      };

      const result = await executeAction(action);

      if (options?.syncToBackend) {
        try {
          await apiRequest('POST', '/api/undo/track-action', {
            type: 'update',
            category: 'CRUD',
            module,
            description: metadata.description,
            entityId: id,
            entityType,
            previousState: previousData,
            newState: newData,
          });
        } catch (error) {
          console.warn('Failed to sync action to backend:', error);
        }
      }

      return result;
    },
    [executeAction, updateFn, revertFn, module, entityType, options]
  );

  return performUpdate;
}

export function useUndoableSettingsChange<T extends Record<string, unknown>>(
  module: string,
  updateSettingsFn: (settings: Partial<T>) => Promise<T>,
  revertSettingsFn: (previousSettings: T) => Promise<void>,
  options?: { syncToBackend?: boolean }
) {
  const { executeAction } = useUndo();

  const changeSettings = useCallback(
    async (newSettings: Partial<T>, previousSettings: T, description?: string): Promise<T> => {
      const metadata: ActionMetadata = {
        timestamp: Date.now(),
        module,
        description: description || 'Settings changed',
        category: 'settings',
        previousState: previousSettings,
        newState: newSettings,
      };

      const action: Omit<UndoableAction<T>, 'id' | 'isUndone' | 'result'> = {
        type: 'settings_change',
        metadata,
        execute: async () => updateSettingsFn(newSettings),
        undo: async () => revertSettingsFn(previousSettings),
        redo: async () => updateSettingsFn(newSettings),
        canUndo: () => true,
        canRedo: () => true,
      };

      const result = await executeAction(action);

      if (options?.syncToBackend) {
        try {
          await apiRequest('POST', '/api/undo/track-action', {
            type: 'settings_change',
            category: 'settings',
            module,
            description: metadata.description,
            previousState: previousSettings,
            newState: newSettings,
          });
        } catch (error) {
          console.warn('Failed to sync action to backend:', error);
        }
      }

      return result;
    },
    [executeAction, updateSettingsFn, revertSettingsFn, module, options]
  );

  return changeSettings;
}

export function useUndoableBatch(module: string) {
  const { executeAction, startGroup, endGroup } = useUndo();

  const executeBatch = useCallback(
    async <T>(
      description: string,
      operations: Array<{
        execute: () => Promise<T>;
        undo: () => Promise<void>;
        redo?: () => Promise<T>;
      }>
    ): Promise<T[]> => {
      const groupId = startGroup(description);
      const results: T[] = [];

      try {
        for (const op of operations) {
          const metadata: ActionMetadata = {
            timestamp: Date.now(),
            module,
            description,
            category: 'CRUD',
          };

          const action: Omit<UndoableAction<T>, 'id' | 'isUndone' | 'result'> = {
            type: 'batch',
            metadata,
            execute: op.execute,
            undo: op.undo,
            redo: op.redo,
            canUndo: () => true,
            canRedo: op.redo ? () => true : undefined,
            groupId,
          };

          const result = await executeAction(action);
          results.push(result);
        }
      } finally {
        endGroup(groupId);
      }

      return results;
    },
    [executeAction, startGroup, endGroup, module]
  );

  return executeBatch;
}

export function useUndoableFileDelete(
  deleteFn: (fileId: string) => Promise<{ id: string; name: string; data: unknown }>,
  restoreFn: (fileId: string, fileData: unknown) => Promise<void>,
  options?: { syncToBackend?: boolean }
) {
  return useUndoableAction<{ id: string; name: string; data: unknown }, [string]>(
    {
      type: 'file_delete',
      category: 'file',
      module: 'files',
      entityType: 'file',
      isDestructive: true,
      requiresConfirmation: true,
      syncToBackend: options?.syncToBackend,
    },
    async (fileId: string) => deleteFn(fileId),
    async (result, fileId: string) => restoreFn(fileId, result.data),
    undefined
  );
}

export function useUndoablePostDelete(
  deleteFn: (postId: string) => Promise<{ id: string; content: unknown }>,
  restoreFn: (postId: string, postData: unknown) => Promise<void>,
  options?: { syncToBackend?: boolean }
) {
  return useUndoableAction<{ id: string; content: unknown }, [string]>(
    {
      type: 'post_delete',
      category: 'social',
      module: 'social',
      entityType: 'post',
      isDestructive: true,
      requiresConfirmation: true,
      syncToBackend: options?.syncToBackend,
    },
    async (postId: string) => deleteFn(postId),
    async (result, postId: string) => restoreFn(postId, result.content),
    undefined
  );
}

export function useUndoableTrackRemove(
  removeFn: (trackId: string) => Promise<{ id: string; data: unknown }>,
  restoreFn: (trackId: string, trackData: unknown) => Promise<void>,
  options?: { syncToBackend?: boolean }
) {
  return useUndoableAction<{ id: string; data: unknown }, [string]>(
    {
      type: 'track_remove',
      category: 'track',
      module: 'studio',
      entityType: 'track',
      isDestructive: true,
      requiresConfirmation: true,
      syncToBackend: options?.syncToBackend,
    },
    async (trackId: string) => removeFn(trackId),
    async (result, trackId: string) => restoreFn(trackId, result.data),
    undefined
  );
}

export default useUndoableAction;
