import { useState, useCallback, useMemo, useRef, useEffect } from "react";

export interface SelectionItem {
  id: string;
  [key: string]: Record<string, unknown>;
}

export interface UseSelectionOptions<T extends SelectionItem = SelectionItem> {
  items?: T[];
  initialSelection?: string[];
  maxSelection?: number;
  onSelectionChange?: (selectedIds: string[], selectedItems: T[]) => void;
  persistKey?: string;
}

export interface UseSelectionResult<T extends SelectionItem = SelectionItem> {
  selectedIds: Set<string>;
  selectedItems: T[];
  selectedCount: number;
  isSelected: (id: string) => boolean;
  select: (id: string) => void;
  deselect: (id: string) => void;
  toggle: (id: string) => void;
  toggleWithShift: (id: string, shiftKey: boolean) => void;
  selectAll: () => void;
  deselectAll: () => void;
  selectRange: (startId: string, endId: string) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  isAllSelected: boolean;
  isSomeSelected: boolean;
  handleItemClick: (id: string, e: React.MouseEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  getCheckboxProps: (id: string) => {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    "aria-label": string;
  };
  getSelectAllProps: () => {
    checked: boolean;
    indeterminate: boolean;
    onCheckedChange: (checked: boolean) => void;
    "aria-label": string;
  };
}

export function useSelection<T extends SelectionItem = SelectionItem>(
  options: UseSelectionOptions<T> = {},
): UseSelectionResult<T> {
  const {
    items = [],
    initialSelection = [],
    maxSelection,
    onSelectionChange,
    persistKey,
  } = options;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (persistKey) {
      try {
        const stored = localStorage.getItem(`selection-${persistKey}`);
        if (stored) {
          return new Set(JSON.parse(stored));
        }
      } catch {}
    }
    return new Set(initialSelection);
  });

  const lastSelectedRef = useRef<string | null>(null);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  useEffect(() => {
    if (persistKey) {
      try {
        localStorage.setItem(
          `selection-${persistKey}`,
          JSON.stringify(Array.from(selectedIds)),
        );
      } catch {}
    }
  }, [selectedIds, persistKey]);

  const updateSelection = useCallback(
    (newSelection: Set<string>) => {
      setSelectedIds(newSelection);
      if (onSelectionChange) {
        const selectedItems = items.filter((item) => newSelection.has(item.id));
        onSelectionChange(Array.from(newSelection), selectedItems);
      }
    },
    [items, onSelectionChange],
  );

  const selectedItems = useMemo(() => {
    return items.filter((item) => selectedIds.has(item.id));
  }, [items, selectedIds]);

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  const isAllSelected = useMemo(() => {
    return itemIds.length > 0 && itemIds.every((id) => selectedIds.has(id));
  }, [itemIds, selectedIds]);

  const isSomeSelected = useMemo(() => {
    const count = itemIds.filter((id) => selectedIds.has(id)).length;
    return count > 0 && count < itemIds.length;
  }, [itemIds, selectedIds]);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const select = useCallback(
    (id: string) => {
      if (maxSelection && selectedIds.size >= maxSelection) return;
      const next = new Set(selectedIds);
      next.add(id);
      lastSelectedRef.current = id;
      updateSelection(next);
    },
    [selectedIds, maxSelection, updateSelection],
  );

  const deselect = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);
      next.delete(id);
      updateSelection(next);
    },
    [selectedIds, updateSelection],
  );

  const toggle = useCallback(
    (id: string) => {
      if (selectedIds.has(id)) {
        deselect(id);
      } else {
        select(id);
      }
    },
    [selectedIds, select, deselect],
  );

  const selectRange = useCallback(
    (startId: string, endId: string) => {
      const startIndex = itemIds.indexOf(startId);
      const endIndex = itemIds.indexOf(endId);

      if (startIndex === -1 || endIndex === -1) return;

      const [from, to] =
        startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

      const rangeIds = itemIds.slice(from, to + 1);
      const next = new Set(selectedIds);

      for (const id of rangeIds) {
        if (!maxSelection || next.size < maxSelection) {
          next.add(id);
        }
      }

      lastSelectedRef.current = endId;
      updateSelection(next);
    },
    [itemIds, selectedIds, maxSelection, updateSelection],
  );

  const toggleWithShift = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey && lastSelectedRef.current !== null) {
        selectRange(lastSelectedRef.current, id);
      } else {
        toggle(id);
        lastSelectedRef.current = id;
      }
    },
    [toggle, selectRange],
  );

  const selectAll = useCallback(() => {
    const idsToSelect = maxSelection ? itemIds.slice(0, maxSelection) : itemIds;
    updateSelection(new Set(idsToSelect));
    if (idsToSelect.length > 0) {
      lastSelectedRef.current = idsToSelect[idsToSelect.length - 1];
    }
  }, [itemIds, maxSelection, updateSelection]);

  const deselectAll = useCallback(() => {
    updateSelection(new Set());
    lastSelectedRef.current = null;
  }, [updateSelection]);

  const clearSelection = useCallback(() => {
    deselectAll();
  }, [deselectAll]);

  const setSelection = useCallback(
    (ids: string[]) => {
      const idsToSelect = maxSelection ? ids.slice(0, maxSelection) : ids;
      updateSelection(new Set(idsToSelect));
    },
    [maxSelection, updateSelection],
  );

  const handleItemClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.shiftKey) {
        toggleWithShift(id, true);
      } else if (e.ctrlKey || e.metaKey) {
        toggle(id);
      } else {
        setSelection([id]);
      }
    },
    [toggleWithShift, toggle, setSelection],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        if (isAllSelected) {
          deselectAll();
        } else {
          selectAll();
        }
      } else if (e.key === "Escape") {
        clearSelection();
      }
    },
    [isAllSelected, selectAll, deselectAll, clearSelection],
  );

  const getCheckboxProps = useCallback(
    (id: string) => ({
      checked: selectedIds.has(id),
      onCheckedChange: (checked: boolean) => {
        if (checked) {
          select(id);
        } else {
          deselect(id);
        }
      },
      "aria-label": `Select item ${id}`,
    }),
    [selectedIds, select, deselect],
  );

  const getSelectAllProps = useCallback(
    () => ({
      checked: isAllSelected,
      indeterminate: isSomeSelected,
      onCheckedChange: (checked: boolean) => {
        if (checked) {
          selectAll();
        } else {
          deselectAll();
        }
      },
      "aria-label": isAllSelected ? "Deselect all" : "Select all",
    }),
    [isAllSelected, isSomeSelected, selectAll, deselectAll],
  );

  return {
    selectedIds,
    selectedItems,
    selectedCount,
    isSelected,
    select,
    deselect,
    toggle,
    toggleWithShift,
    selectAll,
    deselectAll,
    selectRange,
    setSelection,
    clearSelection,
    isAllSelected,
    isSomeSelected,
    handleItemClick,
    handleKeyDown,
    getCheckboxProps,
    getSelectAllProps,
  };
}

export function useMultiSelectKeyboard<T extends SelectionItem = SelectionItem>(
  selection: UseSelectionResult<T>,
  focusedIndex: number,
  itemIds: string[],
) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentId = itemIds[focusedIndex];
      if (!currentId) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (e.shiftKey) {
            selection.toggleWithShift(currentId, true);
          } else {
            selection.toggle(currentId);
          }
          break;
        case "a":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (selection.isAllSelected) {
              selection.deselectAll();
            } else {
              selection.selectAll();
            }
          }
          break;
        case "Escape":
          selection.clearSelection();
          break;
      }
    },
    [selection, focusedIndex, itemIds],
  );

  return { handleKeyDown };
}

export function useSelectionShortcuts(
  containerRef: React.RefObject<HTMLElement>,
  selection: UseSelectionResult<unknown>,
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        if (selection.isAllSelected) {
          selection.deselectAll();
        } else {
          selection.selectAll();
        }
      } else if (e.key === "Escape") {
        selection.clearSelection();
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, selection]);
}
