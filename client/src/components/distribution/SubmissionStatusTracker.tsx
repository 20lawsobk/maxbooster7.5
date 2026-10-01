// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, CheckCircle2, Clock, AlertCircle, XCircle, Loader2, ExternalLink, RotateCcw, ChevronRight, Calendar, Info, Zap, AlertTriangle } from "lucide-react";
import {
  SpotifyIcon,
  AppleMusicIcon,
  YouTubeIcon,
  AmazonIcon,
  TidalIcon,
  DeezerIcon,
  SoundCloudIcon,
} from "@/components/ui/brand-icons";

interface PlatformSubmissionStatus {
  platform: string;
  platformName: string;
  status:
    | "queued"
    | "pending"
    | "processing"
    | "delivered"
    | "live"
    | "failed"
    | "rejected"
    | "not_supported";
  deliveredAt?: string;
  liveAt?: string;
  errorMessage?: string;
  errorCode?: string;
  errorResolution?: string[];
  retryCount?: number;
  maxRetries?: number;
  lastAttempt?: string;
  externalId?: string;
  validationErrors?: ValidationError[];
}

interface ValidationError {
  field: string;
  message: string;
  code: string;
  suggestion?: string;
  severity: "error" | "warning";
}

interface SubmissionSummary {
  totalPlatforms: number;
  queued: number;
  processing: number;
  delivered: number;
  live: number;
  failed: number;
}

interface SubmissionStatusTrackerProps {
  releaseId: string;
  releaseTitle?: string;
  onRetry?: (platform: string) => void;
  onCancel?: (platform: string) => void;
}

const PLATFORM_CONFIG: Record<
  string,
  { icon: Record<string, unknown>; color: string }
> = {
  spotify: { icon: SpotifyIcon, color: "#1DB954" },
  "apple-music": {
    icon: AppleMusicIcon,
    color: "#FA243C",
  },
  "youtube-music": {
    icon: YouTubeIcon,
    color: "#FF0000",
  },
  "amazon-music": {
    icon: AmazonIcon,
    color: "#FF9900",
  },
  tidal: { icon: TidalIcon, color: "#000000" },
  deezer: { icon: DeezerIcon, color: "#FEAA2D" },
  soundcloud: {
    icon: SoundCloudIcon,
    color: "#FF3300",
  },
};

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    icon: Record<string, unknown>;
    description: string;
  }
> = {
  queued: {
    label: "In Queue",
    color: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    icon: Clock,
    description: "Waiting in submission queue",
  },
  pending: {
    label: "Awaiting Submission",
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    icon: Clock,
    description: "Release will be submitted soon",
  },
  processing: {
    label: "Being Processed",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: Loader2,
    description: "Currently being processed by platform",
  },
  delivered: {
    label: "Awaiting Approval",
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    icon: Clock,
    description: "Received by platform, pending approval",
  },
  live: {
    label: "Live",
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    icon: CheckCircle2,
    description: "Successfully live on platform",
  },
  failed: {
    label: "Delivery Failed",
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: XCircle,
    description: "Delivery encountered an error",
  },
  rejected: {
    label: "Rejected",
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    icon: AlertTriangle,
    description: "Platform rejected the submission",
  },
  not_supported: {
    label: "Not Supported by Distributor",
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    icon: AlertTriangle,
    description:
      "The distributor did not accept delivery to this platform for this release.",
  },
};

export function SubmissionStatusTracker({
  releaseId,
  releaseTitle,
  onRetry,
  _onCancel,
}: SubmissionStatusTrackerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlatform, setSelectedPlatform] =
    useState<PlatformSubmissionStatus | null>(null);
  const [_showErrorDetails, _setShowErrorDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "all" | "live" | "processing" | "failed"
  >("all");

  const {
    data: statusData,
    isLoading,
    isError,
    error,
  } = useQuery<{
    statuses: PlatformSubmissionStatus[];
    summary: SubmissionSummary;
    statusSource?: string;
    lastChecked?: string | null;
  }>({
    queryKey: [`/api/distribution/releases/${releaseId}/submission-status`],
    refetchInterval: 30000,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/distribution/releases/${releaseId}/check-status`,
      );
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Status updated",
        description: result.message || "Latest Too Lost status was fetched and saved.",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/distribution/releases/${releaseId}/submission-status`],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to refresh Too Lost status.",
        variant: "destructive",
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (platform: string) => {
      const response = await apiRequest(
        "POST",
        `/api/distribution/releases/${releaseId}/retry`,
        { platform },
      );
      return response.json();
    },
    onSuccess: (result, platform) => {
      toast({
        title: result.success
          ? "Too Lost confirmed the retry"
          : "Retry outcome needs review",
        description:
          result.message ||
          `Refresh Too Lost status for ${platform} before treating the retry as complete.`,
        ...(result.success ? {} : { variant: "destructive" as const }),
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/distribution/releases/${releaseId}/submission-status`],
      });
      onRetry?.(platform);
    },
    onError: (error: Error) => {
      toast({
        title: "Retry failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const statuses = statusData?.statuses || [];
  const summary = statusData?.summary || {
    totalPlatforms: 0,
    queued: 0,
    processing: 0,
    delivered: 0,
    live: 0,
    failed: 0,
  };
  const wholeReleaseFailed =
    statuses.length > 0 &&
    statuses.every((status) => ["failed", "rejected"].includes(status.status));

  const filteredStatuses = statuses.filter((s) => {
    switch (activeTab) {
      case "live":
        return s.status === "live";
      case "processing":
        return ["queued", "pending", "processing", "delivered"].includes(
          s.status,
        );
      case "failed":
        return ["failed", "rejected", "not_supported"].includes(s.status);
      default:
        return true;
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Platform Submission Status
              </CardTitle>
              {releaseTitle && (
                <CardDescription className="mt-1">
                  {releaseTitle}
                </CardDescription>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Too Lost reported status
              </span>
              <span className="font-medium">
                {summary.totalPlatforms} destination
                {summary.totalPlatforms === 1 ? "" : "s"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Counts reflect the last persisted Too Lost response. The provider
              does not return a delivery completion estimate.
            </p>
            <p className="text-xs text-muted-foreground">
              {statusData?.lastChecked
                ? `Last provider check: ${new Date(statusData.lastChecked).toLocaleString()}`
                : "No provider status refresh has been recorded yet."}
            </p>
          </div>
          {isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Could not load saved provider status</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : "Refresh the page and try again."}
              </AlertDescription>
            </Alert>
          )}
          {refreshMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Too Lost status refresh failed</AlertTitle>
              <AlertDescription>
                {refreshMutation.error instanceof Error
                  ? refreshMutation.error.message
                  : "No confirmed provider response was saved."}
              </AlertDescription>
            </Alert>
          )}
          {statuses.some((status) => ["failed", "rejected"].includes(status.status)) && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Too Lost retries the whole release, not one destination. Retry
                is offered only when every destination is confirmed failed.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            <div className="text-center p-3 bg-slate-500/10 rounded-lg">
              <p className="text-xl font-bold text-slate-500">
                {summary.queued}
              </p>
              <p className="text-xs text-muted-foreground">Queued</p>
            </div>
            <div className="text-center p-3 bg-blue-500/10 rounded-lg">
              <p className="text-xl font-bold text-blue-500">
                {summary.processing}
              </p>
              <p className="text-xs text-muted-foreground">Processing</p>
            </div>
            <div className="text-center p-3 bg-purple-500/10 rounded-lg">
              <p className="text-xl font-bold text-purple-500">
                {summary.delivered}
              </p>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </div>
            <div className="text-center p-3 bg-green-500/10 rounded-lg">
              <p className="text-xl font-bold text-green-500">{summary.live}</p>
              <p className="text-xs text-muted-foreground">Live</p>
            </div>
            <div className="text-center p-3 bg-red-500/10 rounded-lg">
              <p className="text-xl font-bold text-red-500">{summary.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as Record<string, unknown>)}
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All ({statuses.length})</TabsTrigger>
          <TabsTrigger value="live">Live ({summary.live})</TabsTrigger>
          <TabsTrigger value="processing">
            Processing (
            {summary.queued + summary.processing + summary.delivered})
          </TabsTrigger>
          <TabsTrigger value="failed">Failed ({summary.failed})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStatuses.map((platformStatus) => {
              const config = PLATFORM_CONFIG[platformStatus.platform];
              const statusConfig = STATUS_CONFIG[platformStatus.status] ?? {
                label: platformStatus.status.replace(/_/g, " "),
                color: "bg-muted/50 text-muted-foreground border-muted",
                icon: Clock,
                description: "Status update pending",
              };
              const Icon = config?.icon;
              const StatusIcon = statusConfig?.icon;

              return (
                <Card
                  key={platformStatus.platform}
                  className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]"
                  onClick={() => setSelectedPlatform(platformStatus)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {Icon && (
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: config.color }}
                          >
                            <Icon className="h-5 w-5 text-white" />
                          </div>
                        )}
                        <div>
                          <h4 className="font-semibold">
                            {platformStatus.platformName}
                          </h4>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Badge
                      className={`${statusConfig.color} border flex items-center gap-2 w-full justify-center py-2`}
                    >
                      {StatusIcon && (
                        <StatusIcon
                          className={`h-3 w-3 ${platformStatus.status === "processing" ? "animate-spin" : ""}`}
                        />
                      )}
                      {statusConfig.label}
                    </Badge>

                    {platformStatus.status === "live" &&
                      platformStatus.liveAt && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>
                            Live since{" "}
                            {new Date(
                              platformStatus.liveAt,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      )}

                     {["failed", "rejected", "not_supported"].includes(
                       platformStatus.status,
                     ) && (
                      <div className="space-y-2">
                        <div className="p-2 bg-red-500/10 rounded text-xs text-red-500">
                          <AlertCircle className="h-3 w-3 inline mr-1" />
                          {platformStatus.errorMessage || "Delivery failed"}
                        </div>
                        {platformStatus.retryCount !== undefined &&
                          platformStatus.maxRetries && (
                            <p className="text-xs text-muted-foreground">
                              Retry {platformStatus.retryCount} of{" "}
                              {platformStatus.maxRetries}
                            </p>
                          )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            retryMutation.mutate(platformStatus.platform);
                          }}
                          disabled={
                            retryMutation.isPending ||
                            !wholeReleaseFailed ||
                            (typeof platformStatus.maxRetries === "number" &&
                              (platformStatus.retryCount || 0) >=
                                platformStatus.maxRetries)
                          }
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Retry Submission
                        </Button>
                      </div>
                    )}

                    {platformStatus.externalId && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ExternalLink className="h-3 w-3" />
                        <span className="font-mono truncate">
                          {platformStatus.externalId}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredStatuses.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <Info className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">
                  No platforms in this category
                </h3>
                <p className="text-sm text-muted-foreground">
                  {activeTab === "live" &&
                    "No platforms are live yet. Check back soon!"}
                  {activeTab === "processing" &&
                    "No platforms are currently processing."}
                  {activeTab === "failed" &&
                    "Great news! No failed submissions."}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!selectedPlatform}
        onOpenChange={() => setSelectedPlatform(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedPlatform &&
                PLATFORM_CONFIG[selectedPlatform.platform]?.icon && (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor:
                        PLATFORM_CONFIG[selectedPlatform.platform].color,
                    }}
                  >
                    {(() => {
                      const Icon =
                        PLATFORM_CONFIG[selectedPlatform.platform].icon;
                      return <Icon className="h-4 w-4 text-white" />;
                    })()}
                  </div>
                )}
              {selectedPlatform?.platformName} Details
            </DialogTitle>
            <DialogDescription>
               {selectedPlatform &&
                 (STATUS_CONFIG[selectedPlatform.status] ?? {
                   description: "Status update pending",
                 }).description}
            </DialogDescription>
          </DialogHeader>

          {selectedPlatform && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge
                     className={
                       (STATUS_CONFIG[selectedPlatform.status] ?? {
                         color: "bg-muted/50 text-muted-foreground",
                       }).color
                     }
                  >
                     {
                       (STATUS_CONFIG[selectedPlatform.status] ?? {
                         label: selectedPlatform.status.replace(/_/g, " "),
                       }).label
                     }
                  </Badge>
                </div>
                {selectedPlatform.deliveredAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Delivered
                    </span>
                    <span className="text-sm font-medium">
                      {new Date(selectedPlatform.deliveredAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedPlatform.liveAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Live Since
                    </span>
                    <span className="text-sm font-medium">
                      {new Date(selectedPlatform.liveAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedPlatform.externalId && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      External ID
                    </span>
                    <span className="text-sm font-mono">
                      {selectedPlatform.externalId}
                    </span>
                  </div>
                )}
              </div>

               {["failed", "rejected", "not_supported"].includes(
                 selectedPlatform.status,
               ) &&
                selectedPlatform.errorResolution && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Resolution Steps</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        {selectedPlatform.errorResolution.map((step, i) => (
                          <li key={i} className="text-sm">
                            {step}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

              {selectedPlatform.validationErrors &&
                selectedPlatform.validationErrors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Validation Errors</h4>
                    {selectedPlatform.validationErrors.map((err, i) => (
                      <Alert
                        key={i}
                        variant={
                          err.severity === "error" ? "destructive" : "default"
                        }
                      >
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>{err.field}</AlertTitle>
                        <AlertDescription>
                          {err.message}
                          {err.suggestion && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              <strong>Suggestion:</strong> {err.suggestion}
                            </p>
                          )}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
            </div>
          )}

          <DialogFooter>
             {selectedPlatform &&
               ["failed", "rejected", "not_supported"].includes(
                 selectedPlatform.status,
               ) && (
              <Button
                onClick={() => {
                  retryMutation.mutate(selectedPlatform.platform);
                  setSelectedPlatform(null);
                }}
                disabled={
                  retryMutation.isPending ||
                  !wholeReleaseFailed ||
                  (typeof selectedPlatform.maxRetries === "number" &&
                    (selectedPlatform.retryCount || 0) >=
                      selectedPlatform.maxRetries)
                }
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry Submission
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedPlatform(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
