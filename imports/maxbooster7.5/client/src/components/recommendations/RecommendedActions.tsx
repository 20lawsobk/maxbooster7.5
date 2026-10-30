import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useNextActions } from "@/hooks/useRecommendations";
import { useLocation } from "wouter";
import { ArrowRight, Clock, Zap, Target, TrendingUp, MessageSquare, DollarSign } from "lucide-react";

const categoryIcons: Record<string, React.ElementType> = {
  content: MessageSquare,
  distribution: TrendingUp,
  marketing: Target,
  engagement: Zap,
  monetization: DollarSign,
};

const priorityColors: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

const impactBadgeVariants: Record<string, "default" | "secondary" | "outline"> =
  {
    high: "default",
    medium: "secondary",
    low: "outline",
  };

interface RecommendedActionsProps {
  limit?: number;
  showHeader?: boolean;
  compact?: boolean;
}

export function RecommendedActions({
  limit = 5,
  showHeader = true,
  compact = false,
}: RecommendedActionsProps) {
  const { actions, isLoading } = useNextActions();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Recommended Actions
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayedActions = actions.slice(0, limit);
  const completedCount = 0;
  const totalCount = displayedActions.length;
  const progressPercent =
    totalCount > 0 ? (completedCount / (totalCount || 1)) * 100 : 0;

  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Recommended Actions
            </CardTitle>
            <Badge variant="outline">
              {completedCount}/{totalCount} done
            </Badge>
          </div>
          <Progress value={progressPercent} className="h-2 mt-2" />
        </CardHeader>
      )}
      <CardContent className={showHeader ? "" : "pt-6"}>
        <div className="space-y-3">
          {displayedActions.map((action) => {
            const Icon = categoryIcons[action.category] || Target;

            return (
              <div
                key={action.id}
                className={`group p-3 rounded-lg border hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer ${
                  compact ? "p-2" : ""
                }`}
                onClick={() => action.link && setLocation(action.link)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-2 w-2 rounded-full mt-2 ${priorityColors[action.priority]}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <h4 className="font-medium text-sm truncate">
                        {action.title}
                      </h4>
                    </div>
                    {!compact && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {action.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {action.estimatedTime}
                      </Badge>
                      <Badge
                        variant={impactBadgeVariants[action.impact]}
                        className="text-xs"
                      >
                        {action.impact} impact
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {actions.length > limit && (
          <Button variant="outline" className="w-full mt-4">
            View All {actions.length} Actions
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function ActionPriorityLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <div className="h-2 w-2 rounded-full bg-red-500" /> Urgent
      </span>
      <span className="flex items-center gap-1">
        <div className="h-2 w-2 rounded-full bg-orange-500" /> High
      </span>
      <span className="flex items-center gap-1">
        <div className="h-2 w-2 rounded-full bg-yellow-500" /> Medium
      </span>
      <span className="flex items-center gap-1">
        <div className="h-2 w-2 rounded-full bg-green-500" /> Low
      </span>
    </div>
  );
}

export default RecommendedActions;
