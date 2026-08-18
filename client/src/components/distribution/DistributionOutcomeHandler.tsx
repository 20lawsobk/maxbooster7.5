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
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Clock, AlertCircle, XCircle, Loader2, Music, Globe, Shield, Hash, TrendingUp, Trash2, RotateCcw, Info, AlertTriangle, Activity, MapPin, BarChart3 } from "lucide-react";

type OutcomeCategory =
  | "release"
  | "submission"
  | "contentId"
  | "codes"
  | "takedown"
  | "analytics";

interface ReleaseOutcome {
  type:
    | "draft_saved"
    | "validation_error"
    | "cover_upload"
    | "track_upload"
    | "metadata_autofill";
  status: "success" | "warning" | "error" | "in_progress";
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

interface SubmissionOutcome {
  type:
    | "submission_started"
    | "platform_processing"
    | "validation_error"
    | "partial_success"
    | "all_success"
    | "queue_update";
  status: "success" | "warning" | "error" | "in_progress";
  message: string;
  platforms?: Array<{
    name: string;
    status: string;
    error?: string;
  }>;
  queuePosition?: number;
  estimatedTime?: string;
  timestamp: string;
}

interface ContentIdOutcome {
  type:
    | "fingerprint_generated"
    | "content_detected"
    | "registration_confirmed"
    | "conflict_found";
  status: "success" | "warning" | "error" | "in_progress";
  message: string;
  trackTitle?: string;
  matchPercentage?: number;
  timestamp: string;
}

interface CodeOutcome {
  type:
    | "isrc_generated"
    | "upc_generated"
    | "validation_passed"
    | "validation_failed"
    | "code_in_use";
  status: "success" | "warning" | "error";
  message: string;
  code?: string;
  codeType?: "isrc" | "upc";
  timestamp: string;
}

interface TakedownOutcome {
  type: "request_submitted" | "in_progress" | "completed";
  status: "success" | "warning" | "in_progress";
  message: string;
  platforms?: string[];
  progressPercentage?: number;
  timestamp: string;
}

interface AnalyticsOutcome {
  type: "loading" | "no_data" | "geographic" | "platform_comparison";
  status: "success" | "info" | "warning";
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

interface DistributionOutcomeHandlerProps {
  releaseId: string;
  onAction?: (action: string, data?: Record<string, unknown>) => void;
}

export function DistributionOutcomeHandler({
  releaseId,
  _onAction,
}: DistributionOutcomeHandlerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] =
    useState<OutcomeCategory>("release");

  const {
    data: outcomes,
    isLoading,
    refetch,
  } = useQuery<{
    release: ReleaseOutcome[];
    submission: SubmissionOutcome[];
    contentId: ContentIdOutcome[];
    codes: CodeOutcome[];
    takedown: TakedownOutcome[];
    analytics: AnalyticsOutcome[];
    summary: {
      totalOutcomes: number;
      errors: number;
      warnings: number;
      successes: number;
      inProgress: number;
    };
  }>({
    queryKey: [`/api/distribution/releases/${releaseId}/outcomes`],
    refetchInterval: 30000,
  });

  const retryMutation = useMutation({
    mutationFn: async ({
      type,
      data,
    }: {
      type: string;
      data?: Record<string, unknown>;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/distribution/releases/${releaseId}/retry-outcome`,
        { type, data },
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Retry initiated",
        description: "The operation is being retried.",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/distribution/releases/${releaseId}/outcomes`],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Retry failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "in_progress":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "info":
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-500/10 text-green-500";
      case "warning":
        return "bg-yellow-500/10 text-yellow-500";
      case "error":
        return "bg-red-500/10 text-red-500";
      case "in_progress":
        return "bg-blue-500/10 text-blue-500";
      case "info":
        return "bg-blue-500/10 text-blue-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  };

  const getCategoryIcon = (category: OutcomeCategory) => {
    switch (category) {
      case "release":
        return <Music className="h-4 w-4" />;
      case "submission":
        return <Globe className="h-4 w-4" />;
      case "contentId":
        return <Shield className="h-4 w-4" />;
      case "codes":
        return <Hash className="h-4 w-4" />;
      case "takedown":
        return <Trash2 className="h-4 w-4" />;
      case "analytics":
        return <TrendingUp className="h-4 w-4" />;
    }
  };

  const getCategoryLabel = (category: OutcomeCategory) => {
    switch (category) {
      case "release":
        return "Release";
      case "submission":
        return "Submission";
      case "contentId":
        return "Content ID";
      case "codes":
        return "ISRC/UPC";
      case "takedown":
        return "Takedown";
      case "analytics":
        return "Analytics";
    }
  };

  const getCategoryCount = (category: OutcomeCategory) => {
    if (!outcomes) return 0;
    return outcomes[category]?.length || 0;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const summary = outcomes?.summary || {
    totalOutcomes: 0,
    errors: 0,
    warnings: 0,
    successes: 0,
    inProgress: 0,
  };

  const renderOutcomeItem = (
    outcome: Record<string, unknown>,
    index: number,
  ) => (
    <div
      key={index}
      className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
    >
      {getStatusIcon(outcome.status)}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{outcome.message}</p>
        {outcome.details && (
          <div className="mt-1 text-xs text-muted-foreground">
            {typeof outcome.details === "string"
              ? outcome.details
              : JSON.stringify(outcome.details)}
          </div>
        )}
        {outcome.platforms && outcome.platforms.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {outcome.platforms.map(
              (platform: Record<string, unknown>, i: number) => (
                <Badge
                  key={i}
                  variant="outline"
                  className={getStatusBadge(
                    platform.status === "live"
                      ? "success"
                      : platform.status === "failed"
                        ? "error"
                        : "in_progress",
                  )}
                >
                  {platform.name}
                </Badge>
              ),
            )}
          </div>
        )}
        {outcome.queuePosition && (
          <p className="mt-1 text-xs text-muted-foreground">
            Queue position: #{outcome.queuePosition}
            {outcome.estimatedTime && ` • Est. time: ${outcome.estimatedTime}`}
          </p>
        )}
        {outcome.matchPercentage !== undefined && (
          <p className="mt-1 text-xs text-muted-foreground">
            Match: {outcome.matchPercentage}%
          </p>
        )}
        {outcome.progressPercentage !== undefined && (
          <Progress value={outcome.progressPercentage} className="h-1 mt-2" />
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(outcome.timestamp).toLocaleString()}
        </p>
      </div>
      {outcome.status === "error" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            retryMutation.mutate({ type: outcome.type, data: outcome })
          }
          disabled={retryMutation.isPending}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );

  const renderAnalyticsContent = () => {
    const analyticsOutcomes = outcomes?.analytics || [];

    if (analyticsOutcomes.length === 0) {
      return (
        <div className="text-center py-8">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">No Analytics Data Yet</h3>
          <p className="text-sm text-muted-foreground">
            Analytics will appear here once your release is live and generating
            streams.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {analyticsOutcomes.map((outcome, index) => (
          <div key={index} className="space-y-3">
            {renderOutcomeItem(outcome, index)}
            {outcome.type === "geographic" && outcome.data && (
              <div className="grid grid-cols-2 gap-2 pl-7">
                {Object.entries(outcome.data)
                  .slice(0, 6)
                  .map(([country, streams]: [string, any]) => (
                    <div
                      key={country}
                      className="flex items-center justify-between p-2 bg-muted/20 rounded"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <MapPin className="h-3 w-3" />
                        {country}
                      </span>
                      <span className="text-sm font-medium">
                        {streams.toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {outcome.type === "platform_comparison" && outcome.data && (
              <div className="space-y-2 pl-7">
                {Object.entries(outcome.data).map(
                  ([platform, stats]: [string, any]) => (
                    <div key={platform} className="flex items-center gap-3">
                      <span className="text-sm w-24">{platform}</span>
                      <div className="flex-1">
                        <Progress
                          value={(stats.streams / stats.total) * 100}
                          className="h-2"
                        />
                      </div>
                      <span className="text-sm font-medium w-20 text-right">
                        {stats.streams.toLocaleString()}
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Distribution Outcomes
              </CardTitle>
              <CardDescription>
                Track all distribution activities and their outcomes in one
                place.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="text-center p-3 bg-green-500/10 rounded-lg">
              <p className="text-xl font-bold text-green-500">
                {summary.successes}
              </p>
              <p className="text-xs text-muted-foreground">Successful</p>
            </div>
            <div className="text-center p-3 bg-blue-500/10 rounded-lg">
              <p className="text-xl font-bold text-blue-500">
                {summary.inProgress}
              </p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
            <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
              <p className="text-xl font-bold text-yellow-500">
                {summary.warnings}
              </p>
              <p className="text-xs text-muted-foreground">Warnings</p>
            </div>
            <div className="text-center p-3 bg-red-500/10 rounded-lg">
              <p className="text-xl font-bold text-red-500">{summary.errors}</p>
              <p className="text-xs text-muted-foreground">Errors</p>
            </div>
          </div>

          <Tabs
            value={activeCategory}
            onValueChange={(v) => setActiveCategory(v as OutcomeCategory)}
          >
            <TabsList className="grid w-full grid-cols-6">
              {(
                [
                  "release",
                  "submission",
                  "contentId",
                  "codes",
                  "takedown",
                  "analytics",
                ] as OutcomeCategory[]
              ).map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  className="flex items-center gap-1 text-xs"
                >
                  {getCategoryIcon(category)}
                  <span className="hidden sm:inline">
                    {getCategoryLabel(category)}
                  </span>
                  {getCategoryCount(category) > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {getCategoryCount(category)}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <ScrollArea className="h-[400px] mt-4">
              <TabsContent value="release" className="space-y-3 m-0">
                {outcomes?.release?.length ? (
                  outcomes.release.map((outcome, index) =>
                    renderOutcomeItem(outcome, index),
                  )
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Music className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No release outcomes yet</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="submission" className="space-y-3 m-0">
                {outcomes?.submission?.length ? (
                  outcomes.submission.map((outcome, index) =>
                    renderOutcomeItem(outcome, index),
                  )
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No submission outcomes yet</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="contentId" className="space-y-3 m-0">
                {outcomes?.contentId?.length ? (
                  outcomes.contentId.map((outcome, index) =>
                    renderOutcomeItem(outcome, index),
                  )
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No Content ID outcomes yet</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="codes" className="space-y-3 m-0">
                {outcomes?.codes?.length ? (
                  outcomes.codes.map((outcome, index) =>
                    renderOutcomeItem(outcome, index),
                  )
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Hash className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No ISRC/UPC outcomes yet</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="takedown" className="space-y-3 m-0">
                {outcomes?.takedown?.length ? (
                  outcomes.takedown.map((outcome, index) =>
                    renderOutcomeItem(outcome, index),
                  )
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Trash2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No takedown outcomes</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="analytics" className="m-0">
                {renderAnalyticsContent()}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </CardContent>
      </Card>

      {summary.errors > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Action Required</AlertTitle>
          <AlertDescription>
            {summary.errors} error(s) require your attention. Review the
            outcomes above and retry failed operations.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
