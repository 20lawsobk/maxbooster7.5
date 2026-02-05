import { RefreshCw, Check, AlertTriangle, Pause, Play } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { syncManager } from '@/lib/offline';
import { formatDistanceToNow } from 'date-fns';

interface SyncProgressProps {
  className?: string;
  showPauseResume?: boolean;
  compact?: boolean;
}

export function SyncProgress({ className, showPauseResume = false, compact = false }: SyncProgressProps) {
  const { syncStatus, syncProgress, pendingCount, failedCount, lastSyncAt } = useOfflineStatus();

  const progressPercent = syncProgress.total > 0
    ? Math.round((syncProgress.completed / syncProgress.total) * 100)
    : 0;

  const isPaused = syncStatus === 'paused';
  const isSyncing = syncStatus === 'syncing';
  const hasError = syncStatus === 'error';

  const handlePauseResume = () => {
    if (isPaused) {
      syncManager.resume();
    } else {
      syncManager.pause();
    }
  };

  const handleRetry = () => {
    syncManager.retryFailed();
  };

  const handleSync = () => {
    syncManager.sync();
  };

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {isSyncing ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              Syncing {syncProgress.completed}/{syncProgress.total}
            </span>
          </>
        ) : hasError ? (
          <>
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">{failedCount} failed</span>
            <Button variant="ghost" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </>
        ) : pendingCount > 0 ? (
          <>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{pendingCount} pending</span>
            <Button variant="ghost" size="sm" onClick={handleSync}>
              Sync
            </Button>
          </>
        ) : lastSyncAt ? (
          <>
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-sm text-muted-foreground">
              Synced {formatDistanceToNow(lastSyncAt, { addSuffix: true })}
            </span>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardContent className="pt-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isSyncing ? (
                <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              ) : hasError ? (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              ) : (
                <Check className="h-5 w-5 text-green-500" />
              )}
              <span className="font-medium">
                {isSyncing
                  ? 'Syncing Changes'
                  : hasError
                  ? 'Sync Failed'
                  : 'All Changes Synced'}
              </span>
            </div>

            {showPauseResume && (isSyncing || isPaused) && (
              <Button variant="ghost" size="icon" onClick={handlePauseResume}>
                {isPaused ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          {isSyncing && (
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {syncProgress.completed} of {syncProgress.total} completed
                </span>
                <span>{progressPercent}%</span>
              </div>
              {syncProgress.estimatedTimeRemaining && (
                <p className="text-xs text-muted-foreground">
                  Estimated time remaining: {Math.ceil(syncProgress.estimatedTimeRemaining / 1000)}s
                </p>
              )}
            </div>
          )}

          {hasError && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">
                {failedCount} item{failedCount !== 1 ? 's' : ''} failed to sync
              </p>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Failed
              </Button>
            </div>
          )}

          {!isSyncing && !hasError && pendingCount > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending
              </p>
              <Button variant="outline" size="sm" onClick={handleSync}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Now
              </Button>
            </div>
          )}

          {lastSyncAt && !isSyncing && (
            <p className="text-xs text-muted-foreground">
              Last synced {formatDistanceToNow(lastSyncAt, { addSuffix: true })}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SyncProgress;
