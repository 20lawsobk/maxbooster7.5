import React, { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { ArrowRight, Clock, Target, TrendingUp, DollarSign, CheckCircle, XCircle, Lightbulb, Star, Music, Settings, Sparkles, Rocket, MessageSquare, Award } from "lucide-react";
import { cn } from "@/lib/utils";

export type CareerStage =
  | "emerging"
  | "developing"
  | "established"
  | "professional";
export type ActionPriority = "high" | "medium" | "low";
export type ActionType =
  | "setup"
  | "growth"
  | "engagement"
  | "monetization"
  | "content"
  | "learning";

export interface NextAction {
  id: string;
  title: string;
  description: string;
  type: ActionType;
  priority: ActionPriority;
  estimatedTime: string;
  impact: string;
  link: string;
  careerStages: CareerStage[];
  isContextual: boolean;
  progressPercent?: number;
  dueDate?: string;
  reward?: string;
}

interface NextActionCardProps {
  action?: NextAction;
  onAction?: (action: NextAction) => void;
  onDismiss?: (actionId: string) => void;
  onComplete?: (actionId: string) => void;
  showProgress?: boolean;
  variant?: "default" | "compact" | "featured";
  className?: string;
}

interface NextActionsListProps {
  limit?: number;
  careerStage?: CareerStage;
  showHeader?: boolean;
  compact?: boolean;
  onActionClick?: (action: NextAction) => void;
}

const typeIcons: Record<ActionType, React.ElementType> = {
  setup: Settings,
  growth: TrendingUp,
  engagement: MessageSquare,
  monetization: DollarSign,
  content: Music,
  learning: Lightbulb,
};

const typeColors: Record<ActionType, string> = {
  setup: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400",
  growth: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400",
  engagement:
    "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400",
  monetization:
    "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400",
  content: "bg-pink-100 text-pink-600 dark:bg-pink-900 dark:text-pink-400",
  learning: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900 dark:text-cyan-400",
};

const priorityColors: Record<ActionPriority, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

const careerStageLabels: Record<CareerStage, string> = {
  emerging: "Emerging Artist",
  developing: "Developing Artist",
  established: "Established Artist",
  professional: "Professional Artist",
};

export function NextActionCard({
  action,
  onAction,
  onDismiss,
  onComplete,
  showProgress = false,
  variant = "default",
  className,
}: NextActionCardProps) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: nextAction, isLoading } = useQuery<NextAction>({
    queryKey: ["/api/personalization/next-action"],
    enabled: !action,
    staleTime: 5 * 60 * 1000,
  });

  const completeActionMutation = useMutation({
    mutationFn: async (actionId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/personalization/complete-action/${actionId}`,
      );
      return response.json();
    },
    onSuccess: (_, actionId) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/next-action"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/recommendations"],
      });
      onComplete?.(actionId);
    },
  });

  const dismissActionMutation = useMutation({
    mutationFn: async (actionId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/personalization/dismiss-action/${actionId}`,
      );
      return response.json();
    },
    onSuccess: (_, actionId) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/next-action"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/recommendations"],
      });
      onDismiss?.(actionId);
    },
  });

  const displayAction = action || nextAction;

  if (isLoading && !action) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!displayAction) {
    return (
      <Card
        className={cn(
          "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30",
          className,
        )}
      >
        <CardContent className="flex flex-col items-center justify-center py-8">
          <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
          <h3 className="font-semibold text-lg">You're All Caught Up!</h3>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Great job! No pending actions right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  const Icon = typeIcons[displayAction.type] || Lightbulb;
  const iconColorClass = typeColors[displayAction.type];

  const handleAction = () => {
    if (onAction) {
      onAction(displayAction);
    } else if (displayAction.link) {
      navigate(displayAction.link);
    }
  };

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border bg-card cursor-pointer hover:bg-accent/50 transition-colors",
          displayAction.priority === "high" &&
            "border-red-200 dark:border-red-800",
          className,
        )}
        onClick={handleAction}
      >
        <div className={cn("p-2 rounded-lg", iconColorClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">
            {displayAction.title}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {displayAction.estimatedTime}
            </span>
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                priorityColors[displayAction.priority],
              )}
            />
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  if (variant === "featured") {
    return (
      <Card
        className={cn(
          "border-2 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30",
          displayAction.priority === "high" &&
            "border-red-300 dark:border-red-700",
          className,
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              <CardTitle className="text-sm">Recommended Next Step</CardTitle>
            </div>
            <Badge variant="secondary" className="text-xs">
              {displayAction.type}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <div className={cn("p-3 rounded-lg", iconColorClass)}>
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{displayAction.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {displayAction.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {displayAction.estimatedTime}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Target className="h-3 w-3 mr-1" />
              {displayAction.impact}
            </Badge>
            {displayAction.reward && (
              <Badge variant="secondary" className="text-xs">
                <Award className="h-3 w-3 mr-1" />
                {displayAction.reward}
              </Badge>
            )}
          </div>

          {showProgress && displayAction.progressPercent !== undefined && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Progress</span>
                <span>{displayAction.progressPercent}%</span>
              </div>
              <Progress value={displayAction.progressPercent} className="h-2" />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button onClick={handleAction} className="flex-1">
              <Rocket className="h-4 w-4 mr-2" />
              Start Now
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                dismissActionMutation.mutate(displayAction.id);
              }}
              disabled={dismissActionMutation.isPending}
            >
              <XCircle className="h-5 w-5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md transition-all",
        displayAction.priority === "high" &&
          "border-red-200 dark:border-red-800",
        displayAction.isContextual &&
          "ring-1 ring-purple-200 dark:ring-purple-800",
        className,
      )}
      onClick={handleAction}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-lg", iconColorClass)}>
            <Icon className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium">{displayAction.title}</h4>
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  priorityColors[displayAction.priority],
                )}
              />
              {displayAction.isContextual && (
                <Badge variant="secondary" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  For You
                </Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground line-clamp-2">
              {displayAction.description}
            </p>

            <div className="flex items-center gap-3 mt-3">
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {displayAction.estimatedTime}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                {displayAction.impact}
              </Badge>
            </div>

            {showProgress && displayAction.progressPercent !== undefined && (
              <div className="mt-3">
                <Progress
                  value={displayAction.progressPercent}
                  className="h-1.5"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                completeActionMutation.mutate(displayAction.id);
              }}
              disabled={completeActionMutation.isPending}
            >
              <CheckCircle className="h-4 w-4 text-green-500" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                dismissActionMutation.mutate(displayAction.id);
              }}
              disabled={dismissActionMutation.isPending}
            >
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function NextActionsList({
  limit = 5,
  careerStage,
  showHeader = true,
  compact = false,
  onActionClick,
}: NextActionsListProps) {
  const { data: actions = [], isLoading } = useQuery<NextAction[]>({
    queryKey: ["/api/personalization/recommendations"],
    staleTime: 5 * 60 * 1000,
  });

  const filteredActions = useMemo(() => {
    return actions
      .filter(
        (action) => !careerStage || action.careerStages.includes(careerStage),
      )
      .slice(0, limit);
  }, [actions, careerStage, limit]);

  const contextualActions = filteredActions.filter((a) => a.isContextual);
  const generalActions = filteredActions.filter((a) => !a.isContextual);

  if (isLoading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
        )}
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (filteredActions.length === 0) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Next Actions
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="text-center py-8">
          <CheckCircle className="h-10 w-10 mx-auto text-green-500 opacity-50 mb-3" />
          <p className="text-muted-foreground">No pending actions</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Next Actions
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {filteredActions.length} pending
            </Badge>
          </div>
          {careerStage && (
            <p className="text-xs text-muted-foreground">
              Personalized for {careerStageLabels[careerStage]}
            </p>
          )}
        </CardHeader>
      )}
      <CardContent>
        <div className="space-y-3">
          {contextualActions.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Sparkles className="h-3 w-3 text-purple-500" />
                Personalized for you
              </div>
              {contextualActions.map((action) => (
                <NextActionCard
                  key={action.id}
                  action={action}
                  variant={compact ? "compact" : "default"}
                  onAction={onActionClick}
                  className="mb-2"
                />
              ))}
            </div>
          )}

          {generalActions.map((action) => (
            <NextActionCard
              key={action.id}
              action={action}
              variant={compact ? "compact" : "default"}
              onAction={onActionClick}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default NextActionCard;
