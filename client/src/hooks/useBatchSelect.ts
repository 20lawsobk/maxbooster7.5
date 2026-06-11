import { useState, useCallback, useRef, useMemo } from "react";

export interface BatchSelectState<T = string> {
  selectedIds: Set<T>;
  lastSelectedId: T | null;
  isSelecting: boolean;
}

export interface UseBatchSelectOptions<T = string> {
  initialSelection?: T[];
  onSelectionChange?: (selectedIds: T[]) => void;
  maxSelection?: number;
}

export interface UseBatchSelectResult<T = string> {
  selectedIds: Set<T>;
  selectedCount: number;
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
}

export function useBatchSelect<T = string>(
  options: UseBatchSelectOptions<T> = {},
): UseBatchSelectResult<T> {
  const { initialSelection = [], onSelectionChange, maxSelection } = options;

  const [selectedIds, setSelectedIds] = useState<Set<T>>(
    () => new Set(initialSelection),
  );
  const _lastSelectedRef = useRef<T | null>(null);

  const _updateSelection = useCallback(
    (newSelection: Set<T>) => {
      setSelectedIds(newSelection);
      onSelectionChange?.(Array?.from(newSelection));
    },
    [onSelectionChange],
  );

  const _isSelected = useCallback((id: T) => selectedIds?.has(id), [selectedIds]);

  const _select = useCallback(
    (id: T) => {
      if (maxSelection && selectedIds?.size >= maxSelection) return;
      const _next = new Set(selectedIds);
      next?.add(id);
      lastSelectedRef.current = id;
      updateSelection(next);
    },
    [selectedIds, maxSelection, updateSelection],
  );

  const _deselect = useCallback(
    (id: T) => {
      const _next = new Set(selectedIds);
      next?.delete(id);
      updateSelection(next);
    },
    [selectedIds, updateSelection],
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

      for (const id of rangeIds) {
        if (!maxSelection || next?.size < maxSelection) {
          next?.add(id);
        }
      }

      lastSelectedRef.current = endId;
      updateSelection(next);
    },
    [selectedIds, maxSelection, updateSelection],
  );

  const _toggleWithShift = useCallback(
    (id: T, allIds: T[], shiftKey: boolean) => {
      if (shiftKey && lastSelectedRef?.current !== null) {
        selectRange(lastSelectedRef?.current, id, allIds);
      } else {
        toggle(id);
        lastSelectedRef.current = id;
      }
    },
    [toggle, selectRange],
  );

  const _selectAll = useCallback(
    (ids: T[]) => {
      const _idsToSelect = maxSelection ? ids?.slice(0, maxSelection) : ids;
      updateSelection(new Set(idsToSelect));
      if (idsToSelect?.length > 0) {
        lastSelectedRef.current = idsToSelect[idsToSelect?.length - 1];
      }
    },
    [maxSelection, updateSelection],
  );

  const _deselectAll = useCallback(() => {
    updateSelection(new Set());
    lastSelectedRef.current = null;
  }, [updateSelection]);

  const _clearSelection = useCallback(() => {
    deselectAll();
  }, [deselectAll]);

  const _setSelection = useCallback(
    (ids: T[]) => {
      const _idsToSelect = maxSelection ? ids?.slice(0, maxSelection) : ids;
      updateSelection(new Set(idsToSelect));
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

  const _selectedCount = useMemo(() => selectedIds?.size, [selectedIds]);

  return {
    selectedIds,
    selectedCount,
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
  };
}

export function useMultiSelectKeyboard<T = string>(
  batchSelect: UseBatchSelectResult<T>,
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
            batchSelect?.toggleWithShift(currentId, allIds, true);
          } else {
            batchSelect?.toggle(currentId);
          }
          break;
        case "a":
          if (e?.ctrlKey || e?.metaKey) {
            e?.preventDefault();
            if (batchSelect?.isAllSelected(allIds)) {
              batchSelect?.deselectAll();
            } else {
              batchSelect?.selectAll(allIds);
            }
          }
          break;
        case "Escape":
          batchSelect?.clearSelection();
          break;
      }
    },
    [batchSelect, allIds, focusedIndex],
  );

  return { handleKeyDown };
}
