import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Key,
  Shield,
  Link,
  Unlink,
  Loader2,
} from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  LinkedInIcon,
  TwitterIcon,
  ThreadsIcon,
  GoogleIcon,
  MetaIcon,
} from "@/components/ui/brand-icons";

export type PlatformReconnectOutcome =
  | "token_valid"
  | "token_expired"
  | "token_expiring_soon"
  | "token_revoked"
  | "scope_changed"
  | "reauth_required"
  | "provider_maintenance"
  | "connection_lost"
  | "refresh_initiated"
  | "refresh_successful"
  | "refresh_failed";

interface PlatformTokenStatus {
  platform: string;
  platformName: string;
  status: "connected" | "expired" | "expiring_soon" | "disconnected";
  action: "refresh" | "reauthorize" | "connect" | null;
  tokenExpiresAt: string | null;
  expiresInSeconds: number | null;
  lastRefreshed: string | null;
  scopes: string[];
  outcome: string;
}

interface SocialTokenStatusResponse {
  platforms: PlatformTokenStatus[];
  needsAttention: PlatformTokenStatus[];
  hasExpiredTokens: boolean;
  hasExpiringTokens: boolean;
}

const PLATFORM_ICONS: Record<string, any> = {
  meta: MetaIcon,
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  twitter: TwitterIcon,
  youtube: YouTubeIcon,
  tiktok: TikTokIcon,
  linkedin: LinkedInIcon,
  threads: ThreadsIcon,
  googlebusiness: GoogleIcon,
  google: GoogleIcon,
};

const PLATFORM_COLORS: Record<string, string> = {
  meta: "#0081FB",
  facebook: "#1877F2",
  instagram: "#E4405F",
  twitter: "#000000",
  youtube: "#FF0000",
  tiktok: "#000000",
  linkedin: "#0077B5",
  threads: "#000000",
  googlebusiness: "#4285F4",
  google: "#4285F4",
};

interface PlatformReconnectCardProps {
  platform: PlatformTokenStatus;
  onReauthorize?: (platform: string) => void;
  onRefresh?: (platform: string) => void;
  compact?: boolean;
}

export function PlatformReconnectCard({
  platform,
  onReauthorize,
  onRefresh,
  compact = false,
}: PlatformReconnectCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const PlatformIcon = PLATFORM_ICONS[platform.platform] || PLATFORM_ICONS.meta;
  const platformColor = PLATFORM_COLORS[platform.platform] || "#0081FB";

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/auth/social/${platform.platform}/refresh`,
      );
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Token Refreshed",
          description: `${platform.platformName} connection has been refreshed.`,
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/auth/social-token-status"],
        });
      } else if (data.action === "reauthorize") {
        toast({
          title: "Re-authorization Required",
          description: `Please reconnect your ${platform.platformName} account.`,
          variant: "destructive",
        });
        onReauthorize?.(platform.platform);
      }
    },
    onError: () => {
      toast({
        title: "Refresh Failed",
        description: "Please try reconnecting your account.",
        variant: "destructive",
      });
    },
  });

  const handleAction = async () => {
    setIsLoading(true);
    try {
      if (platform.action === "refresh") {
        refreshMutation.mutate();
      } else if (
        platform.action === "reauthorize" ||
        platform.action === "connect"
      ) {
        onReauthorize?.(platform.platform);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimeRemaining = (seconds: number | null): string => {
    if (seconds === null) return "Unknown";
    if (seconds <= 0) return "Expired";

    const hours = Math.floor(seconds / 3600);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h`;
    return `${Math.floor(seconds / 60)}m`;
  };

  const getStatusConfig = () => {
    switch (platform.status) {
      case "connected":
        return {
          label: "Connected",
          icon: CheckCircle,
          color: "text-green-500",
          bgColor: "bg-green-50 dark:bg-green-950",
          borderColor: "border-green-200 dark:border-green-900",
        };
      case "expired":
        return {
          label: "Expired",
          icon: AlertTriangle,
          color: "text-red-500",
          bgColor: "bg-red-50 dark:bg-red-950",
          borderColor: "border-red-200 dark:border-red-900",
        };
      case "expiring_soon":
        return {
          label: "Expiring Soon",
          icon: Clock,
          color: "text-orange-500",
          bgColor: "bg-orange-50 dark:bg-orange-950",
          borderColor: "border-orange-200 dark:border-orange-900",
        };
      case "disconnected":
      default:
        return {
          label: "Disconnected",
          icon: Unlink,
          color: "text-gray-500",
          bgColor: "bg-gray-50 dark:bg-gray-900",
          borderColor: "border-gray-200 dark:border-gray-800",
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;
  const actionNeeded = platform.action !== null;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`relative w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-105 ${statusConfig.bgColor} border-2 ${statusConfig.borderColor}`}
              onClick={actionNeeded ? handleAction : undefined}
            >
              <PlatformIcon
                className="w-6 h-6"
                style={{ color: platformColor }}
              />
              <div
                className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${platform.status === "connected" ? "bg-green-500" : platform.status === "expired" ? "bg-red-500" : "bg-orange-500"} border-2 border-white dark:border-gray-900 flex items-center justify-center`}
              >
                <StatusIcon className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p className="font-medium">{platform.platformName}</p>
              <p className={statusConfig.color}>{statusConfig.label}</p>
              {platform.expiresInSeconds !== null &&
                platform.expiresInSeconds > 0 && (
                  <p className="text-muted-foreground">
                    Expires in {formatTimeRemaining(platform.expiresInSeconds)}
                  </p>
                )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card
      className={`${statusConfig.bgColor} ${statusConfig.borderColor} transition-all hover:shadow-md`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: platformColor + "20" }}
            >
              <PlatformIcon
                className="w-6 h-6"
                style={{ color: platformColor }}
              />
            </div>
            <div>
              <h4 className="font-semibold">{platform.platformName}</h4>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={`${statusConfig.color} text-xs`}
                >
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {statusConfig.label}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {platform.action === "refresh" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleAction}
                disabled={isLoading || refreshMutation.isPending}
                className="text-orange-500 border-orange-500 hover:bg-orange-50"
              >
                {isLoading || refreshMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1" />
                )}
                Refresh
              </Button>
            )}

            {(platform.action === "reauthorize" ||
              platform.action === "connect") && (
              <Button
                size="sm"
                onClick={handleAction}
                disabled={isLoading}
                className={
                  platform.status === "expired"
                    ? "bg-red-500 hover:bg-red-600"
                    : ""
                }
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Key className="w-4 h-4 mr-1" />
                )}
                {platform.action === "connect" ? "Connect" : "Reconnect"}
              </Button>
            )}
          </div>
        </div>

        {platform.status !== "disconnected" && (
          <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
            {platform.expiresInSeconds !== null &&
              platform.expiresInSeconds > 0 && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 w-3" />
                  Token expires in{" "}
                  {formatTimeRemaining(platform.expiresInSeconds)}
                </div>
              )}

            {platform.lastRefreshed && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                Last refreshed:{" "}
                {new Date(platform.lastRefreshed).toLocaleString()}
              </div>
            )}

            {platform.scopes.length > 0 && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {platform.scopes.length} permissions granted
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface PlatformReconnectGridProps {
  onReauthorize?: (platform: string) => void;
  showOnlyIssues?: boolean;
}

export function PlatformReconnectGrid({
  onReauthorize,
  showOnlyIssues = false,
}: PlatformReconnectGridProps) {
  const { user } = useAuth();

  const { data: tokenStatus, isLoading } = useQuery<SocialTokenStatusResponse>({
    queryKey: ["/api/auth/social-token-status"],
    enabled: !!user,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tokenStatus || tokenStatus.platforms.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Link className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No social platforms connected</p>
      </div>
    );
  }

  const platforms = showOnlyIssues
    ? tokenStatus.needsAttention
    : tokenStatus.platforms;

  if (showOnlyIssues && platforms.length === 0) {
    return (
      <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <AlertDescription>
          All social platform connections are healthy.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {tokenStatus.hasExpiredTokens && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Some platform connections have expired and need to be reconnected.
          </AlertDescription>
        </Alert>
      )}

      {tokenStatus.hasExpiringTokens && !tokenStatus.hasExpiredTokens && (
        <Alert className="bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-900">
          <Clock className="h-4 w-4 text-orange-500" />
          <AlertDescription>
            Some platform tokens are expiring soon. Consider refreshing them.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map((platform) => (
          <PlatformReconnectCard
            key={platform.platform}
            platform={platform}
            onReauthorize={onReauthorize}
          />
        ))}
      </div>
    </div>
  );
}

export default PlatformReconnectCard;
