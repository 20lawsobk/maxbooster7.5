import { useEffect, useState } from 'react';
import { Clock, AlertTriangle, Check, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { offlineQueue, QueuedAction, syncManager } from '@/lib/offline';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface PendingChangesPanelProps {
  className?: string;
  maxItems?: number;
}

const STATUS_CONFIG = {
  pending: { icon: Clock, label: 'Pending', color: 'text-yellow-500', badge: 'outline' },
  syncing: { icon: RefreshCw, label: 'Syncing', color: 'text-blue-500', badge: 'default' },
  completed: { icon: Check, label: 'Completed', color: 'text-green-500', badge: 'secondary' },
  failed: { icon: AlertTriangle, label: 'Failed', color: 'text-red-500', badge: 'destructive' },
  conflict: { icon: AlertTriangle, label: 'Conflict', color: 'text-orange-500', badge: 'outline' },
} as const;

const PRIORITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

export function PendingChangesPanel({ className, maxItems = 20 }: PendingChangesPanelProps) {
  const [actions, setActions] = useState<QueuedAction[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadActions();

    const unsubAdded = offlineQueue.on('action-added', loadActions);
    const unsubUpdated = offlineQueue.on('action-updated', loadActions);
    const unsubRemoved = offlineQueue.on('action-removed', loadActions);

    const unsubSyncStart = syncManager.on('status-change', (event) => {
      setIsSyncing(event.status === 'syncing');
    });

    return () => {
      unsubAdded();
      unsubUpdated();
      unsubRemoved();
      unsubSyncStart();
    };
  }, []);

  const loadActions = async () => {
    const stats = await offlineQueue.getStats();
    if (stats.total === 0) {
      setActions([]);
      return;
    }

    const pending = await offlineQueue.getAllPending();
    const failed = await offlineQueue.getByStatus('failed');
    const conflicts = await offlineQueue.getByStatus('conflict');

    const allActions = [...pending, ...failed, ...conflicts]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, maxItems);

    setActions(allActions);
  };

  const handleRetry = async (actionId: string) => {
    await offlineQueue.updateAction(actionId, { status: 'pending', retryCount: 0 });
    syncManager.forceSyncAction(actionId);
  };

  const handleDelete = async (actionId: string) => {
    await offlineQueue.dequeue(actionId);
  };

  const handleSyncAll = async () => {
    await syncManager.sync();
  };

  const handleRetryFailed = async () => {
    await syncManager.retryFailed();
  };

  if (actions.length === 0) {
    return null;
  }

  const pendingCount = actions.filter(a => a.status === 'pending').length;
  const failedCount = actions.filter(a => a.status === 'failed').length;
  const conflictCount = actions.filter(a => a.status === 'conflict').length;

  return (
    <Card className={cn('w-full', className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Pending Changes</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {actions.length}
              </Badge>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CardDescription className="text-xs flex items-center gap-3">
            {pendingCount > 0 && <span>{pendingCount} pending</span>}
            {failedCount > 0 && (
              <span className="text-destructive">{failedCount} failed</span>
            )}
            {conflictCount > 0 && (
              <span className="text-orange-500">{conflictCount} conflicts</span>
            )}
          </CardDescription>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-2">
            <div className="flex gap-2 mb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSyncAll}
                disabled={isSyncing || pendingCount === 0}
              >
                <RefreshCw className={cn('h-3 w-3 mr-1', isSyncing && 'animate-spin')} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
              {failedCount > 0 && (
                <Button size="sm" variant="outline" onClick={handleRetryFailed}>
                  Retry Failed
                </Button>
              )}
            </div>

            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {actions.map((action) => {
                  const config = STATUS_CONFIG[action.status];
                  const Icon = config.icon;

                  return (
                    <div
                      key={action.id}
                      className="flex items-start justify-between p-2 rounded-md border bg-muted/30"
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <Icon
                          className={cn(
                            'h-4 w-4 mt-0.5 flex-shrink-0',
                            config.color,
                            action.status === 'syncing' && 'animate-spin'
                          )}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {action.type}
                            </span>
                            <Badge
                              variant={config.badge as 'default' | 'destructive' | 'outline' | 'secondary'}
                              className="text-xs px-1 py-0"
                            >
                              {config.label}
                            </Badge>
                            {action.priority !== 'normal' && (
                              <Badge variant="outline" className="text-xs px-1 py-0">
                                {PRIORITY_LABELS[action.priority]}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(action.updatedAt, { addSuffix: true })}
                          </p>
                          {action.error && (
                            <p className="text-xs text-destructive mt-1 truncate">
                              {action.error}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 ml-2">
                        {action.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleRetry(action.id)}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => handleDelete(action.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default PendingChangesPanel;
