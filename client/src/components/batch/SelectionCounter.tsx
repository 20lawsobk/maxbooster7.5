import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, CheckSquare, Square } from "lucide-react";
import { useOptionalBatchSelectContext } from "./BatchSelectProvider";

export interface SelectionCounterProps {
  className?: string;
  variant?: "badge" | "text" | "compact" | "full";
  showClearButton?: boolean;
  showSelectAllButton?: boolean;
  totalLabel?: string;
  selectedLabel?: string;
  allIds?: string[];
}

export function SelectionCounter({
  className,
  variant = "badge",
  showClearButton = true,
  showSelectAllButton = false,
  totalLabel = "items",
  selectedLabel = "selected",
  allIds,
}: SelectionCounterProps) {
  const context = useOptionalBatchSelectContext();

  if (!context) {
    return null;
  }

  const {
    selectedCount,
    clearSelection,
    selectAll,
    allIds: contextAllIds,
    isAllSelected,
  } = context;
  const targetIds = allIds || contextAllIds;
  const totalCount = targetIds.length;
  const allSelected = isAllSelected(targetIds);

  if (selectedCount === 0) {
    return null;
  }

  const handleClear = () => {
    clearSelection();
  };

  const handleSelectAll = () => {
    selectAll(targetIds);
  };

  switch (variant) {
    case "badge":
      return (
        <div className={cn("flex items-center gap-2", className)}>
          <Badge variant="secondary" className="font-medium">
            {selectedCount} {selectedLabel}
          </Badge>
          {showClearButton && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={handleClear}
              aria-label="Clear selection"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      );

    case "text":
      return (
        <div className={cn("flex items-center gap-2 text-sm", className)}>
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{selectedCount}</span>
            {" of "}
            <span className="font-medium text-foreground">
              {totalCount}
            </span>{" "}
            {totalLabel} {selectedLabel}
          </span>
          {showClearButton && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleClear}
            >
              Clear
            </Button>
          )}
        </div>
      );

    case "compact":
      return (
        <span className={cn("text-sm text-muted-foreground", className)}>
          {selectedCount}/{totalCount}
        </span>
      );

    case "full":
      return (
        <div className={cn("flex items-center gap-3", className)}>
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="text-sm">
              <span className="font-semibold">{selectedCount}</span>
              {" of "}
              <span className="font-semibold">{totalCount}</span> {totalLabel}{" "}
              {selectedLabel}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {showSelectAllButton &&
              !allSelected &&
              totalCount > selectedCount && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleSelectAll}
                >
                  <Square className="h-3 w-3 mr-1" />
                  Select all
                </Button>
              )}
            {showClearButton && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleClear}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>
      );

    default:
      return null;
  }
}

export function StandaloneSelectionCounter({
  selectedCount,
  totalCount,
  onClear,
  onSelectAll,
  className,
  variant = "badge",
  showClearButton = true,
  showSelectAllButton = false,
  totalLabel = "items",
  selectedLabel = "selected",
}: {
  selectedCount: number;
  totalCount: number;
  onClear?: () => void;
  onSelectAll?: () => void;
  className?: string;
  variant?: "badge" | "text" | "compact" | "full";
  showClearButton?: boolean;
  showSelectAllButton?: boolean;
  totalLabel?: string;
  selectedLabel?: string;
}) {
  if (selectedCount === 0) {
    return null;
  }

  const allSelected = selectedCount >= totalCount;

  switch (variant) {
    case "badge":
      return (
        <div className={cn("flex items-center gap-2", className)}>
          <Badge variant="secondary" className="font-medium">
            {selectedCount} {selectedLabel}
          </Badge>
          {showClearButton && onClear && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={onClear}
              aria-label="Clear selection"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      );

    case "text":
      return (
        <div className={cn("flex items-center gap-2 text-sm", className)}>
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{selectedCount}</span>
            {" of "}
            <span className="font-medium text-foreground">
              {totalCount}
            </span>{" "}
            {totalLabel} {selectedLabel}
          </span>
          {showClearButton && onClear && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onClear}
            >
              Clear
            </Button>
          )}
        </div>
      );

    case "compact":
      return (
        <span className={cn("text-sm text-muted-foreground", className)}>
          {selectedCount}/{totalCount}
        </span>
      );

    case "full":
      return (
        <div className={cn("flex items-center gap-3", className)}>
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="text-sm">
              <span className="font-semibold">{selectedCount}</span>
              {" of "}
              <span className="font-semibold">{totalCount}</span> {totalLabel}{" "}
              {selectedLabel}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {showSelectAllButton && !allSelected && onSelectAll && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onSelectAll}
              >
                <Square className="h-3 w-3 mr-1" />
                Select all
              </Button>
            )}
            {showClearButton && onClear && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onClear}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>
      );

    default:
      return null;
  }
}
