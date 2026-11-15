import { WifiOff, Check, X, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useOfflineCapable } from "@/hooks/useOfflineCapable";

interface OfflineModeBannerProps {
  className?: string;
  onDismiss?: () => void;
  showCapabilities?: boolean;
}

const OFFLINE_CAPABILITIES = [
  { feature: "Edit projects", available: true },
  { feature: "Play audio", available: true },
  { feature: "Save drafts", available: true },
  { feature: "View cached analytics", available: true },
  { feature: "AI features", available: false },
  { feature: "Distribution", available: false },
  { feature: "Social posting", available: false },
  { feature: "Marketplace", available: false },
];

export function OfflineModeBanner({
  className,
  onDismiss,
  showCapabilities = true,
}: OfflineModeBannerProps) {
  const { isOffline, pendingCount } = useOfflineStatus();
  const { isFullyCapable } = useOfflineCapable();

  if (!isOffline) return null;

  return (
    <Alert
      variant="destructive"
      className={cn(
        "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20",
        className,
      )}
    >
      <WifiOff className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>You're offline</span>
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
        <p className="mb-3">
          Don't worry! Your work is being saved locally.
          {pendingCount > 0 &&
            ` ${pendingCount} changes will sync when you're back online.`}
        </p>

        {showCapabilities && (
          <div className="space-y-2">
            <p className="text-xs font-medium flex items-center gap-1">
              <Info className="h-3 w-3" />
              What you can do offline:
            </p>
            <div className="grid grid-cols-2 gap-1 text-xs">
              {OFFLINE_CAPABILITIES.map(({ feature, available }) => (
                <div
                  key={feature}
                  className={cn(
                    "flex items-center gap-1",
                    available
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground",
                  )}
                >
                  {available ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isFullyCapable && (
          <p className="mt-3 text-xs text-green-600 dark:text-green-400">
            ✓ This page is fully available offline
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

export default OfflineModeBanner;
