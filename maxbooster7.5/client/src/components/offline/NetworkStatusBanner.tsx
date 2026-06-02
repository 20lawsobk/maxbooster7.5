import { useState, useEffect } from "react";
import {
  Wifi,
  WifiOff,
  Signal,
  SignalLow,
  SignalMedium,
  RefreshCw,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { syncManager } from "@/lib/offline";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";

interface NetworkStatusBannerProps {
  className?: string;
  variant?: "full" | "compact" | "minimal";
  position?: "top" | "bottom" | "inline";
  showReconnectProgress?: boolean;
  autoDismiss?: boolean;
  autoDismissDelay?: number;
  onDismiss?: () => void;
}

const RECONNECT_MESSAGES = [
  "Checking connection...",
  "Attempting to reconnect...",
  "Establishing connection...",
  "Almost there...",
];

export function NetworkStatusBanner({
  className,
  variant = "full",
  position = "top",
  showReconnectProgress = true,
  autoDismiss = true,
  autoDismissDelay = 5000,
  onDismiss,
}: NetworkStatusBannerProps) {
  const {
    isOnline,
    isOffline,
    isReconnecting,
    syncStatus,
    pendingCount,
    status,
  } = useOfflineStatus();
  const [visible, setVisible] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectProgress, setReconnectProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isOffline && !dismissed) {
      setVisible(true);
    } else if (isReconnecting) {
      setVisible(true);
      setReconnectAttempt((prev) => prev + 1);
    } else if (isOnline && autoDismiss) {
      const timer = setTimeout(() => {
        setVisible(false);
        setDismissed(false);
      }, autoDismissDelay);
      return () => clearTimeout(timer);
    }
  }, [
    isOnline,
    isOffline,
    isReconnecting,
    autoDismiss,
    autoDismissDelay,
    dismissed,
  ]);

  useEffect(() => {
    if (isReconnecting && showReconnectProgress) {
      const interval = setInterval(() => {
        setReconnectProgress((prev) => Math.min(prev + 10, 90));
      }, 500);
      return () => clearInterval(interval);
    } else if (isOnline) {
      setReconnectProgress(100);
      setTimeout(() => setReconnectProgress(0), 1000);
    } else {
      setReconnectProgress(0);
    }
  }, [isReconnecting, isOnline, showReconnectProgress]);

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    onDismiss?.();
  };

  const handleRetryConnection = async () => {
    setReconnectProgress(0);
    await syncManager.sync();
  };

  if (!visible) return null;

  const getConnectionIcon = () => {
    if (isOffline) return WifiOff;
    if (isReconnecting) return RefreshCw;
    if (status === "slow") return SignalLow;
    return Wifi;
  };

  const getConnectionQualityIcon = () => {
    if (isOffline) return null;
    if (status === "slow") return SignalLow;
    if (status === "online") return Signal;
    return SignalMedium;
  };

  const Icon = getConnectionIcon();
  const QualityIcon = getConnectionQualityIcon();

  const getStatusText = () => {
    if (isOffline) return "You're offline";
    if (isReconnecting)
      return RECONNECT_MESSAGES[reconnectAttempt % RECONNECT_MESSAGES.length];
    if (status === "slow") return "Slow connection detected";
    return "Connected";
  };

  const getStatusDescription = () => {
    if (isOffline) {
      return pendingCount > 0
        ? `${pendingCount} changes will sync when you're back online`
        : "Your changes will be saved locally";
    }
    if (isReconnecting) {
      return "Syncing your offline changes...";
    }
    if (status === "slow") {
      return "Some features may be slower than usual";
    }
    return "All systems operational";
  };

  const positionClasses = {
    top: "fixed top-0 left-0 right-0 z-50",
    bottom: "fixed bottom-0 left-0 right-0 z-50",
    inline: "",
  };

  if (variant === "minimal") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-sm rounded-full",
          isOffline
            ? "bg-destructive/10 text-destructive"
            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200",
          positionClasses[position],
          className,
        )}
      >
        <Icon className={cn("h-4 w-4", isReconnecting && "animate-spin")} />
        <span>{getStatusText()}</span>
        {!isReconnecting && (
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 p-0"
            onClick={handleDismiss}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-4 px-4 py-2",
          isOffline
            ? "bg-destructive text-destructive-foreground"
            : "bg-yellow-500 text-white",
          positionClasses[position],
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", isReconnecting && "animate-spin")} />
          <span className="text-sm font-medium">{getStatusText()}</span>
          {pendingCount > 0 && (
            <span className="text-xs opacity-80">({pendingCount} pending)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOffline && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRetryConnection}
              className="h-7 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-white/20"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Alert
      variant={isOffline ? "destructive" : undefined}
      className={cn(
        isOffline
          ? "border-destructive bg-destructive/10"
          : isReconnecting
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
            : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20",
        positionClasses[position],
        position !== "inline" && "rounded-none border-x-0",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            "h-5 w-5 mt-0.5",
            isOffline
              ? "text-destructive"
              : isReconnecting
                ? "text-blue-500 animate-spin"
                : "text-yellow-500",
          )}
        />
        <div className="flex-1">
          <AlertTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>{getStatusText()}</span>
              {QualityIcon && !isOffline && !isReconnecting && (
                <QualityIcon className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            {onDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleDismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </AlertTitle>
          <AlertDescription className="mt-1">
            <p className="text-sm">{getStatusDescription()}</p>

            {isReconnecting && showReconnectProgress && (
              <div className="mt-3 space-y-2">
                <Progress value={reconnectProgress} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  Syncing... {Math.round(reconnectProgress)}%
                </p>
              </div>
            )}

            {isOffline && (
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetryConnection}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Check Connection
                </Button>
              </div>
            )}
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}

export default NetworkStatusBanner;
