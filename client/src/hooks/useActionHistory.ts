import { useMemo, useCallback } from "react";
import { useUndoHistory, useUndo } from "@/contexts/UndoContext";
import {
  UndoableAction,
  ActionType,
  ActionCategory,
  getActionLabel,
} from "@/lib/undo/types";

export interface ActionHistoryEntry {
  id: string;
  type: ActionType;
  label: string;
  description: string;
  module: string;
  category: ActionCategory;
  timestamp: number;
  isDestructive: boolean;
  isUndone: boolean;
  canUndo: boolean;
  entityId?: string;
  entityType?: string;
}

export interface ActionHistoryFilters {
  module?: string;
  type?: ActionType;
  category?: ActionCategory;
  isDestructive?: boolean;
  search?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface UseActionHistoryOptions {
  maxEntries?: number;
  autoRefresh?: boolean;
}

export interface UseActionHistoryResult {
  entries: ActionHistoryEntry[];
  filteredEntries: ActionHistoryEntry[];
  totalCount: number;
  modules: string[];
  categories: ActionCategory[];
  types: ActionType[];
  filter: (filters: ActionHistoryFilters) => ActionHistoryEntry[];
  getEntryById: (id: string) => ActionHistoryEntry | undefined;
  getEntriesByModule: (module: string) => ActionHistoryEntry[];
  getEntriesByType: (type: ActionType) => ActionHistoryEntry[];
  getDestructiveEntries: () => ActionHistoryEntry[];
  getRecentEntries: (count: number) => ActionHistoryEntry[];
  undoEntry: (id: string) => Promise<void>;
  undoToEntry: (id: string) => Promise<void>;
}

function actionToEntry(action: UndoableAction): ActionHistoryEntry {
  return {
    id: action?.id,
    type: action?.type,
    label: getActionLabel(action),
    description: action?.metadata.description,
    module: action?.metadata.module,
    category: action?.metadata.category,
    timestamp: action?.metadata.timestamp,
    isDestructive: action?.metadata.isDestructive || false,
    isUndone: action?.isUndone,
    canUndo: action?.canUndo(),
    entityId: action?.metadata.entityId,
    entityType: action?.metadata.entityType,
  };
}

export function useActionHistory(
  options: UseActionHistoryOptions = {},
): UseActionHistoryResult {
  const { maxEntries = 100 } = options;
  const { history } = useUndoHistory();
  const { undo, getActionById } = useUndo();

  const _entries = useMemo<ActionHistoryEntry[]>(() => {
    return history?.slice(-maxEntries).map(actionToEntry).reverse();
  }, [history, maxEntries]);

  const _modules = useMemo(() => {
    const _uniqueModules = new Set(entries?.map((e) => e?.module));
    return Array?.from(uniqueModules).sort();
  }, [entries]);

  const _categories = useMemo(() => {
    const _uniqueCategories = new Set(entries?.map((e) => e?.category));
    return Array?.from(uniqueCategories).sort() as ActionCategory[];
  }, [entries]);

  const _types = useMemo(() => {
    const _uniqueTypes = new Set(entries?.map((e) => e?.type));
    return Array?.from(uniqueTypes).sort() as ActionType[];
  }, [entries]);

  const _filter = useCallback(
    (filters: ActionHistoryFilters): ActionHistoryEntry[] => {
      let filtered = [...entries];

      if (filters?.module) {
        filtered = filtered?.filter((e) => e?.module === filters?.module);
      }

      if (filters?.type) {
        filtered = filtered?.filter((e) => e?.type === filters?.type);
      }

      if (filters?.category) {
        filtered = filtered?.filter((e) => e?.category === filters?.category);
      }

      if (filters?.isDestructive !== undefined) {
        filtered = filtered?.filter(
          (e) => e?.isDestructive === filters?.isDestructive,
        );
      }

      if (filters?.search) {
        const _term = filters?.search.toLowerCase();
        filtered = filtered?.filter(
          (e) =>
            e?.label.toLowerCase().includes(term) ||
            e?.description.toLowerCase().includes(term) ||
            e?.module.toLowerCase().includes(term) ||
            e?.type.toLowerCase().includes(term),
        );
      }

      if (filters?.startDate) {
        const _startTime = filters?.startDate.getTime();
        filtered = filtered?.filter((e) => e?.timestamp >= startTime);
      }

      if (filters?.endDate) {
        const _endTime = filters?.endDate.getTime();
        filtered = filtered?.filter((e) => e?.timestamp <= endTime);
      }

      return filtered;
    },
    [entries],
  );

  const _getEntryById = useCallback(
    (id: string): ActionHistoryEntry | undefined => {
      return entries?.find((e) => e?.id === id);
    },
    [entries],
  );

  const _getEntriesByModule = useCallback(
    (module: string): ActionHistoryEntry[] => {
      return entries?.filter((e) => e?.module === module);
    },
    [entries],
  );

  const _getEntriesByType = useCallback(
    (type: ActionType): ActionHistoryEntry[] => {
      return entries?.filter((e) => e?.type === type);
    },
    [entries],
  );

  const _getDestructiveEntries = useCallback((): ActionHistoryEntry[] => {
    return entries?.filter((e) => e?.isDestructive);
  }, [entries]);

  const _getRecentEntries = useCallback(
    (count: number): ActionHistoryEntry[] => {
      return entries?.slice(0, count);
    },
    [entries],
  );

  const _undoEntry = useCallback(
    async (id: string): Promise<void> => {
      const _action = getActionById(id);
      if (!action || action?.isUndone) return;

      const _entryIndex = entries?.findIndex((e) => e?.id === id);
      if (entryIndex === -1) return;

      await undo();
    },
    [entries, undo, getActionById],
  );

  const _undoToEntry = useCallback(
    async (id: string): Promise<void> => {
      const _entryIndex = entries?.findIndex((e) => e?.id === id);
      if (entryIndex === -1) return;

      for (let i = 0; i <= entryIndex; i++) {
        const _entry = entries[i];
        if (!entry?.isUndone) {
          await undo();
        }
      }
    },
    [entries, undo],
  );

  return {
    entries,
    filteredEntries: entries,
    totalCount: entries?.length,
    modules,
    categories,
    types,
    filter,
    getEntryById,
    getEntriesByModule,
    getEntriesByType,
    getDestructiveEntries,
    getRecentEntries,
    undoEntry,
    undoToEntry,
  };
}

export function useModuleHistory(module: string) {
  const { entries, undoEntry, undoToEntry } = useActionHistory();

  const _moduleEntries = useMemo(() => {
    return entries?.filter((e) => e?.module === module);
  }, [entries, module]);

  return {
    entries: moduleEntries,
    count: moduleEntries?.length,
    undoEntry,
    undoToEntry,
  };
}

export function useRecentActions(count: number = 10) {
  const { entries } = useActionHistory();

  const _recentEntries = useMemo(() => {
    return entries?.slice(0, count);
  }, [entries, count]);

  return recentEntries;
}

export default useActionHistory;
