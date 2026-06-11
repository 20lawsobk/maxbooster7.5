import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import {
  useSmartDefaultsContext,
  CareerStage,
  ArtistType,
} from "./SmartDefaultsProvider";
import {
  Clock,
  Zap,
  Target,
  TrendingUp,
  MessageSquare,
  DollarSign,
  CheckCircle,
  XCircle,
  Lightbulb,
  Star,
  Music,
  Users,
  Upload,
  Settings,
  BarChart3,
  Sparkles,
} from "lucide-react";

export interface RecommendedAction {
  id: string;
  type: "action" | "feature" | "content" | "setting";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: string;
  link?: string;
  estimatedTime?: string;
  impact: "high" | "medium" | "low";
  careerStage?: CareerStage[];
  artistTypes?: ArtistType[];
  contextual: boolean;
  completed?: boolean;
  dismissed?: boolean;
}

interface RecommendedActionsProps {
  limit?: number;
  showHeader?: boolean;
  compact?: boolean;
  onActionClick?: (action: RecommendedAction) => void;
  onActionComplete?: (actionId: string) => void;
  onActionDismiss?: (actionId: string) => void;
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

const typeIcons: Record<string, React.ElementType> = {
  action: Zap,
  feature: Sparkles,
  content: Music,
  setting: Settings,
};

export function RecommendedActions({
  limit = 5,
  showHeader = true,
  compact = false,
  onActionClick,
  onActionComplete,
  onActionDismiss,
}: RecommendedActionsProps) {
  const queryClient = useQueryClient();
  const { preferences, trackInteraction } = useSmartDefaultsContext();

  const {
    data: recommendations = [],
    isLoading,
    error,
  } = useQuery<RecommendedAction[]>({
    queryKey: ["/api/personalization/recommendations"],
    staleTime: 10 * 60 * 1000,
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
        queryKey: ["/api/personalization/recommendations"],
      });
      onActionComplete?.(actionId);
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
        queryKey: ["/api/personalization/recommendations"],
      });
      onActionDismiss?.(actionId);
    },
  });

  const handleActionClick = (action: RecommendedAction) => {
    trackInteraction({
      type: "click",
      target: `recommendation-${action.id}`,
      context: { category: action.category, type: action.type },
    });
    onActionClick?.(action);
  };

  const filteredActions = recommendations
    .filter((action) => !action.completed && !action.dismissed)
    .slice(0, limit);

  const contextualActions = filteredActions.filter((a) => a.contextual);
  const generalActions = filteredActions.filter((a) => !a.contextual);

  const highPriorityCount = filteredActions.filter(
    (a) => a.priority === "high",
  ).length;

  if (isLoading) {
    return (
      <Card>
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
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Unable to load recommendations
        </CardContent>
      </Card>
    );
  }

  if (filteredActions.length === 0) {
    return (
      <Card>
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
    <Card>
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
              {filteredActions.length} pending
            </Badge>
          </div>
          {preferences?.careerStage && (
            <p className="text-xs text-muted-foreground mt-1">
              Personalized for {preferences.careerStage}{" "}
              {preferences.artistType}
            </p>
          )}
        </CardHeader>
      )}

      <CardContent>
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
                    onClick={() => handleActionClick(action)}
                    onComplete={() => completeActionMutation.mutate(action.id)}
                    onDismiss={() => dismissActionMutation.mutate(action.id)}
                    isLoading={
                      completeActionMutation.isPending ||
                      dismissActionMutation.isPending
                    }
                  />
                ))}
              </div>
            )}

            {generalActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                compact={compact}
                onClick={() => handleActionClick(action)}
                onComplete={() => completeActionMutation.mutate(action.id)}
                onDismiss={() => dismissActionMutation.mutate(action.id)}
                isLoading={
                  completeActionMutation.isPending ||
                  dismissActionMutation.isPending
                }
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
  const TypeIcon = typeIcons[action.type] || Zap;

  return (
    <div
      className={`p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer ${
        action.priority === "high" ? "border-red-200 dark:border-red-800" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg ${
            action.priority === "high"
              ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400"
              : "bg-muted"
          }`}
        >
          <CategoryIcon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm truncate">{action.title}</h4>
            <div
              className={`h-2 w-2 rounded-full ${priorityColors[action.priority]}`}
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
            <Badge variant="outline" className="text-xs">
              <TypeIcon className="h-3 w-3 mr-1" />
              {action.type}
            </Badge>
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

export default RecommendedActions;
