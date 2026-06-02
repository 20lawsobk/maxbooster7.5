import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ChevronDown,
  X,
  RefreshCw,
  Clock,
  Pause,
  Play,
} from "lucide-react";

export type BatchProgressStatus =
  | "idle"
  | "processing"
  | "paused"
  | "completed"
  | "failed"
  | "partial"
  | "cancelled";

export interface BatchProgressItem {
  id: string;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
}

export interface BatchProgressState {
  status: BatchProgressStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentItem?: string;
  items?: BatchProgressItem[];
  startTime?: number;
  endTime?: number;
}

export interface BatchProgressProps {
  state: BatchProgressState;
  title?: string;
  showItemList?: boolean;
  showElapsedTime?: boolean;
  onCancel?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function BatchProgress({
  state,
  title = "Processing",
  showItemList = true,
  showElapsedTime = true,
  onCancel,
  onPause,
  onResume,
  onRetry,
  className,
  compact = false,
}: BatchProgressProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const percentage = useMemo(() => {
    if (state.total === 0) return 0;
    return Math.round((state.processed / state.total) * 100);
  }, [state.processed, state.total]);

  useEffect(() => {
    if (state.status !== "processing" || !state.startTime) {
      if (state.endTime && state.startTime) {
        setElapsedTime(Math.floor((state.endTime - state.startTime) / 1000));
      }
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - state.startTime!) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.status, state.startTime, state.endTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const estimatedTimeRemaining = useMemo(() => {
    if (
      state.status !== "processing" ||
      state.processed === 0 ||
      elapsedTime === 0
    ) {
      return null;
    }
    const avgTimePerItem = elapsedTime / state.processed;
    const remaining = (state.total - state.processed) * avgTimePerItem;
    return formatTime(Math.round(remaining));
  }, [state.status, state.processed, state.total, elapsedTime]);

  const getStatusIcon = () => {
    switch (state.status) {
      case "processing":
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      case "paused":
        return <Pause className="h-5 w-5 text-amber-500" />;
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "partial":
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case "cancelled":
        return <X className="h-5 w-5 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getStatusLabel = () => {
    switch (state.status) {
      case "processing":
        return state.currentItem
          ? `Processing: ${state.currentItem}`
          : "Processing...";
      case "paused":
        return "Paused";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "partial":
        return "Completed with errors";
      case "cancelled":
        return "Cancelled";
      default:
        return "Idle";
    }
  };

  const failedItems = useMemo(() => {
    return state.items?.filter((item) => item.status === "failed") || [];
  }, [state.items]);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        {getStatusIcon()}
        <div className="flex-1 min-w-0">
          <Progress value={percentage} className="h-1.5" />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {state.processed}/{state.total}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4 p-4 rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{getStatusLabel()}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {state.status === "processing" && onPause && (
            <Button variant="outline" size="sm" onClick={onPause}>
              <Pause className="h-4 w-4" />
            </Button>
          )}
          {state.status === "paused" && onResume && (
            <Button variant="outline" size="sm" onClick={onResume}>
              <Play className="h-4 w-4" />
            </Button>
          )}
          {(state.status === "processing" || state.status === "paused") &&
            onCancel && (
              <Button variant="outline" size="sm" onClick={onCancel}>
                <X className="h-4 w-4" />
              </Button>
            )}
          {(state.status === "failed" || state.status === "partial") &&
            onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Retry
              </Button>
            )}
        </div>
      </div>

      <div className="space-y-2">
        <Progress value={percentage} className="h-2" />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              {state.processed} / {state.total}
            </span>
            {state.succeeded > 0 && (
              <span className="text-green-500">
                {state.succeeded} succeeded
              </span>
            )}
            {state.failed > 0 && (
              <span className="text-destructive">{state.failed} failed</span>
            )}
          </div>
          <span>{percentage}%</span>
        </div>
      </div>

      {showElapsedTime && (state.status === "processing" || state.endTime) && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>Elapsed: {formatTime(elapsedTime)}</span>
          </div>
          {estimatedTimeRemaining && (
            <span>Est. remaining: {estimatedTimeRemaining}</span>
          )}
        </div>
      )}

      {showItemList && failedItems.length > 0 && (
        <Collapsible open={showDetails} onOpenChange={setShowDetails}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              {failedItems.length} failed item
              {failedItems.length !== 1 ? "s" : ""}
              <ChevronDown
                className={cn(
                  "h-4 w-4 ml-auto transition-transform",
                  showDetails && "rotate-180",
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="h-40 mt-2 rounded border">
              <div className="p-2 space-y-2">
                {failedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 p-2 bg-destructive/5 rounded text-sm"
                  >
                    <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.error}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      )}

      {(state.status === "completed" || state.status === "partial") && (
        <div className="flex items-center justify-center gap-6 pt-2">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">
              {state.succeeded}
            </div>
            <div className="text-xs text-muted-foreground">Succeeded</div>
          </div>
          {state.failed > 0 && (
            <>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <div className="text-2xl font-bold text-destructive">
                  {state.failed}
                </div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function useBatchProgress(initialTotal: number = 0) {
  const [state, setState] = useState<BatchProgressState>({
    status: "idle",
    total: initialTotal,
    processed: 0,
    succeeded: 0,
    failed: 0,
    items: [],
  });

  const start = (
    total: number,
    items?: Array<{ id: string; name: string }>,
  ) => {
    setState({
      status: "processing",
      total,
      processed: 0,
      succeeded: 0,
      failed: 0,
      startTime: Date.now(),
      items: items?.map((item) => ({ ...item, status: "pending" })),
    });
  };

  const updateItem = (
    id: string,
    status: "processing" | "completed" | "failed",
    error?: string,
  ) => {
    setState((prev) => {
      const items = prev.items?.map((item) =>
        item.id === id ? { ...item, status, error } : item,
      );
      const processed =
        items?.filter((i) => i.status === "completed" || i.status === "failed")
          .length || prev.processed;
      const succeeded =
        items?.filter((i) => i.status === "completed").length || prev.succeeded;
      const failed =
        items?.filter((i) => i.status === "failed").length || prev.failed;
      const currentItem =
        status === "processing"
          ? items?.find((i) => i.id === id)?.name
          : undefined;

      return {
        ...prev,
        items,
        processed,
        succeeded,
        failed,
        currentItem,
      };
    });
  };

  const incrementProgress = (
    success: boolean,
    currentItem?: string,
    error?: string,
  ) => {
    setState((prev) => ({
      ...prev,
      processed: prev.processed + 1,
      succeeded: success ? prev.succeeded + 1 : prev.succeeded,
      failed: success ? prev.failed : prev.failed + 1,
      currentItem,
    }));
  };

  const complete = (succeeded: number, failed: number) => {
    setState((prev) => ({
      ...prev,
      status: failed === 0 ? "completed" : succeeded > 0 ? "partial" : "failed",
      processed: prev.total,
      succeeded,
      failed,
      endTime: Date.now(),
      currentItem: undefined,
    }));
  };

  const fail = (error?: string) => {
    setState((prev) => ({
      ...prev,
      status: "failed",
      endTime: Date.now(),
      currentItem: error,
    }));
  };

  const pause = () => {
    setState((prev) => ({ ...prev, status: "paused" }));
  };

  const resume = () => {
    setState((prev) => ({ ...prev, status: "processing" }));
  };

  const cancel = () => {
    setState((prev) => ({
      ...prev,
      status: "cancelled",
      endTime: Date.now(),
    }));
  };

  const reset = () => {
    setState({
      status: "idle",
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      items: [],
    });
  };

  return {
    state,
    start,
    updateItem,
    incrementProgress,
    complete,
    fail,
    pause,
    resume,
    cancel,
    reset,
  };
}

export interface BatchProgressInlineProps {
  current: number;
  total: number;
  status?: BatchProgressStatus;
  className?: string;
}

export function BatchProgressInline({
  current,
  total,
  status = "processing",
  className,
}: BatchProgressInlineProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {status === "processing" && (
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
      )}
      {status === "completed" && (
        <CheckCircle2 className="h-3 w-3 text-green-500" />
      )}
      {status === "failed" && <XCircle className="h-3 w-3 text-destructive" />}
      <Progress value={percentage} className="h-1 flex-1" />
      <span className="text-xs text-muted-foreground tabular-nums">
        {current}/{total}
      </span>
    </div>
  );
}
