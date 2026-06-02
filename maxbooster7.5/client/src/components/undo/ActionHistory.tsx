import { useState } from "react";
import {
  History,
  Undo2,
  Redo2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useUndoHistory, useUndoActions } from "@/contexts/UndoContext";
import { UndoableAction, getActionLabel } from "@/lib/undo/types";
import { cn } from "@/lib/utils";

export interface ActionHistoryProps {
  className?: string;
  maxVisible?: number;
}

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return "Just now";
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  } else {
    return new Date(timestamp).toLocaleDateString();
  }
}

function ActionItem({
  action,
  isLast,
  onUndo,
}: {
  action: UndoableAction;
  isLast: boolean;
  onUndo?: () => void;
}) {
  const label = getActionLabel(action);
  const { module, category, isDestructive, timestamp } = action.metadata;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg transition-colors",
        action.isUndone ? "opacity-50 bg-muted/30" : "hover:bg-muted/50",
        isDestructive && !action.isUndone && "border-l-2 border-destructive",
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        <div
          className={cn(
            "w-2 h-2 rounded-full",
            action.isUndone ? "bg-muted-foreground" : "bg-primary",
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium",
              action.isUndone && "line-through",
            )}
          >
            {label}
          </span>
          {action.isUndone && (
            <Badge variant="outline" className="text-xs">
              Undone
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-xs">
            {module}
          </Badge>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimestamp(timestamp)}
          </span>
        </div>
      </div>
      {isLast && !action.isUndone && onUndo && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onUndo}
          aria-label="Undo this action"
        >
          <Undo2 className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}

export function ActionHistory({
  className,
  maxVisible = 50,
}: ActionHistoryProps) {
  const { history, redoStack } = useUndoHistory();
  const { undo, redo, canUndo, canRedo, clearHistory } = useUndoActions();
  const [isExpanded, setIsExpanded] = useState(false);

  const visibleHistory = history.slice(-maxVisible).reverse();
  const hasMore = history.length > maxVisible;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-2", className)}>
          <History className="w-4 h-4" />
          History
          {history.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {history.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Action History
          </SheetTitle>
          <SheetDescription>
            View and manage your recent actions. Use undo/redo to revert
            changes.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 mt-4 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => undo()}
            disabled={!canUndo}
            className="gap-1"
          >
            <Undo2 className="w-3 h-3" />
            Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => redo()}
            disabled={!canRedo}
            className="gap-1"
          >
            <Redo2 className="w-3 h-3" />
            Redo
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={clearHistory}
            disabled={history.length === 0}
            className="gap-1 text-destructive hover:text-destructive"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-220px)]">
          {visibleHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <History className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">No actions recorded yet</p>
              <p className="text-xs mt-1">
                Your action history will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {redoStack.length > 0 && (
                <div className="mb-4 pb-4 border-b">
                  <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                    <Redo2 className="w-3 h-3" />
                    <span>Can redo ({redoStack.length})</span>
                  </div>
                  {redoStack
                    .slice()
                    .reverse()
                    .map((action, index) => (
                      <div
                        key={action.id}
                        className="text-xs text-muted-foreground pl-5"
                      >
                        {getActionLabel(action)}
                      </div>
                    ))}
                </div>
              )}

              {visibleHistory.map((action, index) => (
                <ActionItem
                  key={action.id}
                  action={action}
                  isLast={index === 0}
                  onUndo={index === 0 ? () => undo() : undefined}
                />
              ))}

              {hasMore && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Show {history.length - maxVisible} more
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
