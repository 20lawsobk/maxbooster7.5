import React, { useEffect, useCallback, useState } from "react";
import { useUndo } from "@/contexts/UndoContext";
import { UndoableAction, getActionLabel } from "@/lib/undo/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Undo2, Redo2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UndoManagerProps {
  className?: string;
  showButtons?: boolean;
  showStatus?: boolean;
  compact?: boolean;
  onActionExecuted?: (action: UndoableAction) => void;
  onUndo?: (action: UndoableAction) => void;
  onRedo?: (action: UndoableAction) => void;
}

export function UndoManager({
  className,
  showButtons = true,
  showStatus = true,
  compact = false,
  onActionExecuted,
  onUndo,
  onRedo,
}: UndoManagerProps) {
  const { state, undo, redo, canUndo, canRedo, getHistory, getRedoStack } =
    useUndo();

  const [lastActionFeedback, setLastActionFeedback] = useState<{
    type: "undo" | "redo" | "execute";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (state.lastAction) {
      onActionExecuted?.(state.lastAction);
    }
  }, [state.lastAction, onActionExecuted]);

  const handleUndo = useCallback(async () => {
    const history = getHistory();
    const lastAction = history[history.length - 1];

    await undo();

    if (lastAction) {
      onUndo?.(lastAction);
      setLastActionFeedback({
        type: "undo",
        message: `Undone: ${getActionLabel(lastAction)}`,
      });
      setTimeout(() => setLastActionFeedback(null), 2000);
    }
  }, [undo, getHistory, onUndo]);

  const handleRedo = useCallback(async () => {
    const redoStack = getRedoStack();
    const nextAction = redoStack[redoStack.length - 1];

    await redo();

    if (nextAction) {
      onRedo?.(nextAction);
      setLastActionFeedback({
        type: "redo",
        message: `Redone: ${getActionLabel(nextAction)}`,
      });
      setTimeout(() => setLastActionFeedback(null), 2000);
    }
  }, [redo, getRedoStack, onRedo]);

  const historyCount = state.history.filter((a) => !a.isUndone).length;
  const redoCount = state.redoStack.length;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleUndo}
          disabled={!canUndo}
          className="h-8 w-8"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRedo}
          disabled={!canRedo}
          className="h-8 w-8"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showButtons && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={!canUndo}
            className="gap-1"
          >
            <Undo2 className="h-3 w-3" />
            Undo
            {historyCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {historyCount}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRedo}
            disabled={!canRedo}
            className="gap-1"
          >
            <Redo2 className="h-3 w-3" />
            Redo
            {redoCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {redoCount}
              </Badge>
            )}
          </Button>
        </>
      )}

      {showStatus && lastActionFeedback && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all",
            lastActionFeedback.type === "undo" &&
              "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
            lastActionFeedback.type === "redo" &&
              "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
            lastActionFeedback.type === "execute" &&
              "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
          )}
        >
          {lastActionFeedback.type === "undo" && <Undo2 className="h-3 w-3" />}
          {lastActionFeedback.type === "redo" && <Redo2 className="h-3 w-3" />}
          {lastActionFeedback.type === "execute" && (
            <CheckCircle className="h-3 w-3" />
          )}
          <span>{lastActionFeedback.message}</span>
        </div>
      )}

      {showStatus && (state.isUndoing || state.isRedoing) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          {state.isUndoing ? "Undoing..." : "Redoing..."}
        </div>
      )}
    </div>
  );
}

export interface UndoManagerControllerProps {
  children: React.ReactNode;
  onBeforeUndo?: (action: UndoableAction) => boolean | Promise<boolean>;
  onBeforeRedo?: (action: UndoableAction) => boolean | Promise<boolean>;
  onAfterUndo?: (action: UndoableAction) => void;
  onAfterRedo?: (action: UndoableAction) => void;
}

export function UndoManagerController({
  children,
  onBeforeUndo,
  onBeforeRedo,
  onAfterUndo,
  onAfterRedo,
}: UndoManagerControllerProps) {
  const { undo, redo, getHistory, getRedoStack } = useUndo();

  const wrappedUndo = useCallback(async () => {
    const history = getHistory();
    const lastAction = history.find((a) => !a.isUndone);

    if (lastAction && onBeforeUndo) {
      const shouldProceed = await onBeforeUndo(lastAction);
      if (!shouldProceed) return;
    }

    await undo();

    if (lastAction) {
      onAfterUndo?.(lastAction);
    }
  }, [undo, getHistory, onBeforeUndo, onAfterUndo]);

  const wrappedRedo = useCallback(async () => {
    const redoStack = getRedoStack();
    const nextAction = redoStack[redoStack.length - 1];

    if (nextAction && onBeforeRedo) {
      const shouldProceed = await onBeforeRedo(nextAction);
      if (!shouldProceed) return;
    }

    await redo();

    if (nextAction) {
      onAfterRedo?.(nextAction);
    }
  }, [redo, getRedoStack, onBeforeRedo, onAfterRedo]);

  return (
    <UndoManagerContext.Provider
      value={{ undo: wrappedUndo, redo: wrappedRedo }}
    >
      {children}
    </UndoManagerContext.Provider>
  );
}

const UndoManagerContext = React.createContext<{
  undo: () => Promise<void>;
  redo: () => Promise<void>;
} | null>(null);

export function useUndoManagerController() {
  const context = React.useContext(UndoManagerContext);
  if (!context) {
    throw new Error(
      "useUndoManagerController must be used within UndoManagerController",
    );
  }
  return context;
}

export default UndoManager;
