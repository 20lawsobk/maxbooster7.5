import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Send,
  RefreshCw,
  ExternalLink,
  Copy,
  Share2,
} from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  LinkedInIcon,
  TwitterIcon,
  ThreadsIcon,
} from "@/components/ui/brand-icons";
import { useToast } from "@/hooks/use-toast";

export type PostingStage =
  | "preparing"
  | "uploading_media"
  | "optimizing"
  | "publishing"
  | "completed"
  | "failed"
  | "rate_limited"
  | "partially_completed";

export interface PlatformPostStatus {
  platform: string;
  stage: PostingStage;
  progress: number;
  message?: string;
  postUrl?: string;
  error?: string;
  errorCode?: string;
  retryAfter?: number;
}

export interface PostingProgress {
  overallProgress: number;
  currentStage: PostingStage;
  platforms: PlatformPostStatus[];
  startedAt: string;
  completedAt?: string;
  postId?: string;
}

interface RealTimePostingStatusProps {
  progress: PostingProgress | null;
  onRetry?: (platform: string) => void;
  onViewPost?: (platform: string, url: string) => void;
  onDismiss?: () => void;
  showDetails?: boolean;
}

const PLATFORM_ICONS: Record<string, any> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  twitter: TwitterIcon,
  youtube: YouTubeIcon,
  tiktok: TikTokIcon,
  linkedin: LinkedInIcon,
  threads: ThreadsIcon,
};

const PLATFORM_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  instagram: "#E4405F",
  twitter: "#000000",
  youtube: "#FF0000",
  tiktok: "#000000",
  linkedin: "#0077B5",
  threads: "#000000",
};

const STAGE_CONFIG: Record<
  PostingStage,
  {
    label: string;
    icon: React.ReactNode;
    color: string;
    description: string;
  }
> = {
  preparing: {
    label: "Preparing",
    icon: Clock,
    color: "text-blue-500",
    description: "Setting up your post...",
  },
  uploading_media: {
    label: "Uploading Media",
    icon: Loader2,
    color: "text-blue-500",
    description: "Uploading images and videos...",
  },
  optimizing: {
    label: "Optimizing",
    icon: Loader2,
    color: "text-purple-500",
    description: "Optimizing content for each platform...",
  },
  publishing: {
    label: "Publishing",
    icon: Send,
    color: "text-green-500",
    description: "Sending to social platforms...",
  },
  completed: {
    label: "Published",
    icon: CheckCircle,
    color: "text-green-500",
    description: "Successfully published!",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    color: "text-red-500",
    description: "Failed to publish. Click retry.",
  },
  rate_limited: {
    label: "Rate Limited",
    icon: Clock,
    color: "text-orange-500",
    description: "Waiting for rate limit reset...",
  },
  partially_completed: {
    label: "Partially Completed",
    icon: AlertTriangle,
    color: "text-yellow-500",
    description: "Some platforms failed. Retry available.",
  },
};

function PlatformStatusRow({
  status,
  onRetry,
  onViewPost,
}: {
  status: PlatformPostStatus;
  onRetry?: (platform: string) => void;
  onViewPost?: (platform: string, url: string) => void;
}) {
  const [countdown, setCountdown] = useState(status.retryAfter || 0);
  const PlatformIcon = PLATFORM_ICONS[status.platform] || FacebookIcon;
  const stageConfig = STAGE_CONFIG[status.stage];
  const StageIcon = stageConfig.icon;
  const platformColor = PLATFORM_COLORS[status.platform] || "#000000";

  useEffect(() => {
    if (status.retryAfter && status.retryAfter > 0) {
      setCountdown(status.retryAfter);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status.retryAfter]);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ backgroundColor: platformColor + "20" }}
      >
        <PlatformIcon className="w-5 h-5" style={{ color: platformColor }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium capitalize">{status.platform}</span>
          <Badge variant="outline" className={`${stageConfig.color} text-xs`}>
            <StageIcon
              className={`w-3 h-3 mr-1 ${status.stage === "uploading_media" || status.stage === "optimizing" || status.stage === "publishing" ? "animate-spin" : ""}`}
            />
            {stageConfig.label}
          </Badge>
        </div>

        {status.message && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {status.message}
          </p>
        )}

        {status.error && (
          <p className="text-xs text-red-500 mt-0.5">{status.error}</p>
        )}

        {status.stage === "uploading_media" ||
        status.stage === "optimizing" ||
        status.stage === "publishing" ? (
          <Progress value={status.progress} className="h-1 mt-2" />
        ) : null}

        {countdown > 0 && (
          <p className="text-xs text-orange-500 mt-1">
            Retry available in {countdown}s
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {status.stage === "completed" && status.postUrl && onViewPost && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onViewPost(status.platform, status.postUrl!)}
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
        )}

        {(status.stage === "failed" ||
          (status.stage === "rate_limited" && countdown === 0)) &&
          onRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRetry(status.platform)}
              className="text-red-500 border-red-500"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Retry
            </Button>
          )}
      </div>
    </div>
  );
}

export function RealTimePostingStatus({
  progress,
  onRetry,
  onViewPost,
  onDismiss,
  showDetails = true,
}: RealTimePostingStatusProps) {
  const { toast } = useToast();

  if (!progress) return null;

  const overallConfig = STAGE_CONFIG[progress.currentStage];
  const OverallIcon = overallConfig.icon;

  const successCount = progress.platforms.filter(
    (p) => p.stage === "completed",
  ).length;
  const failedCount = progress.platforms.filter(
    (p) => p.stage === "failed" || p.stage === "rate_limited",
  ).length;
  const totalCount = progress.platforms.length;

  const handleCopyPostId = () => {
    if (progress.postId) {
      navigator.clipboard.writeText(progress.postId);
      toast({ title: "Post ID copied to clipboard" });
    }
  };

  const getElapsedTime = () => {
    const start = new Date(progress.startedAt);
    const end = progress.completedAt
      ? new Date(progress.completedAt)
      : new Date();
    const diff = Math.floor((end.getTime() - start.getTime()) / 1000);

    if (diff < 60) return `${diff}s`;
    return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  };

  return (
    <Card
      className={`border-2 ${
        progress.currentStage === "completed"
          ? "border-green-500/50 bg-green-50/50 dark:bg-green-900/10"
          : progress.currentStage === "failed"
            ? "border-red-500/50 bg-red-50/50 dark:bg-red-900/10"
            : progress.currentStage === "partially_completed"
              ? "border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-900/10"
              : "border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10"
      }`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full ${
                progress.currentStage === "completed"
                  ? "bg-green-100 dark:bg-green-900/30"
                  : progress.currentStage === "failed"
                    ? "bg-red-100 dark:bg-red-900/30"
                    : "bg-blue-100 dark:bg-blue-900/30"
              } flex items-center justify-center`}
            >
              <OverallIcon
                className={`w-5 h-5 ${overallConfig.color} ${
                  [
                    "uploading_media",
                    "optimizing",
                    "publishing",
                    "preparing",
                  ].includes(progress.currentStage)
                    ? "animate-spin"
                    : ""
                }`}
              />
            </div>
            <div>
              <CardTitle className="text-lg">{overallConfig.label}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {overallConfig.description}
              </p>
            </div>
          </div>

          {onDismiss && progress.currentStage === "completed" && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              <XCircle className="w-4 h-4" />
            </Button>
          )}
        </div>

        <Progress value={progress.overallProgress} className="h-2 mt-3" />

        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span>
            {successCount} of {totalCount} platforms completed
            {failedCount > 0 && ` (${failedCount} failed)`}
          </span>
          <span>Elapsed: {getElapsedTime()}</span>
        </div>
      </CardHeader>

      {showDetails && (
        <CardContent className="pt-2 space-y-2">
          {progress.platforms.map((platform) => (
            <PlatformStatusRow
              key={platform.platform}
              status={platform}
              onRetry={onRetry}
              onViewPost={onViewPost}
            />
          ))}

          {progress.currentStage === "completed" && progress.postId && (
            <div className="flex items-center justify-between p-3 mt-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium">Post Published</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                  {progress.postId.slice(0, 8)}...
                </code>
                <Button size="sm" variant="ghost" onClick={handleCopyPostId}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline">
                  <Share2 className="w-4 h-4 mr-1" />
                  Share
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function usePostingStatus() {
  const [progress, setProgress] = useState<PostingProgress | null>(null);

  const startPosting = (platforms: string[]) => {
    setProgress({
      overallProgress: 0,
      currentStage: "preparing",
      platforms: platforms.map((p) => ({
        platform: p,
        stage: "preparing",
        progress: 0,
      })),
      startedAt: new Date().toISOString(),
    });
  };

  const updatePlatformStatus = (
    platform: string,
    update: Partial<PlatformPostStatus>,
  ) => {
    setProgress((prev) => {
      if (!prev) return null;

      const platforms = prev.platforms.map((p) =>
        p.platform === platform ? { ...p, ...update } : p,
      );

      const completedCount = platforms.filter(
        (p) => p.stage === "completed",
      ).length;
      const failedCount = platforms.filter((p) => p.stage === "failed").length;
      const overallProgress = Math.round(
        ((completedCount + failedCount) / platforms.length) * 100,
      );

      let currentStage: PostingStage = "publishing";
      if (completedCount + failedCount === platforms.length) {
        if (failedCount === 0) {
          currentStage = "completed";
        } else if (completedCount === 0) {
          currentStage = "failed";
        } else {
          currentStage = "partially_completed";
        }
      }

      return {
        ...prev,
        platforms,
        overallProgress,
        currentStage,
        completedAt:
          currentStage === "completed" ||
          currentStage === "failed" ||
          currentStage === "partially_completed"
            ? new Date().toISOString()
            : undefined,
      };
    });
  };

  const completePosting = (postId: string) => {
    setProgress((prev) =>
      prev
        ? {
            ...prev,
            overallProgress: 100,
            currentStage: "completed",
            postId,
            completedAt: new Date().toISOString(),
          }
        : null,
    );
  };

  const failPosting = (_error: string) => {
    setProgress((prev) =>
      prev
        ? {
            ...prev,
            currentStage: "failed",
            completedAt: new Date().toISOString(),
          }
        : null,
    );
  };

  const resetProgress = () => {
    setProgress(null);
  };

  return {
    progress,
    startPosting,
    updatePlatformStatus,
    completePosting,
    failPosting,
    resetProgress,
  };
}

export default RealTimePostingStatus;
