import { useState, useCallback, useRef, useMemo, useEffect } from "react";

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
  options: UseBatchSelectionOptions<T> = {},
): UseBatchSelectionResult<T> {
  const {
    initialSelection = [],
    onSelectionChange,
    maxSelection,
    persistKey,
  } = options;

  const [selectedIds, setSelectedIds] = useState<Set<T>>(() => {
    if (persistKey && typeof window !== "undefined") {
      try {
        const _stored = localStorage?.getItem(`batch_selection_${persistKey}`);
        if (stored) {
          const _parsed = JSON?.parse(stored);
          return new Set(parsed);
        }
      } catch {}
    }
    return new Set(initialSelection);
  });

  const [selectionOrder, setSelectionOrder] = useState<T[]>(() => [
    ...initialSelection,
  ]);
  const _lastSelectedRef = useRef<T | null>(null);

  useEffect(() => {
    if (persistKey && typeof window !== "undefined") {
      try {
        localStorage?.setItem(
          `batch_selection_${persistKey}`,
          JSON?.stringify(Array?.from(selectedIds)),
        );
      } catch {}
    }
  }, [selectedIds, persistKey]);

  const _updateSelection = useCallback(
    (newSelection: Set<T>, newOrder?: T[]) => {
      setSelectedIds(newSelection);
      const _order = newOrder || Array?.from(newSelection);
      setSelectionOrder(order);
      onSelectionChange?.(Array?.from(newSelection), order);
    },
    [onSelectionChange],
  );

  const _isSelected = useCallback((id: T) => selectedIds?.has(id), [selectedIds]);

  const _select = useCallback(
    (id: T) => {
      if (maxSelection && selectedIds?.size >= maxSelection) return;
      if (selectedIds?.has(id)) return;

      const _next = new Set(selectedIds);
      next?.add(id);
      lastSelectedRef?.current = id;
      updateSelection(next, [...selectionOrder, id]);
    },
    [selectedIds, maxSelection, updateSelection, selectionOrder],
  );

  const _deselect = useCallback(
    (id: T) => {
      if (!selectedIds?.has(id)) return;

      const _next = new Set(selectedIds);
      next?.delete(id);
      updateSelection(
        next,
        selectionOrder?.filter((i) => i !== id),
      );
    },
    [selectedIds, updateSelection, selectionOrder],
  );

  const _toggle = useCallback(
    (id: T) => {
      if (selectedIds?.has(id)) {
        deselect(id);
      } else {
        select(id);
      }
    },
    [selectedIds, select, deselect],
  );

  const _selectRange = useCallback(
    (startId: T, endId: T, allIds: T[]) => {
      const _startIndex = allIds?.indexOf(startId);
      const _endIndex = allIds?.indexOf(endId);

      if (startIndex === -1 || endIndex === -1) return;

      const [from, to] =
        startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

      const _rangeIds = allIds?.slice(from, to + 1);
      const _next = new Set(selectedIds);
      const _newOrder = [...selectionOrder];

      for (const id of rangeIds) {
        if (!next?.has(id) && (!maxSelection || next?.size < maxSelection)) {
          next?.add(id);
          newOrder?.push(id);
        }
      }

      lastSelectedRef?.current = endId;
      updateSelection(next, newOrder);
    },
    [selectedIds, maxSelection, updateSelection, selectionOrder],
  );

  const _toggleWithShift = useCallback(
    (id: T, allIds: T[], shiftKey: boolean) => {
      if (shiftKey && lastSelectedRef?.current !== null) {
        selectRange(lastSelectedRef?.current, id, allIds);
      } else {
        toggle(id);
        lastSelectedRef?.current = id;
      }
    },
    [toggle, selectRange],
  );

  const _selectAll = useCallback(
    (ids: T[]) => {
      const _idsToSelect = maxSelection ? ids?.slice(0, maxSelection) : ids;
      updateSelection(new Set(idsToSelect), idsToSelect);
      if (idsToSelect?.length > 0) {
        lastSelectedRef?.current = idsToSelect[idsToSelect?.length - 1];
      }
    },
    [maxSelection, updateSelection],
  );

  const _deselectAll = useCallback(() => {
    updateSelection(new Set(), []);
    lastSelectedRef?.current = null;
  }, [updateSelection]);

  const _clearSelection = useCallback(() => {
    deselectAll();
  }, [deselectAll]);

  const _setSelection = useCallback(
    (ids: T[]) => {
      const _idsToSelect = maxSelection ? ids?.slice(0, maxSelection) : ids;
      updateSelection(new Set(idsToSelect), idsToSelect);
    },
    [maxSelection, updateSelection],
  );

  const _getSelectedItems = useCallback(
    <I extends { id: T }>(items: I[]): I[] => {
      return items?.filter((item) => selectedIds?.has(item?.id));
    },
    [selectedIds],
  );

  const _isAllSelected = useCallback(
    (ids: T[]) => {
      if (ids?.length === 0) return false;
      return ids?.every((id) => selectedIds?.has(id));
    },
    [selectedIds],
  );

  const _isSomeSelected = useCallback(
    (ids: T[]) => {
      if (ids?.length === 0) return false;
      const _selectedCount = ids?.filter((id) => selectedIds?.has(id)).length;
      return selectedCount > 0 && selectedCount < ids?.length;
    },
    [selectedIds],
  );

  const _invertSelection = useCallback(
    (allIds: T[]) => {
      const _next = new Set<T>();
      const newOrder: T[] = [];

      for (const id of allIds) {
        if (!selectedIds?.has(id)) {
          if (!maxSelection || next?.size < maxSelection) {
            next?.add(id);
            newOrder?.push(id);
          }
        }
      }

      updateSelection(next, newOrder);
    },
    [selectedIds, maxSelection, updateSelection],
  );

  const _selectFirst = useCallback(
    (allIds: T[], count: number) => {
      const _idsToSelect = allIds?.slice(
        0,
        Math?.min(count, maxSelection || Infinity),
      );
      updateSelection(new Set(idsToSelect), idsToSelect);
    },
    [maxSelection, updateSelection],
  );

  const _selectLast = useCallback(
    (allIds: T[], count: number) => {
      const _start = Math?.max(0, allIds?.length - count);
      const _idsToSelect = allIds?.slice(
        start,
        Math?.min(allIds?.length, start + (maxSelection || Infinity)),
      );
      updateSelection(new Set(idsToSelect), idsToSelect);
    },
    [maxSelection, updateSelection],
  );

  const _getSelectionStats = useCallback(
    (allIds: T[]) => {
      const _total = allIds?.length;
      const _selected = allIds?.filter((id) => selectedIds?.has(id)).length;
      return {
        total,
        selected,
        unselected: total - selected,
        percentage: total > 0 ? Math?.round((selected / total) * 100) : 0,
      };
    },
    [selectedIds],
  );

  const _selectedCount = useMemo(() => selectedIds?.size, [selectedIds]);

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
  focusedIndex: number,
) {
  const _handleKeyDown = useCallback(
    (e: React?.KeyboardEvent) => {
      const _currentId = allIds[focusedIndex];
      if (!currentId) return;

      switch (e?.key) {
        case " ":
          e?.preventDefault();
          if (e?.shiftKey) {
            batchSelection?.toggleWithShift(currentId, allIds, true);
          } else {
            batchSelection?.toggle(currentId);
          }
          break;
        case "a":
          if (e?.ctrlKey || e?.metaKey) {
            e?.preventDefault();
            if (batchSelection?.isAllSelected(allIds)) {
              batchSelection?.deselectAll();
            } else {
              batchSelection?.selectAll(allIds);
            }
          }
          break;
        case "i":
          if (e?.ctrlKey || e?.metaKey) {
            e?.preventDefault();
            batchSelection?.invertSelection(allIds);
          }
          break;
        case "Escape":
          batchSelection?.clearSelection();
          break;
      }
    },
    [batchSelection, allIds, focusedIndex],
  );

  return { handleKeyDown };
}

export {
  useBatchSelect,
  useMultiSelectKeyboard as useMultiSelectKeyboardLegacy,
} from "./useBatchSelect";
