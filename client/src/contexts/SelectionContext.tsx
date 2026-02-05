import React, { createContext, useContext, useCallback, useMemo, ReactNode, useEffect } from 'react';
import { useBatchSelect, UseBatchSelectResult } from '@/hooks/useBatchSelect';

export interface SelectionItem {
  id: string;
  [key: string]: any;
}

export interface SelectionContextValue<T extends SelectionItem = SelectionItem> extends UseBatchSelectResult<string> {
  module: string;
  items: T[];
  selectedItems: T[];
  setItems: (items: T[]) => void;
  getItemById: (id: string) => T | undefined;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleItemClick: (id: string, e: React.MouseEvent) => void;
}

const SelectionContext = createContext<SelectionContextValue<any> | null>(null);

export interface SelectionProviderProps<T extends SelectionItem = SelectionItem> {
  children: ReactNode;
  module: string;
  initialItems?: T[];
  maxSelection?: number;
  onSelectionChange?: (selectedIds: string[], selectedItems: T[]) => void;
}

export function SelectionProvider<T extends SelectionItem = SelectionItem>({
  children,
  module,
  initialItems = [],
  maxSelection,
  onSelectionChange,
}: SelectionProviderProps<T>) {
  const [items, setItems] = React.useState<T[]>(initialItems);

  const handleSelectionChange = useCallback((selectedIds: string[]) => {
    if (onSelectionChange) {
      const selectedItems = items.filter(item => selectedIds.includes(item.id));
      onSelectionChange(selectedIds, selectedItems);
    }
  }, [items, onSelectionChange]);

  const batchSelect = useBatchSelect<string>({
    maxSelection,
    onSelectionChange: handleSelectionChange,
  });

  const selectedItems = useMemo(() => {
    return items.filter(item => batchSelect.selectedIds.has(item.id));
  }, [items, batchSelect.selectedIds]);

  const getItemById = useCallback((id: string) => {
    return items.find(item => item.id === id);
  }, [items]);

  const allIds = useMemo(() => items.map(item => item.id), [items]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      if (batchSelect.isAllSelected(allIds)) {
        batchSelect.deselectAll();
      } else {
        batchSelect.selectAll(allIds);
      }
    } else if (e.key === 'Escape') {
      batchSelect.clearSelection();
    }
  }, [batchSelect, allIds]);

  const handleItemClick = useCallback((id: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      batchSelect.toggleWithShift(id, allIds, true);
    } else if (e.ctrlKey || e.metaKey) {
      batchSelect.toggle(id);
    } else {
      batchSelect.setSelection([id]);
    }
  }, [batchSelect, allIds]);

  const contextValue = useMemo<SelectionContextValue<T>>(() => ({
    ...batchSelect,
    module,
    items,
    selectedItems,
    setItems,
    getItemById,
    handleKeyDown,
    handleItemClick,
  }), [batchSelect, module, items, selectedItems, getItemById, handleKeyDown, handleItemClick]);

  return (
    <SelectionContext.Provider value={contextValue}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelectionContext<T extends SelectionItem = SelectionItem>(): SelectionContextValue<T> {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelectionContext must be used within a SelectionProvider');
  }
  return context as SelectionContextValue<T>;
}

export function useOptionalSelectionContext<T extends SelectionItem = SelectionItem>(): SelectionContextValue<T> | null {
  return useContext(SelectionContext) as SelectionContextValue<T> | null;
}

export function withSelection<P extends object>(
  Component: React.ComponentType<P>,
  module: string
) {
  return function WrappedComponent(props: P) {
    return (
      <SelectionProvider module={module}>
        <Component {...props} />
      </SelectionProvider>
    );
  };
}

export function useSelectAllShortcut(containerRef: React.RefObject<HTMLElement>) {
  const context = useOptionalSelectionContext();
  
  useEffect(() => {
    if (!context || !containerRef.current) return;
    
    const container = containerRef.current;
    const handleKeyDown = (e: KeyboardEvent) => {
      context.handleKeyDown(e as unknown as React.KeyboardEvent);
    };
    
    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [context, containerRef]);
}
