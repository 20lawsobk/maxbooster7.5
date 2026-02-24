import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { Checkbox } from '@/components/ui/checkbox';
import { useBatchSelectContext, useOptionalBatchSelectContext } from './BatchSelectProvider';

export interface SelectAllCheckboxProps {
  ids?: string[];
  label?: string;
  showLabel?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

export function SelectAllCheckbox({
  ids,
  label,
  showLabel = true,
  className,
  size = 'md',
  disabled = false,
}: SelectAllCheckboxProps) {
  const context = useOptionalBatchSelectContext();
  const checkboxRef = useRef<HTMLButtonElement>(null);

  if (!context) {
    logger.warn('SelectAllCheckbox: Must be used within BatchSelectProvider');
    return null;
  }

  const { selectAll, deselectAll, isAllSelected, isSomeSelected, allIds, selectedCount } = context;
  
  const targetIds = ids || allIds;
  const allSelected = isAllSelected(targetIds);
  const someSelected = isSomeSelected(targetIds);
  const isIndeterminate = someSelected && !allSelected;

  useEffect(() => {
    if (checkboxRef.current) {
      const nativeInput = checkboxRef.current.querySelector('input[type="checkbox"]');
      if (nativeInput) {
        (nativeInput as HTMLInputElement).indeterminate = isIndeterminate;
      }
    }
  }, [isIndeterminate]);

  const handleChange = () => {
    if (allSelected || someSelected) {
      deselectAll();
    } else {
      selectAll(targetIds);
    }
  };

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const labelSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const displayLabel = label || (allSelected ? 'Deselect all' : 'Select all');

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Checkbox
        ref={checkboxRef}
        checked={allSelected}
        onCheckedChange={handleChange}
        disabled={disabled || targetIds.length === 0}
        aria-label={displayLabel}
        className={cn(sizeClasses[size])}
        data-indeterminate={isIndeterminate}
      />
      {showLabel && (
        <label
          className={cn(
            'cursor-pointer text-muted-foreground select-none',
            labelSizeClasses[size],
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          onClick={() => !disabled && handleChange()}
        >
          {displayLabel}
          {targetIds.length > 0 && (
            <span className="ml-1 text-muted-foreground/70">
              ({selectedCount}/{targetIds.length})
            </span>
          )}
        </label>
      )}
    </div>
  );
}

export function StandaloneSelectAllCheckbox({
  allIds,
  selectedIds,
  onSelectAll,
  onDeselectAll,
  label,
  showLabel = true,
  className,
  size = 'md',
  disabled = false,
}: {
  allIds: string[];
  selectedIds: Set<string> | string[];
  onSelectAll: (ids: string[]) => void;
  onDeselectAll: () => void;
  label?: string;
  showLabel?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}) {
  const checkboxRef = useRef<HTMLButtonElement>(null);
  
  const selectedSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const selectedCount = selectedSet.size;
  const allSelected = allIds.length > 0 && allIds.every(id => selectedSet.has(id));
  const someSelected = selectedCount > 0 && selectedCount < allIds.length;
  const isIndeterminate = someSelected;

  useEffect(() => {
    if (checkboxRef.current) {
      const nativeInput = checkboxRef.current.querySelector('input[type="checkbox"]');
      if (nativeInput) {
        (nativeInput as HTMLInputElement).indeterminate = isIndeterminate;
      }
    }
  }, [isIndeterminate]);

  const handleChange = () => {
    if (allSelected || someSelected) {
      onDeselectAll();
    } else {
      onSelectAll(allIds);
    }
  };

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const labelSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const displayLabel = label || (allSelected ? 'Deselect all' : 'Select all');

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Checkbox
        ref={checkboxRef}
        checked={allSelected}
        onCheckedChange={handleChange}
        disabled={disabled || allIds.length === 0}
        aria-label={displayLabel}
        className={cn(sizeClasses[size])}
        data-indeterminate={isIndeterminate}
      />
      {showLabel && (
        <label
          className={cn(
            'cursor-pointer text-muted-foreground select-none',
            labelSizeClasses[size],
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          onClick={() => !disabled && handleChange()}
        >
          {displayLabel}
          {allIds.length > 0 && (
            <span className="ml-1 text-muted-foreground/70">
              ({selectedCount}/{allIds.length})
            </span>
          )}
        </label>
      )}
    </div>
  );
}
