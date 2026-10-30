// @ts-nocheck
import { logger } from "@/lib/logger";
import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";
import { UndoManager, getUndoManager } from "@/lib/undo/UndoManager";
import { UndoableAction, UndoState } from "@/lib/undo/types";
import { UndoToast } from "./UndoToast";
import { apiRequest } from "@/lib/queryClient";

export interface RecoveryPoint {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  actionId: string;
  module?: string;
}

export interface GlobalUndoState extends UndoState {
  recoveryPoints: RecoveryPoint[];
  isAutoRecoveryEnabled: boolean;
  lastAutoRecoveryAt: number | null;
}

export interface GlobalUndoContextValue {
  state: GlobalUndoState;
  executeAction: <T>(
    action: Omit<UndoableAction<T>, "id" | "isUndone" | "result">,
  ) => Promise<T>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  clearHistory: () => void;
  getHistory: () => UndoableAction[];
  getRedoStack: () => UndoableAction[];
  startGroup: (name: string) => string;
  endGroup: (groupId: string) => void;
  undoGroup: (groupId: string) => Promise<void>;
  getActionById: (id: string) => UndoableAction | undefined;
  showUndoToast: boolean;
  dismissUndoToast: () => void;
  createRecoveryPoint: (
    name: string,
    description?: string,
  ) => Promise<RecoveryPoint>;
  getRecoveryPoints: () => RecoveryPoint[];
  restoreToPoint: (pointId: string) => Promise<void>;
  deleteRecoveryPoint: (pointId: string) => Promise<void>;
  enableAutoRecovery: (enabled: boolean) => void;
  syncToBackend: (action: UndoableAction) => Promise<void>;
  jumpToAction: (actionId: string) => Promise<void>;
}

const initialState: GlobalUndoState = {
  history: [],
  redoStack: [],
  isUndoing: false,
  isRedoing: false,
  currentGroupId: null,
  lastAction: null,
  recoveryPoints: [],
  isAutoRecoveryEnabled: true,
  lastAutoRecoveryAt: null,
};

const GlobalUndoContext = createContext<GlobalUndoContextValue | null>(null);

export interface GlobalUndoProviderProps {
  children: React.ReactNode;
  maxHistorySize?: number;
  persistToStorage?: boolean;
  showToast?: boolean;
  toastPosition?: "top" | "bottom";
  toastAutoHideDuration?: number;
  enableKeyboardShortcuts?: boolean;
  autoRecoveryInterval?: number;
  syncToBackend?: boolean;
}

export function GlobalUndoProvider({
  children,
  maxHistorySize = 100,
  persistToStorage = true,
  showToast = true,
  toastPosition = "bottom",
  toastAutoHideDuration = 5000,
  enableKeyboardShortcuts = true,
  autoRecoveryInterval = 300000,
  syncToBackend: shouldSyncToBackend = true,
}: GlobalUndoProviderProps) {
  const [state, setState] = useState<GlobalUndoState>(initialState);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const undoManagerRef = useRef<UndoManager | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoRecoveryRef = useRef<NodeJS.Timeout | null>(null);

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

        if (action.metadata.isDestructive) {
          setShowUndoToast(true);
          if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
          }
          toastTimeoutRef.current = setTimeout(() => {
            setShowUndoToast(false);
          }, toastAutoHideDuration);
        }
      },
      onUndo: () => {
        setShowUndoToast(false);
      },
    });

    loadRecoveryPoints();

    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      if (autoRecoveryRef.current) {
        clearInterval(autoRecoveryRef.current);
      }
    };
  }, [maxHistorySize, persistToStorage, toastAutoHideDuration]);

  useEffect(() => {
    if (state.isAutoRecoveryEnabled && autoRecoveryInterval > 0) {
      autoRecoveryRef.current = setInterval(() => {
        const history = undoManagerRef.current?.getHistory() || [];
        if (history.length > 0) {
          createRecoveryPoint(
            "Auto-recovery point",
            "Automatically created recovery point",
          );
        }
      }, autoRecoveryInterval);

      return () => {
        if (autoRecoveryRef.current) {
          clearInterval(autoRecoveryRef.current);
        }
      };
    }
  }, [state.isAutoRecoveryEnabled, autoRecoveryInterval]);

  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

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
  }, [enableKeyboardShortcuts]);

  const loadRecoveryPoints = async () => {
    try {
      const response = await apiRequest("GET", "/api/undo/restore-points");
      const data = await response.json();
      if (data.success && data.restorePoints) {
        setState((prev) => ({
          ...prev,
          recoveryPoints: data.restorePoints.map(
            (rp: Record<string, unknown>) => ({
              id: rp.id,
              name: rp.name,
              description: rp.description,
              createdAt: new Date(rp.createdAt).getTime(),
              actionId: rp.actionId,
            }),
          ),
        }));
      }
    } catch (error) {
      logger.warn("Failed to load recovery points:", error);
    }
  };

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

  const createRecoveryPoint = useCallback(
    async (name: string, description?: string): Promise<RecoveryPoint> => {
      try {
        const response = await apiRequest(
          "POST",
          "/api/undo/create-restore-point",
          {
            name,
            description,
          },
        );
        const data = await response.json();

        const history = undoManagerRef.current?.getHistory() || [];
        const lastAction = history[history.length - 1];

        const newPoint: RecoveryPoint = {
          id: data.restorePointId,
          name,
          description,
          createdAt: Date.now(),
          actionId: lastAction.id || "",
        };

        setState((prev) => ({
          ...prev,
          recoveryPoints: [newPoint, ...prev.recoveryPoints].slice(0, 20),
          lastAutoRecoveryAt: Date.now(),
        }));

        return newPoint;
      } catch (error) {
        logger.error("Failed to create recovery point:", error);
        throw error;
      }
    },
    [],
  );

  const getRecoveryPoints = useCallback(() => {
    return state.recoveryPoints;
  }, [state.recoveryPoints]);

  const restoreToPoint = useCallback(
    async (pointId: string) => {
      try {
        const response = await apiRequest(
          "POST",
          `/api/undo/restore/${pointId}`,
        );
        const data = await response.json();

        if (data.success) {
          const point = state.recoveryPoints.find((p) => p.id === pointId);
          if (point && point.actionId) {
            await jumpToAction(point.actionId);
          }
        }
      } catch (error) {
        logger.error("Failed to restore to point:", error);
        throw error;
      }
    },
    [state.recoveryPoints],
  );

  const deleteRecoveryPoint = useCallback(async (pointId: string) => {
    try {
      await apiRequest("DELETE", `/api/undo/restore-points/${pointId}`);
      setState((prev) => ({
        ...prev,
        recoveryPoints: prev.recoveryPoints.filter((p) => p.id !== pointId),
      }));
    } catch (error) {
      logger.error("Failed to delete recovery point:", error);
      throw error;
    }
  }, []);

  const enableAutoRecovery = useCallback((enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      isAutoRecoveryEnabled: enabled,
    }));
  }, []);

  const syncToBackend = useCallback(
    async (action: UndoableAction) => {
      if (!shouldSyncToBackend) return;

      try {
        await apiRequest("POST", "/api/undo/track-action", {
          type: action.type,
          category: action.metadata.category,
          module: action.metadata.module,
          description: action.metadata.description,
          entityId: action.metadata.entityId,
          entityType: action.metadata.entityType,
          previousState: action.metadata.previousState,
          newState: action.metadata.newState,
          isDestructive: action.metadata.isDestructive,
        });
      } catch (error) {
        logger.warn("Failed to sync action to backend:", error);
      }
    },
    [shouldSyncToBackend],
  );

  const jumpToAction = useCallback(
    async (actionId: string) => {
      const history = undoManagerRef.current?.getHistory() || [];
      const actionIndex = history.findIndex((a) => a.id === actionId);
      if (actionIndex === -1) return;

      const currentIndex = history.length - 1;
      const stepsToUndo = currentIndex - actionIndex;

      if (stepsToUndo > 0) {
        for (let i = 0; i < stepsToUndo; i++) {
          await undo();
        }
      } else if (stepsToUndo < 0) {
        const stepsToRedo = Math.abs(stepsToUndo);
        for (let i = 0; i < stepsToRedo; i++) {
          await redo();
        }
      }
    },
    [undo, redo],
  );

  const contextValue: GlobalUndoContextValue = {
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
    createRecoveryPoint,
    getRecoveryPoints,
    restoreToPoint,
    deleteRecoveryPoint,
    enableAutoRecovery,
    syncToBackend,
    jumpToAction,
  };

  return (
    <GlobalUndoContext.Provider value={contextValue}>
      {children}
      {showToast && (
        <UndoToast
          autoHideDuration={toastAutoHideDuration}
          className={
            toastPosition === "top" ? "top-4 bottom-auto" : "bottom-4 top-auto"
          }
        />
      )}
    </GlobalUndoContext.Provider>
  );
}

export function useGlobalUndoContext(): GlobalUndoContextValue {
  const context = useContext(GlobalUndoContext);
  if (!context) {
    throw new Error(
      "useGlobalUndoContext must be used within a GlobalUndoProvider",
    );
  }
  return context;
}

export default GlobalUndoProvider;
