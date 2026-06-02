import { useState, useMemo } from "react";
import { History, Undo2, Redo2, Clock, GitBranch, ChevronRight, Trash2, RefreshCw, CheckCircle2, X, ChevronDown, ChevronUp, Filter, FileText, Music, Image, Settings, Users, Calendar, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  useUndoHistory,
  useUndoActions,
  useUndo,
} from "@/contexts/UndoContext";
import {
  UndoableAction,
  getActionLabel,
  ActionType,
  ActionCategory,
} from "@/lib/undo/types";
import { cn } from "@/lib/utils";

export interface ActionHistoryPanelProps {
  className?: string;
  maxHeight?: string;
  showFilters?: boolean;
  showTimeline?: boolean;
  compact?: boolean;
  asSheet?: boolean;
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
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

function getActionTypeIcon(type: ActionType) {
  switch (type) {
    case "create":
    case "post_create":
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case "delete":
    case "file_delete":
    case "post_delete":
    case "track_remove":
    case "collaboration_remove":
      return <Trash2 className="w-3.5 h-3.5 text-red-500" />;
    case "update":
    case "settings_change":
    case "track_edit":
    case "release_edit":
      return <RefreshCw className="w-3.5 h-3.5 text-blue-500" />;
    case "move":
    case "copy":
      return <ChevronRight className="w-3.5 h-3.5 text-purple-500" />;
    case "file_upload":
      return <FileText className="w-3.5 h-3.5 text-emerald-500" />;
    case "post_schedule":
      return <Calendar className="w-3.5 h-3.5 text-orange-500" />;
    case "collaboration_invite":
      return <Users className="w-3.5 h-3.5 text-pink-500" />;
    case "batch":
      return <Folder className="w-3.5 h-3.5 text-amber-500" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function getCategoryIcon(category: ActionCategory) {
  switch (category) {
    case "file":
      return <FileText className="w-3 h-3" />;
    case "track":
      return <Music className="w-3 h-3" />;
    case "social":
      return <Image className="w-3 h-3" />;
    case "settings":
      return <Settings className="w-3 h-3" />;
    case "collaboration":
      return <Users className="w-3 h-3" />;
    case "release":
      return <Calendar className="w-3 h-3" />;
    default:
      return null;
  }
}

interface TimelineItemProps {
  action: UndoableAction;
  isActive: boolean;
  isLast: boolean;
  onJumpTo: () => void;
  onUndo?: () => void;
  compact?: boolean;
}

function TimelineItem({
  action,
  isActive,
  isLast,
  onJumpTo,
  onUndo,
  compact,
}: TimelineItemProps) {
  const label = getActionLabel(action);
  const { module, category, isDestructive, timestamp } = action.metadata;

  return (
    <div
      className={cn(
        "relative flex items-start gap-3 py-2.5 px-3 cursor-pointer rounded-md transition-all",
        "hover:bg-muted/50",
        isActive && "bg-primary/5 border-l-2 border-primary",
        action.isUndone && "opacity-50",
      )}
      onClick={onJumpTo}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onJumpTo();
        }
      }}
    >
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-6 h-6 rounded-full border-2 flex items-center justify-center bg-background",
            isActive
              ? "border-primary"
              : action.isUndone
                ? "border-muted-foreground/50"
                : isDestructive
                  ? "border-destructive/50"
                  : "border-primary/50",
          )}
        >
          {getActionTypeIcon(action.type)}
        </div>
        {!isLast && (
          <div className="w-0.5 h-full bg-border absolute top-8 left-[21px]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium truncate",
              action.isUndone && "line-through text-muted-foreground",
            )}
          >
            {label}
          </span>
          {isDestructive && !action.isUndone && (
            <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
              Destructive
            </Badge>
          )}
          {action.isUndone && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
              Undone
            </Badge>
          )}
        </div>

        {!compact && (
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-1">
              {getCategoryIcon(category)}
              {module}
            </Badge>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimestamp(timestamp)}
            </span>
          </div>
        )}

        {compact && (
          <span className="text-[10px] text-muted-foreground">
            {formatTimestamp(timestamp)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {isActive && (
          <Badge variant="default" className="text-[10px] h-5">
            Current
          </Badge>
        )}
        {isLast && !action.isUndone && onUndo && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUndo();
                  }}
                >
                  <Undo2 className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo this action</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

function HistoryPanelContent({
  maxHeight = "400px",
  showFilters = true,
  showTimeline = true,
  compact = false,
}: Omit<ActionHistoryPanelProps, "className" | "asSheet">) {
  const { history, redoStack } = useUndoHistory();
  const { undo, redo, canUndo, canRedo, clearHistory } = useUndoActions();
  useUndo();

  const [searchTerm, setSearchTerm] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isExpanded, setIsExpanded] = useState(true);

  const modules = useMemo(() => {
    const uniqueModules = new Set(history.map((a) => a.metadata.module));
    return Array.from(uniqueModules);
  }, [history]);

  const filteredHistory = useMemo(() => {
    let filtered = [...history];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          getActionLabel(a).toLowerCase().includes(term) ||
          a.metadata.module.toLowerCase().includes(term) ||
          a.type.toLowerCase().includes(term),
      );
    }

    if (moduleFilter !== "all") {
      filtered = filtered.filter((a) => a.metadata.module === moduleFilter);
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((a) => a.type === typeFilter);
    }

    return filtered.reverse();
  }, [history, searchTerm, moduleFilter, typeFilter]);

  const handleJumpToAction = async (actionId: string) => {
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
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm">Action History</span>
          {history.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {history.filter((a) => !a.isUndone).length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => undo()}
                  disabled={!canUndo}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => redo()}
                  disabled={!canRedo}
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={clearHistory}
                  disabled={history.length === 0}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear History</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {showFilters && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
          <Input
            placeholder="Search actions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-7 text-xs flex-1"
          />
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="h-7 w-[100px] text-xs">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {modules.map((module) => (
                <SelectItem key={module} value={module}>
                  {module}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(searchTerm || moduleFilter !== "all") && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setSearchTerm("");
                setModuleFilter("all");
              }}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )}

      <ScrollArea className="flex-1" style={{ maxHeight }}>
        {filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <History className="w-10 h-10 mb-3 opacity-50" />
            <p className="text-sm font-medium">No actions recorded</p>
            <p className="text-xs mt-1">Your action history will appear here</p>
          </div>
        ) : (
          <div className="p-2">
            {redoStack.length > 0 && (
              <div className="mb-3 pb-3 border-b border-dashed">
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                  <Redo2 className="w-3 h-3" />
                  <span>Available to redo ({redoStack.length})</span>
                </button>
                {isExpanded &&
                  redoStack
                    .slice()
                    .reverse()
                    .map((action, index) => (
                      <TimelineItem
                        key={action.id}
                        action={action}
                        isActive={false}
                        isLast={index === redoStack.length - 1}
                        compact={compact}
                        onJumpTo={() => handleJumpToAction(action.id)}
                      />
                    ))}
              </div>
            )}

            {showTimeline && (
              <div className="flex items-center gap-2 px-2 mb-2 text-xs text-muted-foreground">
                <GitBranch className="w-3 h-3" />
                <span>Current State</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {filteredHistory.map((action, index) => (
              <TimelineItem
                key={action.id}
                action={action}
                isActive={index === 0 && !action.isUndone}
                isLast={index === filteredHistory.length - 1}
                compact={compact}
                onJumpTo={() => handleJumpToAction(action.id)}
                onUndo={
                  index === 0 && !action.isUndone ? () => undo() : undefined
                }
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {history.length > 0 && (
        <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
          <span>
            {history.filter((a) => !a.isUndone).length} active •{" "}
            {redoStack.length} undone
          </span>
        </div>
      )}
    </div>
  );
}

export function ActionHistoryPanel({
  className,
  asSheet = false,
  ...props
}: ActionHistoryPanelProps) {
  const { history } = useUndoHistory();

  if (asSheet) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-2", className)}
          >
            <History className="w-4 h-4" />
            History
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {history.filter((a) => !a.isUndone).length}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[480px] p-0">
          <HistoryPanelContent {...props} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className={cn("flex flex-col bg-background border rounded-lg", className)}
    >
      <HistoryPanelContent {...props} />
    </div>
  );
}

export default ActionHistoryPanel;
