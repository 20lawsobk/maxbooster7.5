import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";
import { UndoManager, getUndoManager } from "@/lib/undo/UndoManager";
import { UndoableAction, UndoContextValue, UndoState } from "@/lib/undo/types";

const initialState: UndoState = {
  history: [],
  redoStack: [],
  isUndoing: false,
  isRedoing: false,
  currentGroupId: null,
  lastAction: null,
};

const UndoContext = createContext<UndoContextValue | null>(null);

export interface UndoProviderProps {
  children: React.ReactNode;
  maxHistorySize?: number;
  persistToStorage?: boolean;
}

export function UndoProvider({
  children,
  maxHistorySize = 100,
  persistToStorage = true,
}: UndoProviderProps) {
  const [state, setState] = useState<UndoState>(initialState);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const undoManagerRef = useRef<UndoManager | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    undoManagerRef.current = getUndoManager({
      maxHistorySize,
      persistToStorage,
      onHistoryChange: (history, redoStack) => {
        setState((prev) => ({
          ...prev,
          history,
          redoStack,
        }));
      },
      onActionExecuted: (action) => {
        setState((prev) => ({
          ...prev,
          lastAction: action,
        }));
        setShowUndoToast(true);
        if (toastTimeoutRef.current) {
          clearTimeout(toastTimeoutRef.current);
        }
        toastTimeoutRef.current = setTimeout(() => {
          setShowUndoToast(false);
        }, 5000);
      },
      onUndo: () => {
        setShowUndoToast(false);
      },
    });

    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [maxHistorySize, persistToStorage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const executeAction = useCallback(
    async <T,>(
      action: Omit<UndoableAction<T>, "id" | "isUndone" | "result">,
    ): Promise<T> => {
      if (!undoManagerRef.current) {
        throw new Error("UndoManager not initialized");
      }
      return undoManagerRef.current.executeAction(action);
    },
    [],
  );

  const undo = useCallback(async () => {
    if (!undoManagerRef.current || !undoManagerRef.current.canUndo()) return;

    setState((prev) => ({ ...prev, isUndoing: true }));
    try {
      await undoManagerRef.current.undo();
    } finally {
      setState((prev) => ({ ...prev, isUndoing: false }));
    }
  }, []);

  const redo = useCallback(async () => {
    if (!undoManagerRef.current || !undoManagerRef.current.canRedo()) return;

    setState((prev) => ({ ...prev, isRedoing: true }));
    try {
      await undoManagerRef.current.redo();
    } finally {
      setState((prev) => ({ ...prev, isRedoing: false }));
    }
  }, []);

  const clearHistory = useCallback(() => {
    undoManagerRef.current?.clearHistory();
  }, []);

  const getHistory = useCallback(() => {
    return undoManagerRef.current?.getHistory() || [];
  }, []);

  const getRedoStack = useCallback(() => {
    return undoManagerRef.current?.getRedoStack() || [];
  }, []);

  const startGroup = useCallback((name: string) => {
    return undoManagerRef.current?.startGroup(name) || "";
  }, []);

  const endGroup = useCallback((groupId: string) => {
    undoManagerRef.current?.endGroup(groupId);
  }, []);

  const undoGroup = useCallback(async (groupId: string) => {
    await undoManagerRef.current?.undoGroup(groupId);
  }, []);

  const getActionById = useCallback((id: string) => {
    return undoManagerRef.current?.getActionById(id);
  }, []);

  const dismissUndoToast = useCallback(() => {
    setShowUndoToast(false);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
  }, []);

  const contextValue: UndoContextValue = {
    state,
    executeAction,
    undo,
    redo,
    canUndo: undoManagerRef.current?.canUndo() || false,
    canRedo: undoManagerRef.current?.canRedo() || false,
    clearHistory,
    getHistory,
    getRedoStack,
    startGroup,
    endGroup,
    undoGroup,
    getActionById,
    showUndoToast,
    dismissUndoToast,
  };

  return (
    <UndoContext.Provider value={contextValue}>{children}</UndoContext.Provider>
  );
}

export function useUndo(): UndoContextValue {
  const context = useContext(UndoContext);
  if (!context) {
    throw new Error("useUndo must be used within an UndoProvider");
  }
  return context;
}

export function useUndoHistory() {
  const { state, getHistory, getRedoStack } = useUndo();
  return {
    history: state.history,
    redoStack: state.redoStack,
    getHistory,
    getRedoStack,
  };
}

export function useUndoActions() {
  const { undo, redo, canUndo, canRedo, clearHistory } = useUndo();
  return { undo, redo, canUndo, canRedo, clearHistory };
}

export function useLastAction() {
  const { state, showUndoToast, dismissUndoToast, undo } = useUndo();
  return {
    lastAction: state.lastAction,
    showUndoToast,
    dismissUndoToast,
    undoLastAction: undo,
  };
}
