import { useState, useCallback, useRef, useMemo, useEffect } from 'react';

export interface BatchSelectionState<T = string> {
  selectedIds: Set<T>;
  lastSelectedId: T | null;
  selectionOrder: T[];
}

export interface UseBatchSelectionOptions<T = string> {
  initialSelection?: T[];
  maxSelection?: number;
  onSelectionChange?: (selectedIds: T[], selectionOrder: T[]) => void;
  persistKey?: string;
}

export interface UseBatchSelectionResult<T = string> {
  selectedIds: Set<T>;
  selectedCount: number;
  selectionOrder: T[];
  isSelected: (id: T) => boolean;
  select: (id: T) => void;
  deselect: (id: T) => void;
  toggle: (id: T) => void;
  toggleWithShift: (id: T, allIds: T[], shiftKey: boolean) => void;
  selectAll: (ids: T[]) => void;
  deselectAll: () => void;
  selectRange: (startId: T, endId: T, allIds: T[]) => void;
  getSelectedItems: <I extends { id: T }>(items: I[]) => I[];
  clearSelection: () => void;
  setSelection: (ids: T[]) => void;
  isAllSelected: (ids: T[]) => boolean;
  isSomeSelected: (ids: T[]) => boolean;
  invertSelection: (allIds: T[]) => void;
  selectFirst: (allIds: T[], count: number) => void;
  selectLast: (allIds: T[], count: number) => void;
  getSelectionStats: (allIds: T[]) => {
    total: number;
    selected: number;
    unselected: number;
    percentage: number;
  };
}

export function useBatchSelection<T = string>(
  options: UseBatchSelectionOptions<T> = {}
): UseBatchSelectionResult<T> {
  const { initialSelection = [], onSelectionChange, maxSelection, persistKey } = options;
  
  const [selectedIds, setSelectedIds] = useState<Set<T>>(() => {
    if (persistKey && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(`batch_selection_${persistKey}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          return new Set(parsed);
        }
      } catch {
      }
    }
    return new Set(initialSelection);
  });
  
  const [selectionOrder, setSelectionOrder] = useState<T[]>(() => [...initialSelection]);
  const lastSelectedRef = useRef<T | null>(null);

  useEffect(() => {
    if (persistKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          `batch_selection_${persistKey}`,
          JSON.stringify(Array.from(selectedIds))
        );
      } catch {
      }
    }
  }, [selectedIds, persistKey]);

  const updateSelection = useCallback(
    (newSelection: Set<T>, newOrder?: T[]) => {
      setSelectedIds(newSelection);
      const order = newOrder || Array.from(newSelection);
      setSelectionOrder(order);
      onSelectionChange?.(Array.from(newSelection), order);
    },
    [onSelectionChange]
  );

  const isSelected = useCallback((id: T) => selectedIds.has(id), [selectedIds]);

  const select = useCallback(
    (id: T) => {
      if (maxSelection && selectedIds.size >= maxSelection) return;
      if (selectedIds.has(id)) return;
      
      const next = new Set(selectedIds);
      next.add(id);
      lastSelectedRef.current = id;
      updateSelection(next, [...selectionOrder, id]);
    },
    [selectedIds, maxSelection, updateSelection, selectionOrder]
  );

  const deselect = useCallback(
    (id: T) => {
      if (!selectedIds.has(id)) return;
      
      const next = new Set(selectedIds);
      next.delete(id);
      updateSelection(next, selectionOrder.filter(i => i !== id));
    },
    [selectedIds, updateSelection, selectionOrder]
  );

  const toggle = useCallback(
    (id: T) => {
      if (selectedIds.has(id)) {
        deselect(id);
      } else {
        select(id);
      }
    },
    [selectedIds, select, deselect]
  );

  const selectRange = useCallback(
    (startId: T, endId: T, allIds: T[]) => {
      const startIndex = allIds.indexOf(startId);
      const endIndex = allIds.indexOf(endId);

      if (startIndex === -1 || endIndex === -1) return;

      const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

      const rangeIds = allIds.slice(from, to + 1);
      const next = new Set(selectedIds);
      const newOrder = [...selectionOrder];

      for (const id of rangeIds) {
        if (!next.has(id) && (!maxSelection || next.size < maxSelection)) {
          next.add(id);
          newOrder.push(id);
        }
      }

      lastSelectedRef.current = endId;
      updateSelection(next, newOrder);
    },
    [selectedIds, maxSelection, updateSelection, selectionOrder]
  );

  const toggleWithShift = useCallback(
    (id: T, allIds: T[], shiftKey: boolean) => {
      if (shiftKey && lastSelectedRef.current !== null) {
        selectRange(lastSelectedRef.current, id, allIds);
      } else {
        toggle(id);
        lastSelectedRef.current = id;
      }
    },
    [toggle, selectRange]
  );

  const selectAll = useCallback(
    (ids: T[]) => {
      const idsToSelect = maxSelection ? ids.slice(0, maxSelection) : ids;
      updateSelection(new Set(idsToSelect), idsToSelect);
      if (idsToSelect.length > 0) {
        lastSelectedRef.current = idsToSelect[idsToSelect.length - 1];
      }
    },
    [maxSelection, updateSelection]
  );

  const deselectAll = useCallback(() => {
    updateSelection(new Set(), []);
    lastSelectedRef.current = null;
  }, [updateSelection]);

  const clearSelection = useCallback(() => {
    deselectAll();
  }, [deselectAll]);

  const setSelection = useCallback(
    (ids: T[]) => {
      const idsToSelect = maxSelection ? ids.slice(0, maxSelection) : ids;
      updateSelection(new Set(idsToSelect), idsToSelect);
    },
    [maxSelection, updateSelection]
  );

  const getSelectedItems = useCallback(
    <I extends { id: T }>(items: I[]): I[] => {
      return items.filter(item => selectedIds.has(item.id));
    },
    [selectedIds]
  );

  const isAllSelected = useCallback(
    (ids: T[]) => {
      if (ids.length === 0) return false;
      return ids.every(id => selectedIds.has(id));
    },
    [selectedIds]
  );

  const isSomeSelected = useCallback(
    (ids: T[]) => {
      if (ids.length === 0) return false;
      const selectedCount = ids.filter(id => selectedIds.has(id)).length;
      return selectedCount > 0 && selectedCount < ids.length;
    },
    [selectedIds]
  );

  const invertSelection = useCallback(
    (allIds: T[]) => {
      const next = new Set<T>();
      const newOrder: T[] = [];
      
      for (const id of allIds) {
        if (!selectedIds.has(id)) {
          if (!maxSelection || next.size < maxSelection) {
            next.add(id);
            newOrder.push(id);
          }
        }
      }
      
      updateSelection(next, newOrder);
    },
    [selectedIds, maxSelection, updateSelection]
  );

  const selectFirst = useCallback(
    (allIds: T[], count: number) => {
      const idsToSelect = allIds.slice(0, Math.min(count, maxSelection || Infinity));
      updateSelection(new Set(idsToSelect), idsToSelect);
    },
    [maxSelection, updateSelection]
  );

  const selectLast = useCallback(
    (allIds: T[], count: number) => {
      const start = Math.max(0, allIds.length - count);
      const idsToSelect = allIds.slice(start, Math.min(allIds.length, start + (maxSelection || Infinity)));
      updateSelection(new Set(idsToSelect), idsToSelect);
    },
    [maxSelection, updateSelection]
  );

  const getSelectionStats = useCallback(
    (allIds: T[]) => {
      const total = allIds.length;
      const selected = allIds.filter(id => selectedIds.has(id)).length;
      return {
        total,
        selected,
        unselected: total - selected,
        percentage: total > 0 ? Math.round((selected / total) * 100) : 0,
      };
    },
    [selectedIds]
  );

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  return {
    selectedIds,
    selectedCount,
    selectionOrder,
    isSelected,
    select,
    deselect,
    toggle,
    toggleWithShift,
    selectAll,
    deselectAll,
    selectRange,
    getSelectedItems,
    clearSelection,
    setSelection,
    isAllSelected,
    isSomeSelected,
    invertSelection,
    selectFirst,
    selectLast,
    getSelectionStats,
  };
}

export function useMultiSelectKeyboard<T = string>(
  batchSelection: UseBatchSelectionResult<T>,
  allIds: T[],
  focusedIndex: number
) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentId = allIds[focusedIndex];
      if (!currentId) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (e.shiftKey) {
            batchSelection.toggleWithShift(currentId, allIds, true);
          } else {
            batchSelection.toggle(currentId);
          }
          break;
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (batchSelection.isAllSelected(allIds)) {
              batchSelection.deselectAll();
            } else {
              batchSelection.selectAll(allIds);
            }
          }
          break;
        case 'i':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            batchSelection.invertSelection(allIds);
          }
          break;
        case 'Escape':
          batchSelection.clearSelection();
          break;
      }
    },
    [batchSelection, allIds, focusedIndex]
  );

  return { handleKeyDown };
}

export { useBatchSelect, useMultiSelectKeyboard as useMultiSelectKeyboardLegacy } from './useBatchSelect';
