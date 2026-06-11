import { useState, useCallback, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Undo2,
  Redo2,
  History,
  Trash2,
  ChevronRight,
  Circle,
  BookmarkCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export interface HistoryAction {
  id: string;
  type: string;
  description: string;
  timestamp: number;
  data: Record<string, unknown>;
  isBookmarked?: boolean;
}

interface FlowStateUndoHistoryProps {
  actions: HistoryAction[];
  currentIndex: number;
  maxHistory?: number;
  onUndo: () => void;
  onRedo: () => void;
  onJumpTo: (index: number) => void;
  onClear: () => void;
  onBookmark: (index: number) => void;
  onSaveSnapshot?: (name: string) => void;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  "add-track": Circle,
  "delete-track": Trash2,
  "move-clip": ChevronRight,
  "add-note": Circle,
  "delete-note": Trash2,
  automation: ChevronRight,
  plugin: Circle,
  volume: Circle,
  pan: Circle,
  default: History,
};

const ACTION_COLORS: Record<string, string> = {
  "add-track": "#22c55e",
  "delete-track": "#ef4444",
  "move-clip": "#3b82f6",
  "add-note": "#8b5cf6",
  "delete-note": "#ef4444",
  automation: "#f59e0b",
  plugin: "#06b6d4",
  volume: "#22c55e",
  pan: "#ec4899",
  default: "#6b7280",
};

export function FlowStateUndoHistory({
  actions,
  currentIndex,
  maxHistory = 100,
  onUndo,
  onRedo,
  onJumpTo,
  onClear,
  onBookmark,
  onSaveSnapshot,
}: FlowStateUndoHistoryProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < actions.length - 1;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) onRedo();
        } else {
          if (canUndo) onUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        if (canRedo) onRedo();
      }
    },
    [canUndo, canRedo, onUndo, onRedo],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const groupedActions = useMemo(() => {
    const groups: {
      label: string;
      actions: (HistoryAction & { index: number })[];
    }[] = [];
    let currentGroup: (HistoryAction & { index: number })[] = [];
    let lastTimestamp = 0;

    actions.forEach((action, index) => {
      if (action.timestamp - lastTimestamp > 60000 && currentGroup.length > 0) {
        groups.push({
          label: formatTimeAgo(currentGroup[0].timestamp),
          actions: currentGroup,
        });
        currentGroup = [];
      }
      currentGroup.push({ ...action, index });
      lastTimestamp = action.timestamp;
    });

    if (currentGroup.length > 0) {
      groups.push({
        label: formatTimeAgo(currentGroup[0].timestamp),
        actions: currentGroup,
      });
    }

    return groups.reverse();
  }, [actions]);

  const handleJumpTo = useCallback(
    (index: number) => {
      onJumpTo(index);
      toast({ title: `Jumped to: ${actions[index]?.description || "state"}` });
    },
    [onJumpTo, actions, toast],
  );

  const handleClear = useCallback(() => {
    onClear();
    setIsOpen(false);
    toast({ title: "History cleared" });
  }, [onClear, toast]);

  return (
    <div className="flex items-center gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onUndo}
              disabled={!canUndo}
              className="h-8 w-8 p-0"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Undo (Ctrl+Z)</p>
            {canUndo && (
              <p className="text-xs text-white/60">
                {actions[currentIndex - 1]?.description}
              </p>
            )}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRedo}
              disabled={!canRedo}
              className="h-8 w-8 p-0"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Redo (Ctrl+Y)</p>
            {canRedo && (
              <p className="text-xs text-white/60">
                {actions[currentIndex + 1]?.description}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 gap-1">
            <History className="h-4 w-4" />
            <span className="text-xs">{actions.length}</span>
          </Button>
        </SheetTrigger>
        <SheetContent className="w-80 bg-slate-950 border-slate-800">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center justify-between text-white">
              <span>History</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  className="h-7 text-xs text-red-400"
                  disabled={actions.length === 0}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
            </SheetTitle>
          </SheetHeader>

          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex-1"
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Undo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRedo}
              disabled={!canRedo}
              className="flex-1"
            >
              <Redo2 className="h-4 w-4 mr-1" />
              Redo
            </Button>
          </div>

          <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            {actions.length === 0 ? (
              <div className="text-center py-8 text-white/40">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No history yet</p>
                <p className="text-xs">Actions will appear here</p>
              </div>
            ) : (
              groupedActions.map((group, groupIndex) => (
                <div key={groupIndex}>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.actions.map((action) => {
                      const Icon =
                        ACTION_ICONS[action.type] || ACTION_ICONS.default;
                      const color =
                        ACTION_COLORS[action.type] || ACTION_COLORS.default;
                      const isCurrent = action.index === currentIndex;
                      const isFuture = action.index > currentIndex;

                      return (
                        <motion.button
                          key={action.id}
                          className={cn(
                            "w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors",
                            isCurrent
                              ? "bg-blue-500/20 border border-blue-500/30"
                              : isFuture
                                ? "opacity-50 hover:opacity-75 hover:bg-slate-800/50"
                                : "hover:bg-slate-800/50",
                          )}
                          onClick={() => handleJumpTo(action.index)}
                          whileHover={{ x: 2 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${color}22` }}
                          >
                            <Icon className="h-3 w-3" style={{ color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                "text-sm truncate",
                                isFuture ? "text-white/40" : "text-white",
                              )}
                            >
                              {action.description}
                            </p>
                            <p className="text-[10px] text-white/40">
                              {formatTime(action.timestamp)}
                            </p>
                          </div>
                          {action.isBookmarked && (
                            <BookmarkCheck className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                          )}
                          {isCurrent && (
                            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="absolute bottom-4 left-4 right-4 pt-4 border-t border-slate-800 bg-slate-950">
            <div className="flex items-center justify-between text-xs text-white/40">
              <span>
                {actions.length} / {maxHistory} actions
              </span>
              <span>Position: {currentIndex + 1}</span>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function useUndoHistory<T>(initialState: T, maxHistory: number = 100) {
  const [history, setHistory] = useState<HistoryAction[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [state, setState] = useState<T>(initialState);

  const pushState = useCallback(
    (newState: T, type: string, description: string) => {
      const action: HistoryAction = {
        id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        description,
        timestamp: Date.now(),
        data: JSON.parse(JSON.stringify(newState)),
      };

      setHistory((prev) => {
        const newHistory = [...prev.slice(0, currentIndex + 1), action];
        if (newHistory.length > maxHistory) {
          return newHistory.slice(-maxHistory);
        }
        return newHistory;
      });

      setCurrentIndex((prev) => Math.min(prev + 1, maxHistory - 1));
      setState(newState);
    },
    [currentIndex, maxHistory],
  );

  const undo = useCallback(() => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      setState(history[prevIndex].data);
    }
  }, [currentIndex, history]);

  const redo = useCallback(() => {
    if (currentIndex < history.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setState(history[nextIndex].data);
    }
  }, [currentIndex, history]);

  const jumpTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < history.length) {
        setCurrentIndex(index);
        setState(history[index].data);
      }
    },
    [history],
  );

  const clear = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  const bookmark = useCallback((index: number) => {
    setHistory((prev) =>
      prev.map((action, i) =>
        i === index
          ? { ...action, isBookmarked: !action.isBookmarked }
          : action,
      ),
    );
  }, []);

  return {
    state,
    setState: pushState,
    history,
    currentIndex,
    undo,
    redo,
    jumpTo,
    clear,
    bookmark,
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1,
  };
}
