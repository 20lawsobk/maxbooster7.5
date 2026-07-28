import React, { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useBatchSelectContext,
  useOptionalBatchSelectContext,
} from "./BatchSelectProvider";

export interface BatchSelectorProps {
  id: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  showHoverState?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
}

export function BatchSelector({
  id,
  disabled = false,
  className,
  size = "md",
  showHoverState = true,
  onSelect,
}: BatchSelectorProps) {
  const context = useBatchSelectContext();
  const isSelected = context.isSelected(id);

  const handleChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        context.select(id);
      } else {
        context.deselect(id);
      }
      onSelect?.(id, checked);
    },
    [context, id, onSelect],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.shiftKey) {
        context.toggleWithShift(id, context.allIds, true);
      } else {
        context.toggle(id);
      }
      onSelect?.(id, !isSelected);
    },
    [context, id, isSelected, onSelect],
  );

  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        showHoverState &&
          !isSelected &&
          "opacity-0 group-hover:opacity-100 transition-opacity",
        isSelected && "opacity-100",
        className,
      )}
      onClick={handleClick}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={handleChange}
        disabled={disabled}
        className={cn(sizeClasses[size])}
        aria-label={`Select item ${id}`}
      />
    </div>
  );
}

export interface BatchSelectorWithLabelProps extends BatchSelectorProps {
  label: string;
  description?: string;
}

export function BatchSelectorWithLabel({
  id,
  label,
  description,
  disabled = false,
  className,
}: BatchSelectorWithLabelProps) {
  const context = useBatchSelectContext();
  const isSelected = context.isSelected(id);

  const handleChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        context.select(id);
      } else {
        context.deselect(id);
      }
    },
    [context, id],
  );

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Checkbox
        checked={isSelected}
        onCheckedChange={handleChange}
        disabled={disabled}
        id={`batch-select-${id}`}
      />
      <div className="flex flex-col">
        <label
          htmlFor={`batch-select-${id}`}
          className={cn(
            "text-sm font-medium cursor-pointer",
            disabled && "text-muted-foreground cursor-not-allowed",
          )}
        >
          {label}
        </label>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
    </div>
  );
}

export interface BatchSelectRowProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  onClick?: (id: string, e: React.MouseEvent) => void;
}

export function BatchSelectRow({
  id,
  children,
  disabled = false,
  className,
  onClick,
}: BatchSelectRowProps) {
  const context = useBatchSelectContext();
  const isSelected = context.isSelected(id);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;

      if (e.shiftKey) {
        context.toggleWithShift(id, context.allIds, true);
      } else if (e.ctrlKey || e.metaKey) {
        context.toggle(id);
      }
      onClick?.(id, e);
    },
    [context, id, disabled, onClick],
  );

  const handleCheckboxChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        context.select(id);
      } else {
        context.deselect(id);
      }
    },
    [context, id],
  );

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors cursor-pointer",
        isSelected && "bg-primary/5 border-primary/30",
        !isSelected && "hover:bg-muted/50",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      onClick={handleClick}
      role="row"
      aria-selected={isSelected}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={handleCheckboxChange}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select item ${id}`}
      />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export interface RangeSelectableListProps<T extends { id: string }> {
  items: T[];
  renderItem: (item: T, isSelected: boolean, index: number) => React.ReactNode;
  className?: string;
  itemClassName?: string;
  emptyMessage?: string;
}

export function RangeSelectableList<T extends { id: string }>({
  items,
  renderItem,
  className,
  itemClassName,
  emptyMessage = "No items",
}: RangeSelectableListProps<T>) {
  const context = useBatchSelectContext();
  const containerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    context.setAllIds(items.map((item) => item.id));
  }, [items, context]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        const allIds = items.map((item) => item.id);
        if (context.isAllSelected(allIds)) {
          context.deselectAll();
        } else {
          context.selectAll(allIds);
        }
      } else if (e.key === "Escape") {
        context.clearSelection();
      }
    },
    [context, items],
  );

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center py-8 text-muted-foreground",
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("space-y-1", className)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="listbox"
      aria-multiselectable="true"
    >
      {items.map((item, index) => {
        const isSelected = context.isSelected(item.id);
        return (
          <div
            key={item.id}
            className={cn("group relative", itemClassName)}
            role="option"
            aria-selected={isSelected}
          >
            {renderItem(item, isSelected, index)}
          </div>
        );
      })}
    </div>
  );
}

export interface SelectionIndicatorProps {
  className?: string;
  showWhenEmpty?: boolean;
}

export function SelectionIndicator({
  className,
  showWhenEmpty = false,
}: SelectionIndicatorProps) {
  const context = useOptionalBatchSelectContext();

  if (!context) return null;

  const { selectedCount, allIds } = context;
  const totalCount = allIds.length;

  if (!showWhenEmpty && selectedCount === 0) return null;

  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      <div
        className={cn(
          "flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium",
          selectedCount > 0
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {selectedCount}
      </div>
      <span className="text-muted-foreground">of {totalCount} selected</span>
    </div>
  );
}
