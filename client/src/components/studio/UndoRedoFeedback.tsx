import {
  useState,
  useCallback,
  useEffect,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Undo,
  Redo,
  History,
  ChevronDown,
  Check,
  Trash2,
  Copy,
  Scissors,
  Music,
  Volume2,
  Sliders,
  Move,
  Edit3,
  GitBranch,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HistoryAction {
  id: string;
  type: string;
  description: string;
  timestamp: Date;
  data?: Record<string, any>;
  isCheckpoint?: boolean;
}

interface UndoRedoState {
  past: HistoryAction[];
  future: HistoryAction[];
  canUndo: boolean;
  canRedo: boolean;
}

interface UndoRedoContextType {
  state: UndoRedoState;
  undo: () => void;
  redo: () => void;
  addAction: (action: Omit<HistoryAction, "id" | "timestamp">) => void;
  undoToAction: (actionId: string) => void;
  redoToAction: (actionId: string) => void;
  clearHistory: () => void;
  createCheckpoint: (description: string) => void;
  recentAction: HistoryAction | null;
}

const UndoRedoContext = createContext<UndoRedoContextType | null>(null);

export function useUndoRedo() {
  const context = useContext(UndoRedoContext);
  if (!context) {
    throw new Error("useUndoRedo must be used within UndoRedoProvider");
  }
  return context;
}

interface UndoRedoProviderProps {
  children: ReactNode;
  maxHistory?: number;
}

export function UndoRedoProvider({
  children,
  maxHistory = 100,
}: UndoRedoProviderProps) {
  const [state, setState] = useState<UndoRedoState>({
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,
  });
  const [recentAction, setRecentAction] = useState<HistoryAction | null>(null);

  const addAction = useCallback(
    (action: Omit<HistoryAction, "id" | "timestamp">) => {
      const newAction: HistoryAction = {
        ...action,
        id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
      };

      setState((prev) => ({
        past: [...prev.past, newAction].slice(-maxHistory),
        future: [],
        canUndo: true,
        canRedo: false,
      }));

      setRecentAction(newAction);
      setTimeout(() => setRecentAction(null), 2000);
    },
    [maxHistory],
  );

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.past.length === 0) return prev;

      const lastAction = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);

      setRecentAction({ ...lastAction, type: `undo_${lastAction.type}` });
      setTimeout(() => setRecentAction(null), 2000);

      return {
        past: newPast,
        future: [lastAction, ...prev.future],
        canUndo: newPast.length > 0,
        canRedo: true,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.future.length === 0) return prev;

      const nextAction = prev.future[0];
      const newFuture = prev.future.slice(1);

      setRecentAction({ ...nextAction, type: `redo_${nextAction.type}` });
      setTimeout(() => setRecentAction(null), 2000);

      return {
        past: [...prev.past, nextAction],
        future: newFuture,
        canUndo: true,
        canRedo: newFuture.length > 0,
      };
    });
  }, []);

  const undoToAction = useCallback((actionId: string) => {
    setState((prev) => {
      const index = prev.past.findIndex((a) => a.id === actionId);
      if (index === -1) return prev;

      const actionsToUndo = prev.past.slice(index + 1);
      const newPast = prev.past.slice(0, index + 1);

      return {
        past: newPast,
        future: [...actionsToUndo.reverse(), ...prev.future],
        canUndo: newPast.length > 0,
        canRedo: true,
      };
    });
  }, []);

  const redoToAction = useCallback((actionId: string) => {
    setState((prev) => {
      const index = prev.future.findIndex((a) => a.id === actionId);
      if (index === -1) return prev;

      const actionsToRedo = prev.future.slice(0, index + 1);
      const newFuture = prev.future.slice(index + 1);

      return {
        past: [...prev.past, ...actionsToRedo],
        future: newFuture,
        canUndo: true,
        canRedo: newFuture.length > 0,
      };
    });
  }, []);

  const clearHistory = useCallback(() => {
    setState({
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
    });
  }, []);

  const createCheckpoint = useCallback(
    (description: string) => {
      addAction({
        type: "checkpoint",
        description,
        isCheckpoint: true,
      });
    },
    [addAction],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  return (
    <UndoRedoContext.Provider
      value={{
        state,
        undo,
        redo,
        addAction,
        undoToAction,
        redoToAction,
        clearHistory,
        createCheckpoint,
        recentAction,
      }}
    >
      {children}
    </UndoRedoContext.Provider>
  );
}

const getActionIcon = (type: string) => {
  if (type.includes("delete") || type.includes("remove")) return Trash2;
  if (type.includes("copy") || type.includes("duplicate")) return Copy;
  if (type.includes("cut") || type.includes("split")) return Scissors;
  if (type.includes("track")) return Music;
  if (type.includes("volume") || type.includes("gain")) return Volume2;
  if (type.includes("effect") || type.includes("plugin")) return Sliders;
  if (type.includes("move") || type.includes("drag")) return Move;
  if (type.includes("edit") || type.includes("modify")) return Edit3;
  if (type.includes("checkpoint")) return GitBranch;
  if (type.includes("batch") || type.includes("group")) return Layers;
  return History;
};

interface UndoRedoFeedbackProps {
  position?: "top" | "bottom";
}

export function UndoRedoFeedback({
  position = "bottom",
}: UndoRedoFeedbackProps) {
  const { recentAction } = useUndoRedo();

  return (
    <AnimatePresence>
      {recentAction && (
        <motion.div
          initial={{ opacity: 0, y: position === "bottom" ? 20 : -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: position === "bottom" ? 20 : -20 }}
          className={cn(
            "fixed left-1/2 -translate-x-1/2 z-50",
            position === "bottom" ? "bottom-20" : "top-20",
          )}
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-lg shadow-xl">
            {recentAction.type.startsWith("undo_") ? (
              <Undo className="w-4 h-4 text-amber-400" />
            ) : recentAction.type.startsWith("redo_") ? (
              <Redo className="w-4 h-4 text-blue-400" />
            ) : (
              <Check className="w-4 h-4 text-green-400" />
            )}
            <span className="text-sm text-zinc-300">
              {recentAction.description}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface UndoRedoControlsProps {
  showHistory?: boolean;
  compact?: boolean;
  className?: string;
}

export function UndoRedoControls({
  showHistory = false,
  compact = false,
  className,
}: UndoRedoControlsProps) {
  const { state, undo, redo, undoToAction, redoToAction, clearHistory } =
    useUndoRedo();

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={compact ? "icon" : "sm"}
            onClick={undo}
            disabled={!state.canUndo}
            className={cn(
              "text-zinc-400 hover:text-white disabled:opacity-30",
              compact && "h-8 w-8",
            )}
          >
            <Undo className="w-4 h-4" />
            {!compact && <span className="ml-1">Undo</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Undo (⌘Z)</p>
          {state.past.length > 0 && (
            <p className="text-xs text-zinc-400">
              {state.past[state.past.length - 1]?.description}
            </p>
          )}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={compact ? "icon" : "sm"}
            onClick={redo}
            disabled={!state.canRedo}
            className={cn(
              "text-zinc-400 hover:text-white disabled:opacity-30",
              compact && "h-8 w-8",
            )}
          >
            <Redo className="w-4 h-4" />
            {!compact && <span className="ml-1">Redo</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Redo (⌘⇧Z)</p>
          {state.future.length > 0 && (
            <p className="text-xs text-zinc-400">
              {state.future[0]?.description}
            </p>
          )}
        </TooltipContent>
      </Tooltip>

      {showHistory && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size={compact ? "icon" : "sm"}
              className={cn(
                "text-zinc-400 hover:text-white",
                compact && "h-8 w-8",
              )}
            >
              <History className="w-4 h-4" />
              {!compact && (
                <>
                  <span className="ml-1">History</span>
                  <ChevronDown className="w-3 h-3 ml-1" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-72 bg-zinc-950 border-zinc-800"
          >
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Action History</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-zinc-500"
                onClick={clearHistory}
              >
                Clear
              </Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {state.future.length > 0 && (
              <>
                <DropdownMenuLabel className="text-xs text-zinc-500">
                  Future (Redo)
                </DropdownMenuLabel>
                <ScrollArea className="max-h-32">
                  {state.future.map((action, _i) => {
                    const Icon = getActionIcon(action.type);
                    return (
                      <DropdownMenuItem
                        key={action.id}
                        onClick={() => redoToAction(action.id)}
                        className="flex items-center gap-2 text-zinc-400"
                      >
                        <Redo className="w-3 h-3" />
                        <Icon className="w-3 h-3" />
                        <span className="flex-1 truncate text-xs">
                          {action.description}
                        </span>
                        <span className="text-[10px] text-zinc-600">
                          {formatTime(action.timestamp)}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </ScrollArea>
                <DropdownMenuSeparator />
              </>
            )}

            <DropdownMenuLabel className="text-xs text-zinc-500 flex items-center gap-1">
              <span>Current</span>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-xs text-zinc-500">
              Past (Undo)
            </DropdownMenuLabel>
            <ScrollArea className="max-h-48">
              {state.past.length === 0 ? (
                <div className="text-center py-4 text-xs text-zinc-600">
                  No history yet
                </div>
              ) : (
                [...state.past].reverse().map((action, _i) => {
                  const Icon = getActionIcon(action.type);
                  return (
                    <DropdownMenuItem
                      key={action.id}
                      onClick={() => undoToAction(action.id)}
                      className={cn(
                        "flex items-center gap-2",
                        action.isCheckpoint &&
                          "bg-amber-500/10 border-l-2 border-amber-500",
                      )}
                    >
                      <Undo className="w-3 h-3 text-amber-400" />
                      <Icon className="w-3 h-3 text-zinc-400" />
                      <span className="flex-1 truncate text-xs text-zinc-300">
                        {action.description}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {formatTime(action.timestamp)}
                      </span>
                    </DropdownMenuItem>
                  );
                })
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export default UndoRedoFeedback;
