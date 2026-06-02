import React, { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import {
  GripVertical,
  Eye,
  EyeOff,
  TrendingUp,
  Clock,
  Star,
  Zap,
  Settings,
  RotateCcw,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

export interface FeatureUsageData {
  featureId: string;
  name: string;
  category: string;
  usageCount: number;
  lastUsed: Date | null;
  avgSessionTime: number;
  completionRate: number;
  userRating?: number;
  isVisible: boolean;
  priority: number;
  suggestedPriority?: number;
  trendDirection: "up" | "down" | "stable";
}

interface FeaturePrioritizerProps {
  showControls?: boolean;
  onFeatureToggle?: (featureId: string, visible: boolean) => void;
  onPriorityChange?: (featureId: string, priority: number) => void;
  compact?: boolean;
}

const categoryIcons: Record<string, string> = {
  studio: "🎵",
  distribution: "📤",
  analytics: "📊",
  social: "📱",
  marketing: "📢",
  collaboration: "🤝",
  monetization: "💰",
  settings: "⚙️",
};

export function FeaturePrioritizer({
  showControls = true,
  onFeatureToggle,
  onPriorityChange,
  compact = false,
}: FeaturePrioritizerProps) {
  const queryClient = useQueryClient();

  const {
    data: features,
    isLoading,
    error,
  } = useQuery<FeatureUsageData[]>({
    queryKey: ["/api/personalization/feature-usage"],
    staleTime: 5 * 60 * 1000,
  });

  const updateFeatureMutation = useMutation({
    mutationFn: async ({
      featureId,
      updates,
    }: {
      featureId: string;
      updates: Partial<FeatureUsageData>;
    }) => {
      const response = await apiRequest(
        "PUT",
        `/api/personalization/feature-priority`,
        {
          featureId,
          ...updates,
        },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/feature-usage"],
      });
    },
  });

  const resetPrioritiesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/reset-feature-priorities",
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/feature-usage"],
      });
    },
  });

  const applySuggestedMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/apply-suggested-priorities",
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/feature-usage"],
      });
    },
  });

  const handleToggleVisibility = useCallback(
    (featureId: string, currentVisible: boolean) => {
      updateFeatureMutation.mutate({
        featureId,
        updates: { isVisible: !currentVisible },
      });
      onFeatureToggle?.(featureId, !currentVisible);
    },
    [updateFeatureMutation, onFeatureToggle],
  );

  const handleMovePriority = useCallback(
    (featureId: string, direction: "up" | "down") => {
      const sortedFeatures = [...(features || [])].sort(
        (a, b) => a.priority - b.priority,
      );
      const currentIndex = sortedFeatures.findIndex(
        (f) => f.featureId === featureId,
      );

      if (direction === "up" && currentIndex > 0) {
        const newPriority = sortedFeatures[currentIndex - 1].priority;
        updateFeatureMutation.mutate({
          featureId,
          updates: { priority: newPriority - 1 },
        });
        onPriorityChange?.(featureId, newPriority - 1);
      } else if (
        direction === "down" &&
        currentIndex < sortedFeatures.length - 1
      ) {
        const newPriority = sortedFeatures[currentIndex + 1].priority;
        updateFeatureMutation.mutate({
          featureId,
          updates: { priority: newPriority + 1 },
        });
        onPriorityChange?.(featureId, newPriority + 1);
      }
    },
    [features, updateFeatureMutation, onPriorityChange],
  );

  const sortedFeatures = useMemo(() => {
    if (!features) return [];
    return [...features].sort((a, b) => {
      if (a.isVisible !== b.isVisible) return a.isVisible ? -1 : 1;
      return a.priority - b.priority;
    });
  }, [features]);

  const visibleCount = useMemo(
    () => features?.filter((f) => f.isVisible).length || 0,
    [features],
  );

  const hasSuggestedChanges = useMemo(
    () =>
      features?.some(
        (f) =>
          f.suggestedPriority !== undefined &&
          f.suggestedPriority !== f.priority,
      ) || false,
    [features],
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !features) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Unable to load feature priorities
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Feature Prioritization
          </CardTitle>
          {showControls && (
            <div className="flex items-center gap-2">
              {hasSuggestedChanges && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applySuggestedMutation.mutate()}
                  disabled={applySuggestedMutation.isPending}
                >
                  <Zap className="h-4 w-4 mr-1" />
                  Apply AI Suggestions
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetPrioritiesMutation.mutate()}
                disabled={resetPrioritiesMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
          <span>
            {visibleCount} of {features.length} features visible
          </span>
          <Badge variant="secondary">
            <TrendingUp className="h-3 w-3 mr-1" />
            Usage-based ordering
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <ScrollArea className={compact ? "h-[300px]" : "h-[400px]"}>
          <div className="space-y-2 pr-4">
            {sortedFeatures.map((feature, index) => (
              <div
                key={feature.featureId}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  feature.isVisible
                    ? "bg-card border-border"
                    : "bg-muted/50 border-transparent opacity-60"
                }`}
              >
                <div className="cursor-move text-muted-foreground hover:text-foreground">
                  <GripVertical className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {categoryIcons[feature.category] || "📦"}
                    </span>
                    <h4 className="font-medium text-sm truncate">
                      {feature.name}
                    </h4>
                    {feature.trendDirection === "up" && (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    )}
                    {feature.suggestedPriority !== undefined &&
                      feature.suggestedPriority !== feature.priority && (
                        <Badge variant="outline" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Suggested
                        </Badge>
                      )}
                  </div>

                  {!compact && (
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {feature.usageCount} uses
                      </span>
                      <span>
                        {feature.lastUsed
                          ? `Last: ${new Date(feature.lastUsed).toLocaleDateString()}`
                          : "Never used"}
                      </span>
                      <div className="flex items-center gap-1 flex-1">
                        <span>Completion:</span>
                        <Progress
                          value={feature.completionRate * 100}
                          className="h-1 w-16"
                        />
                        <span>{Math.round(feature.completionRate * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {showControls && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        handleMovePriority(feature.featureId, "up")
                      }
                      disabled={index === 0 || !feature.isVisible}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        handleMovePriority(feature.featureId, "down")
                      }
                      disabled={
                        index === sortedFeatures.length - 1 ||
                        !feature.isVisible
                      }
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Switch
                      checked={feature.isVisible}
                      onCheckedChange={() =>
                        handleToggleVisibility(
                          feature.featureId,
                          feature.isVisible,
                        )
                      }
                    />
                    {feature.isVisible ? (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default FeaturePrioritizer;
