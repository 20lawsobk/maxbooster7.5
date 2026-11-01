import { logger } from "@/lib/logger";
import { useState, useEffect } from "react";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  AlertCircle,
  Check,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { syncManager, offlineQueue, QueuedAction } from "@/lib/offline";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { formatDistanceToNow } from "date-fns";

interface PendingChangesIndicatorProps {
  className?: string;
  variant?: "badge" | "button" | "icon";
  showDropdown?: boolean;
  maxPreviewItems?: number;
  onViewAll?: () => void;
}

export function PendingChangesIndicator({
  className,
  variant = "badge",
  showDropdown = true,
  maxPreviewItems = 5,
  onViewAll,
}: PendingChangesIndicatorProps) {
  const {
    isOnline,
    isOffline,
    pendingCount,
    failedCount,
    conflictCount,
    syncStatus,
    lastSyncAt,
  } = useOfflineStatus();
  const [recentActions, setRecentActions] = useState<QueuedAction[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const totalPending = pendingCount + failedCount + conflictCount;
  const isSyncing = syncStatus === "syncing";
  const hasIssues = failedCount > 0 || conflictCount > 0;

  useEffect(() => {
    if (isOpen) {
      loadRecentActions();
    }
  }, [isOpen, pendingCount, failedCount]);

  const loadRecentActions = async () => {
    try {
      const pending = await offlineQueue.getAllPending();
      const failed = await offlineQueue.getByStatus("failed");
      const allActions = [...pending, ...failed]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, maxPreviewItems);
      setRecentActions(allActions);
    } catch (error) {
      logger.error("Failed to load recent actions:", error);
    }
  };

  const handleSync = async () => {
    await syncManager.sync();
  };

  const handleRetryFailed = async () => {
    await syncManager.retryFailed();
  };

  const getStatusIcon = () => {
    if (isSyncing) return RefreshCw;
    if (isOffline) return CloudOff;
    if (hasIssues) return AlertCircle;
    if (totalPending > 0) return Cloud;
    return Check;
  };

  const getStatusColor = () => {
    if (hasIssues) return "text-destructive";
    if (isOffline) return "text-yellow-500";
    if (isSyncing) return "text-blue-500";
    if (totalPending > 0) return "text-muted-foreground";
    return "text-green-500";
  };

  const getBadgeVariant = () => {
    if (hasIssues) return "destructive";
    if (isOffline) return "outline";
    if (totalPending > 0) return "secondary";
    return "default";
  };

  const Icon = getStatusIcon();

  const content = (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Icon
        className={cn("h-4 w-4", getStatusColor(), isSyncing && "animate-spin")}
      />
      {(variant === "badge" || variant === "button") && totalPending > 0 && (
        <Badge
          variant={getBadgeVariant()}
          className="px-1.5 py-0 text-xs min-w-[1.25rem] text-center"
        >
          {totalPending}
        </Badge>
      )}
      {variant === "button" && (
        <span className="text-sm">
          {isSyncing
            ? "Syncing..."
            : isOffline
              ? "Offline"
              : totalPending > 0
                ? "Pending"
                : "Synced"}
        </span>
      )}
      {showDropdown && (
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      )}
    </div>
  );

  if (!showDropdown) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "inline-flex items-center cursor-default",
                className,
              )}
            >
              {content}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {isSyncing
                ? "Syncing changes..."
                : isOffline
                  ? `Offline - ${totalPending} changes pending`
                  : totalPending > 0
                    ? `${totalPending} changes pending`
                    : lastSyncAt
                      ? `Synced ${formatDistanceToNow(lastSyncAt, { addSuffix: true })}`
                      : "All changes synced"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-1 h-8", className)}
        >
          {content}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-2 py-1.5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-sm">Sync Status</span>
            {lastSyncAt && !isSyncing && (
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(lastSyncAt, { addSuffix: true })}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded bg-muted/50">
              <div className="font-medium text-lg">{pendingCount}</div>
              <div className="text-muted-foreground">Pending</div>
            </div>
            <div
              className={cn(
                "p-2 rounded",
                failedCount > 0 ? "bg-destructive/10" : "bg-muted/50",
              )}
            >
              <div
                className={cn(
                  "font-medium text-lg",
                  failedCount > 0 && "text-destructive",
                )}
              >
                {failedCount}
              </div>
              <div className="text-muted-foreground">Failed</div>
            </div>
            <div
              className={cn(
                "p-2 rounded",
                conflictCount > 0
                  ? "bg-yellow-100 dark:bg-yellow-900/20"
                  : "bg-muted/50",
              )}
            >
              <div
                className={cn(
                  "font-medium text-lg",
                  conflictCount > 0 && "text-yellow-600",
                )}
              >
                {conflictCount}
              </div>
              <div className="text-muted-foreground">Conflicts</div>
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />

        {recentActions.length > 0 && (
          <>
            <div className="px-2 py-1">
              <span className="text-xs text-muted-foreground">
                Recent Changes
              </span>
            </div>
            {recentActions.map((action) => (
              <DropdownMenuItem
                key={action.id}
                className="flex items-center gap-2 text-xs"
              >
                {action.status === "failed" ? (
                  <AlertCircle className="h-3 w-3 text-destructive" />
                ) : action.status === "syncing" ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Cloud className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{action.type}</span>
                <span className="text-muted-foreground">
                  {formatDistanceToNow(action.updatedAt, { addSuffix: true })}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}

        <div className="p-2 space-y-2">
          {isOnline && totalPending > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw
                className={cn("h-3 w-3 mr-1", isSyncing && "animate-spin")}
              />
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          )}
          {failedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleRetryFailed}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry Failed ({failedCount})
            </Button>
          )}
          {onViewAll && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setIsOpen(false);
                onViewAll();
              }}
            >
              View All Changes
            </Button>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default PendingChangesIndicator;
