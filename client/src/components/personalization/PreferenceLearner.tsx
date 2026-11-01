import { useEffect, useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { Brain, TrendingUp, Clock, CheckCircle, Lightbulb, RotateCcw, Eye, MousePointerClick, Timer } from "lucide-react";

export interface InteractionPattern {
  id: string;
  type: "navigation" | "action" | "preference" | "workflow";
  pattern: string;
  frequency: number;
  confidence: number;
  lastOccurred: Date;
  appliedChange?: string;
}

export interface LearningState {
  isLearning: boolean;
  interactionCount: number;
  patternCount: number;
  lastAnalysis: Date | null;
  confidenceLevel: number;
  suggestionsApplied: number;
  suggestionsDeclined: number;
}

export interface LearningInsight {
  id: string;
  insight: string;
  confidence: number;
  category: "navigation" | "content" | "timing" | "preferences";
  suggestedAction: string;
  applied: boolean;
  createdAt: Date;
}

interface PreferenceLearnerProps {
  enableTracking?: boolean;
  showDashboard?: boolean;
  onInsightApplied?: (insightId: string) => void;
  onTrackingToggle?: (enabled: boolean) => void;
}

const categoryColors: Record<string, string> = {
  navigation: "text-blue-500",
  content: "text-green-500",
  timing: "text-orange-500",
  preferences: "text-purple-500",
};

export function PreferenceLearner({
  enableTracking = true,
  showDashboard = true,
  onInsightApplied,
  onTrackingToggle,
}: PreferenceLearnerProps) {
  const queryClient = useQueryClient();
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(enableTracking);
  const lastInteractionRef = useRef<Date>(new Date());
  const interactionQueueRef = useRef<any[]>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: learningState, isLoading: stateLoading } =
    useQuery<LearningState>({
      queryKey: ["/api/personalization/learning-state"],
      staleTime: 5 * 60 * 1000,
    });

  const { data: insights = [], isLoading: insightsLoading } = useQuery<
    LearningInsight[]
  >({
    queryKey: ["/api/personalization/learning-insights"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: patterns = [] } = useQuery<InteractionPattern[]>({
    queryKey: ["/api/personalization/interaction-patterns"],
    staleTime: 15 * 60 * 1000,
  });

  const trackInteractionMutation = useMutation({
    mutationFn: async (interactions: unknown[]) => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/track-batch",
        {
          interactions,
        },
      );
      return response.json();
    },
    onError: () => {},
  });

  const applyInsightMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/personalization/apply-insight/${insightId}`,
      );
      return response.json();
    },
    onSuccess: (_, insightId) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/learning-insights"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/preferences"],
      });
      onInsightApplied?.(insightId);
    },
  });

  const dismissInsightMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/personalization/dismiss-insight/${insightId}`,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/learning-insights"],
      });
    },
  });

  const resetLearningMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/reset-learning",
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/learning-state"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/learning-insights"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/interaction-patterns"],
      });
    },
  });

  const flushInteractions = useCallback(() => {
    if (interactionQueueRef.current.length > 0) {
      trackInteractionMutation.mutate([...interactionQueueRef.current]);
      interactionQueueRef.current = [];
    }
  }, [trackInteractionMutation]);

  const queueInteraction = useCallback(
    (interaction: Record<string, unknown>) => {
      if (!isTrackingEnabled) return;

      interactionQueueRef.current.push({
        ...interaction,
        timestamp: new Date(),
        timeSinceLastInteraction:
          Date.now() - lastInteractionRef.current.getTime(),
      });
      lastInteractionRef.current = new Date();

      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }

      if (interactionQueueRef.current.length >= 10) {
        flushInteractions();
      } else {
        flushTimeoutRef.current = setTimeout(flushInteractions, 5000);
      }
    },
    [isTrackingEnabled, flushInteractions],
  );

  useEffect(() => {
    if (!isTrackingEnabled) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const closestButton = target.closest('button, a, [role="button"]');

      if (closestButton) {
        const label =
          closestButton.getAttribute("aria-label") ||
          closestButton.textContent?.trim().slice(0, 50) ||
          closestButton.getAttribute("data-testid") ||
          "unknown";

        queueInteraction({
          type: "click",
          target: label,
          element: closestButton.tagName.toLowerCase(),
          path: window.location.pathname,
        });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key) {
        queueInteraction({
          type: "shortcut",
          target: `${e.ctrlKey ? "Ctrl" : "Cmd"}+${e.key}`,
          path: window.location.pathname,
        });
      }
    };

    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        queueInteraction({
          type: "scroll",
          target: "page",
          scrollDepth: Math.round(
            (window.scrollY /
              (document.body.scrollHeight - window.innerHeight)) *
              100,
          ),
          path: window.location.pathname,
        });
      }, 500);
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("scroll", handleScroll);
      flushInteractions();
    };
  }, [isTrackingEnabled, queueInteraction, flushInteractions]);

  const handleTrackingToggle = useCallback(
    (enabled: boolean) => {
      setIsTrackingEnabled(enabled);
      onTrackingToggle?.(enabled);

      if (!enabled) {
        flushInteractions();
      }
    },
    [onTrackingToggle, flushInteractions],
  );

  const pendingInsights = insights.filter((i) => !i.applied);
  insights.filter((i) => i.applied);

  if (!showDashboard) {
    return null;
  }

  if (stateLoading || insightsLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            Preference Learning
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Learning</span>
              <Switch
                checked={isTrackingEnabled}
                onCheckedChange={handleTrackingToggle}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => resetLearningMutation.mutate()}
              disabled={resetLearningMutation.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <MousePointerClick className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <div className="text-2xl font-bold">
              {learningState?.interactionCount || 0}
            </div>
            <div className="text-xs text-muted-foreground">Interactions</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <Eye className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <div className="text-2xl font-bold">
              {learningState?.patternCount || 0}
            </div>
            <div className="text-xs text-muted-foreground">Patterns Found</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <CheckCircle className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
            <div className="text-2xl font-bold">
              {learningState?.suggestionsApplied || 0}
            </div>
            <div className="text-xs text-muted-foreground">Applied</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <Timer className="h-5 w-5 mx-auto mb-1 text-orange-500" />
            <div className="text-2xl font-bold">
              {Math.round((learningState?.confidenceLevel || 0) * 100)}%
            </div>
            <div className="text-xs text-muted-foreground">Confidence</div>
          </div>
        </div>

        {learningState && (
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span>Learning Progress</span>
              <span>
                {Math.round((learningState.confidenceLevel || 0) * 100)}%
              </span>
            </div>
            <Progress
              value={(learningState.confidenceLevel || 0) * 100}
              className="h-2"
            />
          </div>
        )}

        {pendingInsights.length > 0 && (
          <div>
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Pending Suggestions ({pendingInsights.length})
            </h4>
            <div className="space-y-2">
              {pendingInsights.slice(0, 3).map((insight) => (
                <div
                  key={insight.id}
                  className="p-3 rounded-lg border bg-gradient-to-r from-yellow-50/50 to-orange-50/50 dark:from-yellow-950/20 dark:to-orange-950/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          <span className={categoryColors[insight.category]}>
                            {insight.category}
                          </span>
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(insight.confidence * 100)}% confident
                        </span>
                      </div>
                      <p className="text-sm">{insight.insight}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Suggestion: {insight.suggestedAction}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => applyInsightMutation.mutate(insight.id)}
                        disabled={applyInsightMutation.isPending}
                      >
                        Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          dismissInsightMutation.mutate(insight.id)
                        }
                        disabled={dismissInsightMutation.isPending}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {patterns.length > 0 && (
          <div>
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Detected Patterns
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {patterns.slice(0, 4).map((pattern) => (
                <div
                  key={pattern.id}
                  className="p-2 rounded border text-sm flex items-center justify-between"
                >
                  <span className="truncate">{pattern.pattern}</span>
                  <Badge variant="secondary" className="text-xs ml-2">
                    {pattern.frequency}x
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {isTrackingEnabled && (
          <div className="text-xs text-muted-foreground text-center">
            <Clock className="h-3 w-3 inline mr-1" />
            Last analysis:{" "}
            {learningState?.lastAnalysis
              ? new Date(learningState.lastAnalysis).toLocaleString()
              : "Never"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PreferenceLearner;
