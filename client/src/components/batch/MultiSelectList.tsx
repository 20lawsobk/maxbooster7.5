import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { useBatchSelectContext, useOptionalBatchSelectContext } from './BatchSelectProvider';

export interface MultiSelectListProps<T extends { id: string }> {
  items: T[];
  renderItem: (item: T, isSelected: boolean, index: number) => React.ReactNode;
  keyExtractor?: (item: T) => string;
  className?: string;
  itemClassName?: string;
  showCheckboxes?: boolean;
  enableKeyboardNavigation?: boolean;
  enableShiftSelect?: boolean;
  onItemClick?: (item: T) => void;
  getItemLabel?: (item: T) => string;
  emptyState?: React.ReactNode;
}

export function MultiSelectList<T extends { id: string }>({
  items,
  renderItem,
  keyExtractor = (item) => item.id,
  className,
  itemClassName,
  showCheckboxes = true,
  enableKeyboardNavigation = true,
  enableShiftSelect = true,
  onItemClick,
  getItemLabel,
  emptyState,
}: MultiSelectListProps<T>) {
  const batchSelect = useBatchSelectContext();
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const { isSelected, toggleWithShift, selectAll, deselectAll, isAllSelected, isSomeSelected, setAllIds } = batchSelect;
  const allIds = items.map(item => keyExtractor(item));

  useEffect(() => {
    setAllIds(allIds);
  }, [allIds.join(','), setAllIds]);

  const handleItemClick = useCallback((item: T, index: number, e: React.MouseEvent) => {
    setFocusedIndex(index);
    
    if (e.ctrlKey || e.metaKey || showCheckboxes) {
      toggleWithShift(keyExtractor(item), allIds, e.shiftKey && enableShiftSelect);
    } else {
      onItemClick?.(item);
    }
  }, [toggleWithShift, allIds, enableShiftSelect, onItemClick, keyExtractor, showCheckboxes]);

  const handleCheckboxChange = useCallback((item: T, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWithShift(keyExtractor(item), allIds, e.shiftKey && enableShiftSelect);
  }, [toggleWithShift, allIds, enableShiftSelect, keyExtractor]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!enableKeyboardNavigation) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        break;
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          const item = items[focusedIndex];
          toggleWithShift(keyExtractor(item), allIds, e.shiftKey);
        }
        break;
      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (isAllSelected(allIds)) {
            deselectAll();
          } else {
            selectAll(allIds);
          }
        }
        break;
      case 'Escape':
        deselectAll();
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        break;
    }
  }, [enableKeyboardNavigation, items, focusedIndex, toggleWithShift, allIds, isAllSelected, deselectAll, selectAll, keyExtractor]);

  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < items.length) {
      const item = items[focusedIndex];
      const ref = itemRefs.current.get(keyExtractor(item));
      ref?.focus();
    }
  }, [focusedIndex, items, keyExtractor]);

  if (items.length === 0) {
    return emptyState || null;
  }

  const allSelected = isAllSelected(allIds);
  const someSelected = isSomeSelected(allIds);

  return (
    <div
      ref={listRef}
      className={cn('space-y-1', className)}
      role="listbox"
      aria-multiselectable="true"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {showCheckboxes && items.length > 0 && (
        <div className="flex items-center gap-3 py-2 px-3 border-b">
          <Checkbox
            checked={allSelected}
            ref={(el) => {
              if (el) {
                (el as any).indeterminate = someSelected;
              }
            }}
            onCheckedChange={() => {
              if (allSelected || someSelected) {
                deselectAll();
              } else {
                selectAll(allIds);
              }
            }}
            aria-label="Select all items"
          />
          <span className="text-sm text-muted-foreground">
            {allSelected ? 'Deselect all' : 'Select all'} ({items.length} items)
          </span>
        </div>
      )}

      {items.map((item, index) => {
        const id = keyExtractor(item);
        const selected = isSelected(id);
        const isFocused = index === focusedIndex;
        const label = getItemLabel?.(item) || id;

        return (
          <div
            key={id}
            ref={(el) => {
              if (el) {
                itemRefs.current.set(id, el);
              } else {
                itemRefs.current.delete(id);
              }
            }}
            role="option"
            aria-selected={selected}
            aria-label={label}
            tabIndex={isFocused ? 0 : -1}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
              'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              selected && 'bg-muted',
              isFocused && 'ring-2 ring-ring',
              itemClassName
            )}
            onClick={(e) => handleItemClick(item, index, e)}
          >
            {showCheckboxes && (
              <Checkbox
                checked={selected}
                onClick={(e) => handleCheckboxChange(item, e)}
                aria-hidden="true"
                tabIndex={-1}
              />
            )}
            <div className="flex-1 min-w-0">
              {renderItem(item, selected, index)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface SelectableCardProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  showCheckbox?: boolean;
}

export function SelectableCard({
  id,
  children,
  className,
  showCheckbox = true,
}: SelectableCardProps) {
  const batchSelect = useOptionalBatchSelectContext();
  
  if (!batchSelect) {
    return <div className={className}>{children}</div>;
  }

  const { isSelected, toggle, toggleWithShift, allIds } = batchSelect;
  const selected = isSelected(id);

  return (
    <div
      role="option"
      aria-selected={selected}
      className={cn(
        'relative transition-colors rounded-lg',
        selected && 'ring-2 ring-primary',
        className
      )}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || showCheckbox) {
          toggleWithShift(id, allIds, e.shiftKey);
        }
      }}
    >
      {showCheckbox && (
        <div className="absolute top-3 left-3 z-10">
          <Checkbox
            checked={selected}
            onClick={(e) => {
              e.stopPropagation();
              toggle(id);
            }}
          />
        </div>
      )}
      {children}
    </div>
  );
}
