import { useNetworkStatus, NetworkStatus } from '@/hooks/useNetworkStatus';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Wifi,
  WifiOff,
  Loader2,
  RefreshCw,
  X,
  AlertTriangle,
  Signal,
  SignalLow,
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface ConnectionStatusBarProps {
  position?: 'top' | 'bottom';
  autoHide?: boolean;
  autoHideDelay?: number;
  showOnSlow?: boolean;
  className?: string;
}

const statusConfig: Record<NetworkStatus, {
  icon: React.ReactNode;
  label: string;
  description: string;
  bgColor: string;
  textColor: string;
}> = {
  online: {
    icon: <Wifi className="h-4 w-4" />,
    label: 'Connected',
    description: 'Your connection is stable',
    bgColor: 'bg-green-500',
    textColor: 'text-white',
  },
  offline: {
    icon: <WifiOff className="h-4 w-4" />,
    label: 'Offline',
    description: 'No internet connection. Some features may be unavailable.',
    bgColor: 'bg-red-500',
    textColor: 'text-white',
  },
  slow: {
    icon: <SignalLow className="h-4 w-4" />,
    label: 'Slow Connection',
    description: 'Your connection is slow. Some actions may take longer.',
    bgColor: 'bg-yellow-500',
    textColor: 'text-black',
  },
  reconnecting: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: 'Reconnecting',
    description: 'Attempting to restore connection...',
    bgColor: 'bg-blue-500',
    textColor: 'text-white',
  },
};

export function ConnectionStatusBar({
  position = 'top',
  autoHide = true,
  autoHideDelay = 5000,
  showOnSlow = true,
  className,
}: ConnectionStatusBarProps) {
  const network = useNetworkStatus({ showToasts: false });
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (network.isOffline) {
      setWasOffline(true);
      setIsVisible(true);
      setIsDismissed(false);
    } else if (network.isReconnecting) {
      setIsVisible(true);
      setIsDismissed(false);
    } else if (network.isSlow && showOnSlow) {
      setIsVisible(true);
    } else if (network.isOnline && wasOffline) {
      setIsVisible(true);
      setWasOffline(false);
      
      if (autoHide) {
        const timer = setTimeout(() => {
          setIsVisible(false);
        }, autoHideDelay);
        return () => clearTimeout(timer);
      }
    } else if (!isDismissed) {
      setIsVisible(false);
    }
  }, [network.status, network.isOffline, network.isReconnecting, network.isSlow, network.isOnline, wasOffline, autoHide, autoHideDelay, showOnSlow, isDismissed]);

  if (!isVisible) {
    return null;
  }

  const config = statusConfig[network.status];

  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-[9999] px-4 py-2 flex items-center justify-between gap-4 shadow-lg transition-all duration-300',
        position === 'top' ? 'top-0' : 'bottom-0',
        config.bgColor,
        config.textColor,
        'animate-in slide-in-from-top-2',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0" aria-hidden="true">
          {config.icon}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
          <span className="font-medium text-sm">{config.label}</span>
          <span className="text-xs opacity-90 hidden sm:inline">
            {config.description}
          </span>
        </div>
        
        {network.isReconnecting && network.reconnectAttempts > 0 && (
          <span className="text-xs opacity-75">
            Attempt {network.reconnectAttempts}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {network.isOffline && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={() => network.retry()}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry Now
          </Button>
        )}
        
        {network.isReconnecting && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={() => network.cancelRetry()}
          >
            Cancel
          </Button>
        )}
        
        {(network.isOnline || network.isSlow) && (
          <Button
            size="sm"
            variant="ghost"
            className={cn('h-7 w-7 p-0', config.textColor)}
            onClick={() => {
              setIsVisible(false);
              setIsDismissed(true);
            }}
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function ConnectionStatusIndicator({ className }: { className?: string }) {
  const network = useNetworkStatus({ showToasts: false });

  const getIndicatorProps = () => {
    if (network.isOffline) {
      return {
        icon: <WifiOff className="h-4 w-4" />,
        color: 'text-red-500',
        pulse: false,
        label: 'Offline',
      };
    }
    if (network.isReconnecting) {
      return {
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
        color: 'text-blue-500',
        pulse: true,
        label: 'Reconnecting',
      };
    }
    if (network.isSlow) {
      return {
        icon: <SignalLow className="h-4 w-4" />,
        color: 'text-yellow-500',
        pulse: false,
        label: 'Slow connection',
      };
    }
    return {
      icon: <Signal className="h-4 w-4" />,
      color: 'text-green-500',
      pulse: false,
      label: 'Online',
    };
  };

  const { icon, color, pulse, label } = getIndicatorProps();

  return (
    <div
      className={cn(
        'flex items-center gap-1',
        color,
        pulse && 'animate-pulse',
        className
      )}
      title={label}
      aria-label={label}
    >
      {icon}
    </div>
  );
}

export function OfflineBanner() {
  const network = useNetworkStatus({ showToasts: false });

  if (network.isOnline && !network.isReconnecting) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      <div className="absolute inset-0 bg-gray-900/20 backdrop-blur-[1px]" />
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-4 p-8 pointer-events-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 text-center max-w-md">
          {network.isReconnecting ? (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Reconnecting...</h2>
              <p className="text-muted-foreground mb-4">
                Please wait while we restore your connection.
              </p>
              <p className="text-sm text-muted-foreground">
                Attempt {network.reconnectAttempts} of 5
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <WifiOff className="h-8 w-8 text-red-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2">You're Offline</h2>
              <p className="text-muted-foreground mb-4">
                Check your internet connection and try again.
              </p>
              <Button onClick={() => network.retry()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
