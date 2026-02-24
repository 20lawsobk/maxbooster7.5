import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';
import {
  RefreshCw,
  Check,
  AlertTriangle,
  Pause,
  Play,
  Clock,
  Cloud,
  CloudOff,
  Settings,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { syncManager, offlineQueue, offlineCache, QueuedAction } from '@/lib/offline';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { formatDistanceToNow } from 'date-fns';

interface SyncStatusPanelProps {
  className?: string;
  showAdvancedOptions?: boolean;
  showCacheStats?: boolean;
  onOpenConflicts?: () => void;
  onOpenSettings?: () => void;
}

interface CacheStats {
  totalEntries: number;
  totalSize: number;
  byCategory: Record<string, { count: number; size: number }>;
  hitRate: number;
}

export function SyncStatusPanel({
  className,
  showAdvancedOptions = true,
  showCacheStats = true,
  onOpenConflicts,
  onOpenSettings,
}: SyncStatusPanelProps) {
  const {
    isOnline,
    isOffline,
    syncStatus,
    syncProgress,
    pendingCount,
    failedCount,
    conflictCount,
    lastSyncAt,
  } = useOfflineStatus();

  const [autoSync, setAutoSync] = useState(true);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [recentActions, setRecentActions] = useState<QueuedAction[]>([]);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const isSyncing = syncStatus === 'syncing';
  const isPaused = syncStatus === 'paused';
  const hasError = syncStatus === 'error';

  useEffect(() => {
    loadData();
  }, [pendingCount, failedCount, syncStatus]);

  const loadData = async () => {
    try {
      const pending = await offlineQueue.getAllPending();
      const failed = await offlineQueue.getByStatus('failed');
      setRecentActions([...pending, ...failed].slice(0, 5));

      if (showCacheStats) {
        const stats = await offlineCache.getStats();
        setCacheStats(stats);
      }
    } catch (error) {
      logger.error('Failed to load sync data:', error);
    }
  };

  const progressPercent = syncProgress.total > 0
    ? Math.round((syncProgress.completed / syncProgress.total) * 100)
    : 0;

  const handleSync = async () => {
    await syncManager.sync();
  };

  const handleRetryFailed = async () => {
    await syncManager.retryFailed();
  };

  const handlePauseResume = () => {
    if (isPaused) {
      syncManager.resume();
    } else {
      syncManager.pause();
    }
  };

  const handleClearQueue = async () => {
    if (window.confirm('Are you sure you want to clear all pending changes? This cannot be undone.')) {
      await offlineQueue.clearAll();
      loadData();
    }
  };

  const handleClearCache = async () => {
    if (window.confirm('Are you sure you want to clear the offline cache?')) {
      await offlineCache.clear();
      loadData();
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusConfig = () => {
    if (isOffline) {
      return {
        icon: CloudOff,
        title: 'Offline',
        description: 'Changes will sync when you reconnect',
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
      };
    }
    if (isSyncing) {
      return {
        icon: RefreshCw,
        title: 'Syncing',
        description: `${syncProgress.completed} of ${syncProgress.total} completed`,
        color: 'text-blue-500',
        bgColor: 'bg-blue-100 dark:bg-blue-900/20',
        iconClass: 'animate-spin',
      };
    }
    if (hasError) {
      return {
        icon: AlertTriangle,
        title: 'Sync Failed',
        description: `${failedCount} items failed to sync`,
        color: 'text-destructive',
        bgColor: 'bg-destructive/10',
      };
    }
    if (isPaused) {
      return {
        icon: Pause,
        title: 'Sync Paused',
        description: 'Sync has been paused',
        color: 'text-muted-foreground',
        bgColor: 'bg-muted',
      };
    }
    return {
      icon: Check,
      title: 'All Synced',
      description: lastSyncAt ? `Last synced ${formatDistanceToNow(lastSyncAt, { addSuffix: true })}` : 'Everything is up to date',
      color: 'text-green-500',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
    };
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', statusConfig.bgColor)}>
              <StatusIcon className={cn('h-5 w-5', statusConfig.color, statusConfig.iconClass)} />
            </div>
            <div>
              <CardTitle className="text-lg">{statusConfig.title}</CardTitle>
              <CardDescription className="text-sm">{statusConfig.description}</CardDescription>
            </div>
          </div>
          {isOnline && (
            <Badge variant={isOnline ? 'default' : 'secondary'} className="gap-1">
              <Cloud className="h-3 w-3" />
              Online
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isSyncing && (
          <div className="space-y-2">
            <Progress value={progressPercent} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{syncProgress.current ? `Syncing: ${syncProgress.current}` : 'Syncing...'}</span>
              <span>{progressPercent}%</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-lg bg-muted/50">
            <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className="font-semibold">{pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          <div className={cn('p-3 rounded-lg', failedCount > 0 ? 'bg-destructive/10' : 'bg-muted/50')}>
            <AlertTriangle className={cn('h-4 w-4 mx-auto mb-1', failedCount > 0 ? 'text-destructive' : 'text-muted-foreground')} />
            <div className={cn('font-semibold', failedCount > 0 && 'text-destructive')}>{failedCount}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
          <div className={cn('p-3 rounded-lg', conflictCount > 0 ? 'bg-yellow-100 dark:bg-yellow-900/20' : 'bg-muted/50')}>
            <AlertTriangle className={cn('h-4 w-4 mx-auto mb-1', conflictCount > 0 ? 'text-yellow-600' : 'text-muted-foreground')} />
            <div className={cn('font-semibold', conflictCount > 0 && 'text-yellow-600')}>{conflictCount}</div>
            <div className="text-xs text-muted-foreground">Conflicts</div>
          </div>
        </div>

        <div className="flex gap-2">
          {isOnline && (
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={handleSync}
              disabled={isSyncing || pendingCount === 0}
            >
              <RefreshCw className={cn('h-4 w-4 mr-1', isSyncing && 'animate-spin')} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          )}
          {(isSyncing || isPaused) && (
            <Button variant="outline" size="sm" onClick={handlePauseResume}>
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
          )}
          {failedCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleRetryFailed}>
              Retry Failed
            </Button>
          )}
          {conflictCount > 0 && onOpenConflicts && (
            <Button variant="outline" size="sm" onClick={onOpenConflicts}>
              Resolve Conflicts
            </Button>
          )}
        </div>

        {recentActions.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2">Recent Changes</h4>
              <ScrollArea className="h-[120px]">
                <div className="space-y-1">
                  {recentActions.map((action) => (
                    <div
                      key={action.id}
                      className="flex items-center justify-between p-2 text-sm rounded bg-muted/30"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {action.status === 'failed' ? (
                          <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
                        ) : (
                          <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        )}
                        <span className="truncate">{action.type}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatDistanceToNow(action.updatedAt, { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        {showAdvancedOptions && (
          <>
            <Separator />
            <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-1">
                    <Settings className="h-4 w-4" />
                    Advanced Options
                  </span>
                  <ChevronRight className={cn('h-4 w-4 transition-transform', isAdvancedOpen && 'rotate-90')} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto-sync</p>
                    <p className="text-xs text-muted-foreground">Automatically sync when online</p>
                  </div>
                  <Switch checked={autoSync} onCheckedChange={setAutoSync} />
                </div>

                {showCacheStats && cacheStats && (
                  <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Cache Size</span>
                      <span className="font-medium">{formatBytes(cacheStats.totalSize)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Cached Items</span>
                      <span className="font-medium">{cacheStats.totalEntries}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Hit Rate</span>
                      <span className="font-medium">{Math.round(cacheStats.hitRate * 100)}%</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleClearCache}
                  >
                    Clear Cache
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={handleClearQueue}
                    disabled={pendingCount === 0 && failedCount === 0}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear Queue
                  </Button>
                </div>

                {onOpenSettings && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={onOpenSettings}>
                    <Settings className="h-4 w-4 mr-1" />
                    Sync Settings
                  </Button>
                )}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default SyncStatusPanel;
