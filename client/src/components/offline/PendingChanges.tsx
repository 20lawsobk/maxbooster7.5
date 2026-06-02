import { logger } from "@/lib/logger";
import { useState, useEffect, useCallback } from "react";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  AlertCircle,
  Check,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { syncManager, offlineQueue, QueuedAction } from "@/lib/offline";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { formatDistanceToNow } from "date-fns";

interface PendingChangesProps {
  className?: string;
  maxItems?: number;
  showActions?: boolean;
  onActionClick?: (action: QueuedAction) => void;
  onViewDetails?: () => void;
}

export function PendingChanges({
  className,
  maxItems = 10,
  showActions = true,
  onActionClick,
  onViewDetails,
}: PendingChangesProps) {
  const {
    isOnline,
    isOffline,
    pendingCount,
    failedCount,
    conflictCount,
    syncStatus,
    syncProgress,
    lastSyncAt,
  } = useOfflineStatus();
  const [actions, setActions] = useState<QueuedAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedActions, setSelectedActions] = useState<Set<string>>(
    new Set(),
  );

  const totalPending = pendingCount + failedCount + conflictCount;
  const isSyncing = syncStatus === "syncing";
  const hasIssues = failedCount > 0 || conflictCount > 0;

  const loadActions = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pending, syncing, failed, conflict] = await Promise.all([
        offlineQueue.getAllPending(),
        offlineQueue.getByStatus("syncing"),
        offlineQueue.getByStatus("failed"),
        offlineQueue.getByStatus("conflict"),
      ]);
      const allActions = [...pending, ...syncing, ...failed, ...conflict]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, maxItems);
      setActions(allActions);
    } catch (error) {
      logger.error("Failed to load actions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [maxItems]);

  useEffect(() => {
    loadActions();

    const unsubAdded = offlineQueue.on("action-added", loadActions);
    const unsubUpdated = offlineQueue.on("action-updated", loadActions);
    const unsubRemoved = offlineQueue.on("action-removed", loadActions);
    const unsubComplete = syncManager.on("sync-complete", loadActions);

    return () => {
      unsubAdded();
      unsubUpdated();
      unsubRemoved();
      unsubComplete();
    };
  }, [loadActions]);

  const handleSync = async () => {
    await syncManager.sync();
  };

  const handleRetryFailed = async () => {
    await syncManager.retryFailed();
  };

  const handleRetryAction = async (actionId: string) => {
    await offlineQueue.updateAction(actionId, {
      status: "pending",
      retryCount: 0,
      error: undefined,
    });
    await syncManager.forceSyncAction(actionId);
  };

  const handleDeleteAction = async (actionId: string) => {
    await offlineQueue.dequeue(actionId);
    setSelectedActions((prev) => {
      const next = new Set(prev);
      next.delete(actionId);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    for (const actionId of selectedActions) {
      await offlineQueue.dequeue(actionId);
    }
    setSelectedActions(new Set());
  };

  const handleClearCompleted = async () => {
    await offlineQueue.clearCompleted();
    await loadActions();
  };

  const toggleActionSelection = (actionId: string) => {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "syncing":
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "conflict":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "completed":
        return <Check className="h-4 w-4 text-green-500" />;
      default:
        return <Cloud className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "syncing":
        return "Syncing";
      case "failed":
        return "Failed";
      case "conflict":
        return "Conflict";
      case "completed":
        return "Synced";
      default:
        return "Pending";
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "syncing":
        return "default";
      case "failed":
        return "destructive";
      case "conflict":
        return "outline";
      case "completed":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isOffline ? (
              <CloudOff className="h-5 w-5 text-yellow-500" />
            ) : isSyncing ? (
              <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
            ) : hasIssues ? (
              <AlertCircle className="h-5 w-5 text-destructive" />
            ) : totalPending > 0 ? (
              <Cloud className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Check className="h-5 w-5 text-green-500" />
            )}
            <CardTitle className="text-lg">Pending Changes</CardTitle>
            {totalPending > 0 && (
              <Badge variant="secondary" className="ml-1">
                {totalPending}
              </Badge>
            )}
          </div>
          {showActions && isOnline && totalPending > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw
                className={cn("h-3 w-3 mr-1", isSyncing && "animate-spin")}
              />
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          )}
        </div>
        <CardDescription>
          {isOffline
            ? "You are offline. Changes will sync when you reconnect."
            : isSyncing
              ? `Syncing ${syncProgress.completed} of ${syncProgress.total}...`
              : totalPending > 0
                ? `${totalPending} changes waiting to sync`
                : lastSyncAt
                  ? `All synced ${formatDistanceToNow(lastSyncAt, { addSuffix: true })}`
                  : "All changes synced"}
        </CardDescription>
      </CardHeader>

      {isSyncing && syncProgress.total > 0 && (
        <div className="px-6 pb-2">
          <Progress
            value={(syncProgress.completed / syncProgress.total) * 100}
            className="h-1"
          />
        </div>
      )}

      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-2 mb-4 text-center text-sm">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="font-semibold text-lg">{pendingCount}</div>
            <div className="text-muted-foreground text-xs">Pending</div>
          </div>
          <div
            className={cn(
              "p-2 rounded-lg",
              failedCount > 0 ? "bg-destructive/10" : "bg-muted/50",
            )}
          >
            <div
              className={cn(
                "font-semibold text-lg",
                failedCount > 0 && "text-destructive",
              )}
            >
              {failedCount}
            </div>
            <div className="text-muted-foreground text-xs">Failed</div>
          </div>
          <div
            className={cn(
              "p-2 rounded-lg",
              conflictCount > 0
                ? "bg-yellow-100 dark:bg-yellow-900/20"
                : "bg-muted/50",
            )}
          >
            <div
              className={cn(
                "font-semibold text-lg",
                conflictCount > 0 && "text-yellow-600 dark:text-yellow-400",
              )}
            >
              {conflictCount}
            </div>
            <div className="text-muted-foreground text-xs">Conflicts</div>
          </div>
        </div>

        {selectedActions.size > 0 && (
          <div className="flex items-center justify-between mb-3 p-2 rounded-lg bg-muted/50">
            <span className="text-sm text-muted-foreground">
              {selectedActions.size} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedActions(new Set())}
              >
                Clear
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : actions.length > 0 ? (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {actions.map((action, index) => (
                <div key={action.id}>
                  <div
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer",
                      selectedActions.has(action.id)
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted/50",
                    )}
                    onClick={() => {
                      if (onActionClick) {
                        onActionClick(action);
                      } else {
                        toggleActionSelection(action.id);
                      }
                    }}
                  >
                    <div className="flex-shrink-0">
                      {getStatusIcon(action.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {action.type}
                        </span>
                        <Badge
                          variant={getStatusBadgeVariant(action.status)}
                          className="text-xs px-1.5 py-0"
                        >
                          {getStatusLabel(action.status)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(action.updatedAt, {
                          addSuffix: true,
                        })}
                        {action.retryCount > 0 &&
                          ` · ${action.retryCount} retries`}
                      </div>
                      {action.error && (
                        <div className="text-xs text-destructive mt-1 truncate">
                          {action.error}
                        </div>
                      )}
                    </div>
                    {showActions && action.status === "failed" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetryAction(action.id);
                          }}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAction(action.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {index < actions.length - 1 && <Separator className="my-1" />}
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Check className="h-8 w-8 text-green-500 mb-2" />
            <p className="text-sm font-medium">All caught up!</p>
            <p className="text-xs text-muted-foreground">No pending changes</p>
          </div>
        )}

        {showActions && (failedCount > 0 || onViewDetails) && (
          <>
            <Separator className="my-3" />
            <div className="flex gap-2">
              {failedCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleRetryFailed}
                  disabled={isSyncing}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry Failed ({failedCount})
                </Button>
              )}
              {onViewDetails && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={onViewDetails}
                >
                  View Details
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default PendingChanges;
