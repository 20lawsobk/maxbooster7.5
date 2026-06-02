import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Link,
  Unlink,
  Shield,
  Key,
  MoreVertical,
  ExternalLink,
  Settings,
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

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "expired"
  | "error"
  | "scope_changed"
  | "unavailable"
  | "pending_approval";

export interface PlatformConnectionState {
  id: string;
  name: string;
  status: ConnectionStatus;
  username?: string;
  profileUrl?: string;
  followerCount?: number;
  lastSync?: string;
  tokenExpiresAt?: string;
  scopes?: string[];
  scopesMissing?: string[];
  errorMessage?: string;
  retryAfter?: number;
}

interface OAuthStatusIndicatorProps {
  platform: PlatformConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh?: () => void;
  onReauthorize?: () => void;
  compact?: boolean;
  showDetails?: boolean;
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

const STATUS_CONFIG: Record<
  ConnectionStatus,
  {
    label: string;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  connected: {
    label: "Connected",
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-900/20",
    borderColor: "border-green-200 dark:border-green-800",
  },
  disconnected: {
    label: "Not Connected",
    icon: Unlink,
    color: "text-gray-500",
    bgColor: "bg-gray-50 dark:bg-gray-800",
    borderColor: "border-gray-200 dark:border-gray-700",
  },
  connecting: {
    label: "Connecting...",
    icon: Loader2,
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  expired: {
    label: "Session Expired",
    icon: Clock,
    color: "text-orange-500",
    bgColor: "bg-orange-50 dark:bg-orange-900/20",
    borderColor: "border-orange-200 dark:border-orange-800",
  },
  error: {
    label: "Connection Error",
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-900/20",
    borderColor: "border-red-200 dark:border-red-800",
  },
  scope_changed: {
    label: "Permissions Changed",
    icon: Shield,
    color: "text-purple-500",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    borderColor: "border-purple-200 dark:border-purple-800",
  },
  unavailable: {
    label: "Platform Unavailable",
    icon: AlertTriangle,
    color: "text-yellow-500",
    bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
    borderColor: "border-yellow-200 dark:border-yellow-800",
  },
  pending_approval: {
    label: "Pending Approval",
    icon: Clock,
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
};

export function OAuthStatusIndicator({
  platform,
  onConnect,
  onDisconnect,
  onRefresh,
  onReauthorize,
  compact = false,
  showDetails = true,
}: OAuthStatusIndicatorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const statusConfig = STATUS_CONFIG[platform.status];
  const StatusIcon = statusConfig.icon;
  const PlatformIcon = PLATFORM_ICONS[platform.id] || PLATFORM_ICONS.meta;
  const platformColor = PLATFORM_COLORS[platform.id] || "#0081FB";

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      await onConnect();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await onDisconnect();
    } finally {
      setIsLoading(false);
    }
  };

  const getTimeUntilExpiry = () => {
    if (!platform.tokenExpiresAt) return null;
    const expiresAt = new Date(platform.tokenExpiresAt);
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();

    if (diff <= 0) return "Expired";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h remaining`;
    return "Expires soon";
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`relative w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-105 ${statusConfig.bgColor} border-2 ${statusConfig.borderColor}`}
              onClick={
                platform.status === "disconnected" ? handleConnect : undefined
              }
            >
              <PlatformIcon
                className="w-6 h-6"
                style={{ color: platformColor }}
              />
              <div
                className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${platform.status === "connected" ? "bg-green-500" : platform.status === "disconnected" ? "bg-gray-400" : "bg-orange-500"} border-2 border-white dark:border-gray-900 flex items-center justify-center`}
              >
                <StatusIcon className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p className="font-medium">{platform.name}</p>
              <p className={statusConfig.color}>{statusConfig.label}</p>
              {platform.username && (
                <p className="text-muted-foreground">@{platform.username}</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card
      className={`${statusConfig.bgColor} border ${statusConfig.borderColor} transition-all hover:shadow-md`}
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
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">{platform.name}</h4>
                {platform.status === "connecting" && (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                )}
              </div>
              {platform.username && (
                <p className="text-sm text-muted-foreground">
                  @{platform.username}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={`${statusConfig.color} text-xs`}
                >
                  <StatusIcon
                    className={`w-3 h-3 mr-1 ${platform.status === "connecting" ? "animate-spin" : ""}`}
                  />
                  {statusConfig.label}
                </Badge>
                {platform.followerCount !== undefined &&
                  platform.followerCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {formatNumber(platform.followerCount)} followers
                    </Badge>
                  )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {platform.status === "disconnected" && (
              <Button size="sm" onClick={handleConnect} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Link className="w-4 h-4 mr-1" />
                )}
                Connect
              </Button>
            )}

            {platform.status === "expired" && (
              <Button
                size="sm"
                variant="outline"
                onClick={onReauthorize || handleConnect}
                disabled={isLoading}
                className="text-orange-500 border-orange-500 hover:bg-orange-50"
              >
                <Key className="w-4 h-4 mr-1" />
                Reconnect
              </Button>
            )}

            {platform.status === "scope_changed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={onReauthorize || handleConnect}
                disabled={isLoading}
                className="text-purple-500 border-purple-500 hover:bg-purple-50"
              >
                <Shield className="w-4 h-4 mr-1" />
                Update Permissions
              </Button>
            )}

            {(platform.status === "connected" ||
              platform.status === "error") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onRefresh && (
                    <DropdownMenuItem onClick={onRefresh}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh Connection
                    </DropdownMenuItem>
                  )}
                  {platform.profileUrl && (
                    <DropdownMenuItem
                      onClick={() => window.open(platform.profileUrl, "_blank")}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Profile
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDisconnect}
                    className="text-red-500 focus:text-red-500"
                  >
                    <Unlink className="w-4 h-4 mr-2" />
                    Disconnect
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {showDetails && platform.status !== "disconnected" && (
          <div className="mt-4 pt-4 border-t border-border/50">
            {platform.errorMessage && (
              <div className="flex items-start gap-2 text-sm text-red-500 mb-2">
                <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>{platform.errorMessage}</p>
              </div>
            )}

            {platform.tokenExpiresAt && platform.status === "connected" && (
              <div className="text-xs text-muted-foreground">
                <Clock className="w-3 h-3 inline mr-1" />
                {getTimeUntilExpiry()}
              </div>
            )}

            {platform.lastSync && (
              <div className="text-xs text-muted-foreground mt-1">
                <RefreshCw className="w-3 h-3 inline mr-1" />
                Last synced: {new Date(platform.lastSync).toLocaleString()}
              </div>
            )}

            {platform.scopesMissing && platform.scopesMissing.length > 0 && (
              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs">
                <p className="font-medium text-yellow-700 dark:text-yellow-400 mb-1">
                  Missing Permissions:
                </p>
                <ul className="list-disc list-inside text-yellow-600 dark:text-yellow-500">
                  {platform.scopesMissing.map((scope) => (
                    <li key={scope}>{scope}</li>
                  ))}
                </ul>
              </div>
            )}

            {platform.retryAfter && (
              <div className="mt-2">
                <Progress
                  value={(platform.retryAfter / 60) * 100}
                  className="h-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Available again in {platform.retryAfter}s
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OAuthStatusGrid({
  platforms,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  platforms: PlatformConnectionState[];
  onConnect: (platformId: string) => void;
  onDisconnect: (platformId: string) => void;
  onRefresh?: (platformId: string) => void;
}) {
  const connectedCount = platforms.filter(
    (p) => p.status === "connected",
  ).length;
  const hasIssues = platforms.some((p) =>
    ["expired", "error", "scope_changed"].includes(p.status),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Connected Platforms</h3>
          <p className="text-sm text-muted-foreground">
            {connectedCount} of {platforms.length} platforms connected
          </p>
        </div>
        {hasIssues && (
          <Badge
            variant="outline"
            className="text-orange-500 border-orange-500"
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            Action Required
          </Badge>
        )}
      </div>

      <Progress
        value={(connectedCount / platforms.length) * 100}
        className="h-2"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {platforms.map((platform) => (
          <OAuthStatusIndicator
            key={platform.id}
            platform={platform}
            onConnect={() => onConnect(platform.id)}
            onDisconnect={() => onDisconnect(platform.id)}
            onRefresh={onRefresh ? () => onRefresh(platform.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export default OAuthStatusIndicator;
