import { useEffect, useState } from 'react';
import { RefreshCw, Check, AlertTriangle, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { syncManager, SyncProgress, SyncStatus } from '@/lib/offline';

interface SyncStatusBarProps {
  className?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function SyncStatusBar({ className, onRetry, onDismiss }: SyncStatusBarProps) {
  const [status, setStatus] = useState<SyncStatus>(syncManager.getStatus());
  const [progress, setProgress] = useState<SyncProgress>(syncManager.getProgress());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unsubStatus = syncManager.on('status-change', (event) => {
      if (event.status) {
        setStatus(event.status);
        setVisible(event.status === 'syncing' || event.status === 'error');
      }
    });

    const unsubProgress = syncManager.on('progress-update', (event) => {
      if (event.progress) {
        setProgress(event.progress);
      }
    });

    const unsubComplete = syncManager.on('sync-complete', () => {
      setTimeout(() => {
        setVisible(false);
      }, 2000);
    });

    return () => {
      unsubStatus();
      unsubProgress();
      unsubComplete();
    };
  }, []);

  if (!visible) return null;

  const progressPercent = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const getStatusContent = () => {
    switch (status) {
      case 'syncing':
        return {
          icon: RefreshCw,
          iconClass: 'animate-spin',
          title: 'Syncing changes...',
          description: `${progress.completed} of ${progress.total} completed`,
          showProgress: true,
          variant: 'default' as const,
        };
      case 'error':
        return {
          icon: AlertTriangle,
          iconClass: '',
          title: 'Sync failed',
          description: `${progress.failed} items failed to sync`,
          showProgress: false,
          variant: 'destructive' as const,
        };
      default:
        return {
          icon: Check,
          iconClass: '',
          title: 'All changes synced',
          description: '',
          showProgress: false,
          variant: 'success' as const,
        };
    }
  };

  const content = getStatusContent();
  const Icon = content.icon;

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
        'bg-background border rounded-lg shadow-lg p-4 min-w-[320px] max-w-md',
        content.variant === 'destructive' && 'border-destructive',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('h-5 w-5 mt-0.5 text-primary', content.iconClass)} />

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{content.title}</p>
          {content.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{content.description}</p>
          )}

          {content.showProgress && (
            <div className="mt-2 space-y-1">
              <Progress value={progressPercent} className="h-1.5" />
              <p className="text-xs text-muted-foreground text-right">
                {progressPercent}%
              </p>
            </div>
          )}

          {status === 'error' && onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="mt-2"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
        </div>

        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              setVisible(false);
              onDismiss();
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default SyncStatusBar;
