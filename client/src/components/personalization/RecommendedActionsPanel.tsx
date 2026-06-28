import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRecommendedActions, useCareerProgress, RecommendedAction } from "@/hooks/useRecommendedActions";
import { Clock, Zap, Target, TrendingUp, MessageSquare, DollarSign, CheckCircle, XCircle, Lightbulb, Star, Users, Upload, Settings, BarChart3, Sparkles, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecommendedActionsPanelProps {
  limit?: number;
  showHeader?: boolean;
  showCareerProgress?: boolean;
  compact?: boolean;
  onActionClick?: (action: RecommendedAction) => void;
  onActionComplete?: (actionId: string) => void;
  onActionDismiss?: (actionId: string) => void;
  className?: string;
}

const categoryIcons: Record<string, React.ElementType> = {
  setup: Settings,
  content: MessageSquare,
  distribution: Upload,
  marketing: Target,
  engagement: Zap,
  monetization: DollarSign,
  analytics: BarChart3,
  collaboration: Users,
  social: TrendingUp,
};

const priorityColors: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

const impactBadgeVariants: Record<string, "default" | "secondary" | "outline"> =
  {
    high: "default",
    medium: "secondary",
    low: "outline",
  };

export function RecommendedActionsPanel({
  limit = 5,
  showHeader = true,
  showCareerProgress = true,
  compact = false,
  onActionClick,
  onActionComplete,
  onActionDismiss,
  className,
}: RecommendedActionsPanelProps) {
  const {
    actions,
    isLoading,
    error,
    
    contextualActions,
    completeAction,
    dismissAction,
    pendingCount,
    highPriorityCount,
    isUpdating,
  } = useRecommendedActions({ limit });

  const { currentStage, nextStage, progress, milestones } = useCareerProgress();

  const handleComplete = async (actionId: string) => {
    await completeAction(actionId);
    onActionComplete?.(actionId);
  };

  const handleDismiss = async (actionId: string) => {
    await dismissAction(actionId);
    onActionDismiss?.(actionId);
  };

  const generalActions = actions.filter((a) => !a.contextual);

  if (isLoading) {
    return (
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
        )}
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center text-muted-foreground">
          Unable to load recommendations
        </CardContent>
      </Card>
    );
  }

  if (actions.length === 0) {
    return (
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Recommended Actions
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="text-center py-8">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500 opacity-50" />
          <h3 className="font-medium">You're all caught up!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            No pending recommendations at this time
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Recommended Actions
              {highPriorityCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {highPriorityCount} urgent
                </Badge>
              )}
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {pendingCount} pending
            </Badge>
          </div>
        </CardHeader>
      )}

      <CardContent>
        {showCareerProgress && (
          <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Career Progress</span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="capitalize">{currentStage}</span>
                <ChevronRight className="h-3 w-3" />
                <span className="capitalize">{nextStage}</span>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">
                {milestones.filter((m) => m.completed).length}/
                {milestones.length} milestones
              </span>
              <span className="text-xs font-medium">{progress}%</span>
            </div>
          </div>
        )}

        <ScrollArea className={compact ? "h-[200px]" : "h-[320px]"}>
          <div className="space-y-3 pr-4">
            {contextualActions.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Sparkles className="h-3 w-3" />
                  Context-aware suggestions
                </div>
                {contextualActions.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    compact={compact}
                    onClick={() => onActionClick?.(action)}
                    onComplete={() => handleComplete(action.id)}
                    onDismiss={() => handleDismiss(action.id)}
                    isLoading={isUpdating}
                  />
                ))}
              </div>
            )}

            {generalActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                compact={compact}
                onClick={() => onActionClick?.(action)}
                onComplete={() => handleComplete(action.id)}
                onDismiss={() => handleDismiss(action.id)}
                isLoading={isUpdating}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

interface ActionCardProps {
  action: RecommendedAction;
  compact?: boolean;
  onClick?: () => void;
  onComplete?: () => void;
  onDismiss?: () => void;
  isLoading?: boolean;
}

function ActionCard({
  action,
  compact = false,
  onClick,
  onComplete,
  onDismiss,
  isLoading,
}: ActionCardProps) {
  const CategoryIcon = categoryIcons[action.category] || Target;

  return (
    <div
      className={cn(
        "p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer",
        action.priority === "high" && "border-red-200 dark:border-red-800",
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "p-2 rounded-lg",
            action.priority === "high"
              ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400"
              : "bg-muted",
          )}
        >
          <CategoryIcon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm truncate">{action.title}</h4>
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                priorityColors[action.priority],
              )}
            />
          </div>

          {!compact && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {action.description}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2">
            <Badge
              variant={impactBadgeVariants[action.impact]}
              className="text-xs"
            >
              <Star className="h-3 w-3 mr-1" />
              {action.impact} impact
            </Badge>
            {action.estimatedTime && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {action.estimatedTime}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onComplete?.();
            }}
            disabled={isLoading}
          >
            <CheckCircle className="h-4 w-4 text-green-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss?.();
            }}
            disabled={isLoading}
          >
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default RecommendedActionsPanel;
