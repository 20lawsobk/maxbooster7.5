import { AlertTriangle, Eye, WifiOff, Clock, Info, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useOfflineCapable } from "@/hooks/useOfflineCapable";

interface OfflineModeWarningProps {
  className?: string;
  variant?: "banner" | "inline" | "floating" | "minimal";
  showReadOnlyBadge?: boolean;
  onDismiss?: () => void;
  featureName?: string;
}

export function OfflineModeWarning({
  className,
  variant = "inline",
  showReadOnlyBadge = true,
  onDismiss,
  featureName,
}: OfflineModeWarningProps) {
  const { isOffline, pendingCount } = useOfflineStatus();
  const {
    isUnavailable,
    isPartiallyCapable,

    unavailableFeatures,
  } = useOfflineCapable();

  if (!isOffline) return null;

  const getWarningLevel = () => {
    if (isUnavailable) return "error";
    if (isPartiallyCapable) return "warning";
    return "info";
  };

  const level = getWarningLevel();

  const getTitle = () => {
    if (isUnavailable)
      return featureName
        ? `${featureName} Unavailable Offline`
        : "Feature Unavailable";
    if (isPartiallyCapable) return "Limited Functionality";
    return "Read-Only Mode";
  };

  const getDescription = () => {
    if (isUnavailable) {
      return "This feature requires an internet connection to work.";
    }
    if (isPartiallyCapable) {
      return "Some features are limited while offline. Changes will sync when you reconnect.";
    }
    return "You can view but not edit. Changes will sync when you reconnect.";
  };

  if (variant === "minimal") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={
                level === "error"
                  ? "destructive"
                  : level === "warning"
                    ? "outline"
                    : "secondary"
              }
              className={cn(
                "gap-1 cursor-help",
                level === "warning" && "border-yellow-500 text-yellow-600",
                className,
              )}
            >
              <Eye className="h-3 w-3" />
              Read-Only
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getDescription()}</p>
            {pendingCount > 0 && (
              <p className="text-xs mt-1 text-muted-foreground">
                {pendingCount} changes pending sync
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === "floating") {
    return (
      <div
        className={cn(
          "fixed bottom-4 right-4 z-50 max-w-sm",
          "bg-background border rounded-lg shadow-lg p-4",
          level === "error" && "border-destructive",
          level === "warning" && "border-yellow-500",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "p-2 rounded-full",
              level === "error"
                ? "bg-destructive/10"
                : level === "warning"
                  ? "bg-yellow-100 dark:bg-yellow-900/20"
                  : "bg-blue-100 dark:bg-blue-900/20",
            )}
          >
            <WifiOff
              className={cn(
                "h-4 w-4",
                level === "error"
                  ? "text-destructive"
                  : level === "warning"
                    ? "text-yellow-600"
                    : "text-blue-600",
              )}
            />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-medium text-sm">{getTitle()}</h4>
              {onDismiss && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onDismiss}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {getDescription()}
            </p>
            {showReadOnlyBadge && (
              <Badge variant="outline" className="mt-2 gap-1">
                <Eye className="h-3 w-3" />
                Read-Only Mode
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "banner") {
    return (
      <div
        className={cn(
          "w-full px-4 py-2 flex items-center justify-between gap-4",
          level === "error"
            ? "bg-destructive text-destructive-foreground"
            : level === "warning"
              ? "bg-yellow-500 text-white"
              : "bg-blue-500 text-white",
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span className="font-medium text-sm">{getTitle()}</span>
          <span className="text-sm opacity-80">•</span>
          <span className="text-sm opacity-80">{getDescription()}</span>
        </div>
        <div className="flex items-center gap-2">
          {showReadOnlyBadge && (
            <Badge variant="secondary" className="gap-1 bg-white/20">
              <Eye className="h-3 w-3" />
              Read-Only
            </Badge>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-white/20"
              onClick={onDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Alert
      variant={level === "error" ? "destructive" : undefined}
      className={cn(
        level === "warning" &&
          "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20",
        level === "info" && "border-blue-500 bg-blue-50 dark:bg-blue-950/20",
        className,
      )}
    >
      <AlertTriangle
        className={cn(
          "h-4 w-4",
          level === "error"
            ? "text-destructive"
            : level === "warning"
              ? "text-yellow-600"
              : "text-blue-600",
        )}
      />
      <AlertTitle className="flex items-center justify-between">
        <span>{getTitle()}</span>
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </AlertTitle>
      <AlertDescription>
        <p className="mb-2">{getDescription()}</p>

        {showReadOnlyBadge && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="gap-1">
              <Eye className="h-3 w-3" />
              Read-Only Mode
            </Badge>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {pendingCount} pending
              </Badge>
            )}
          </div>
        )}

        {unavailableFeatures.length > 0 && isPartiallyCapable && (
          <div className="mt-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Info className="h-3 w-3" />
              Unavailable features:
            </p>
            <div className="flex flex-wrap gap-1">
              {unavailableFeatures.slice(0, 4).map((feature) => (
                <Badge
                  key={feature}
                  variant="outline"
                  className="text-xs px-1.5 py-0"
                >
                  {feature.replace(/([A-Z])/g, " $1").trim()}
                </Badge>
              ))}
              {unavailableFeatures.length > 4 && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  +{unavailableFeatures.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

export default OfflineModeWarning;
