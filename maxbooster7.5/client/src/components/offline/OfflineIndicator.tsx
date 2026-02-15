import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';

interface OfflineIndicatorProps {
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const badgeSizeClasses = {
  sm: 'text-xs px-1.5 py-0',
  md: 'text-xs px-2 py-0.5',
  lg: 'text-sm px-2.5 py-1',
};

export function OfflineIndicator({ className, showLabel = true, size = 'md' }: OfflineIndicatorProps) {
  const { isOnline, isOffline, isReconnecting, status, pendingCount } = useOfflineStatus();

  const getStatusConfig = () => {
    if (isReconnecting) {
      return {
        icon: RefreshCw,
        label: 'Reconnecting...',
        variant: 'warning' as const,
        className: 'animate-spin',
      };
    }

    if (isOffline) {
      return {
        icon: WifiOff,
        label: 'Offline',
        variant: 'destructive' as const,
        className: '',
      };
    }

    if (status === 'slow') {
      return {
        icon: AlertCircle,
        label: 'Slow Connection',
        variant: 'warning' as const,
        className: '',
      };
    }

    return {
      icon: Wifi,
      label: 'Online',
      variant: 'success' as const,
      className: '',
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const tooltipContent = (
    <div className="space-y-1">
      <p className="font-medium">{config.label}</p>
      {isOffline && pendingCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {pendingCount} changes pending sync
        </p>
      )}
      {isOnline && (
        <p className="text-xs text-muted-foreground">
          All changes synced
        </p>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={config.variant === 'success' ? 'default' : config.variant === 'warning' ? 'outline' : 'destructive'}
            className={cn(
              badgeSizeClasses[size],
              'gap-1 cursor-default',
              config.variant === 'warning' && 'border-yellow-500 text-yellow-600 dark:text-yellow-400',
              config.variant === 'success' && 'bg-green-500 hover:bg-green-500',
              className
            )}
          >
            <Icon className={cn(sizeClasses[size], config.className)} />
            {showLabel && <span>{config.label}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default OfflineIndicator;
