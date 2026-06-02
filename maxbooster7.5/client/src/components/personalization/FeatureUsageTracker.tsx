import React, { useEffect } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFeatureUsage, useFeatureTracking } from "@/hooks/useFeatureUsage";
import {
  Eye,
  EyeOff,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Sparkles,
  RotateCcw,
  Settings,
  ChevronRight,
  Check,
  Star,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureUsageTrackerProps {
  showHeader?: boolean;
  showSuggestions?: boolean;
  showControls?: boolean;
  compact?: boolean;
  onFeatureClick?: (featureId: string) => void;
  className?: string;
}

const featureLabels: Record<string, string> = {
  studio: "Studio (DAW)",
  distribution: "Distribution",
  analytics: "Analytics",
  social: "Social Media",
  marketplace: "Marketplace",
  collaborations: "Collaborations",
  contracts: "Contracts",
  advertising: "Advertising",
  notifications: "Notifications",
  settings: "Settings",
  billing: "Billing",
  support: "Support",
  "ai-coach": "AI Coach",
  releases: "Releases",
};

const featureIcons: Record<string, string> = {
  studio: "🎵",
  distribution: "📤",
  analytics: "📊",
  social: "📱",
  marketplace: "🛍️",
  collaborations: "🤝",
  contracts: "📝",
  advertising: "📢",
  notifications: "🔔",
  settings: "⚙️",
  billing: "💳",
  support: "🎧",
  "ai-coach": "🤖",
  releases: "💿",
};

export function FeatureUsageTracker({
  showHeader = true,
  showSuggestions = true,
  showControls = true,
  compact = false,
  onFeatureClick,
  className,
}: FeatureUsageTrackerProps) {
  const {
    usageData,
    isLoading,
    frequentlyUsed,
    rarelyUsed,
    suggestedToHide,
    suggestedToSurface,
    visibleFeatures,
    hiddenFeatures,
    hideFeature,
    showFeature,
    resetToDefaults,
    applySuggestedPriorities,
    getUsageCount,
    isUpdating,
  } = useFeatureUsage();

  const handleToggleVisibility = async (
    featureId: string,
    currentlyVisible: boolean,
  ) => {
    if (currentlyVisible) {
      await hideFeature(featureId);
    } else {
      await showFeature(featureId);
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64 mt-1" />
          </CardHeader>
        )}
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-base">Feature Usage</CardTitle>
            </div>
            {showControls && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={applySuggestedPriorities}
                  disabled={isUpdating}
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  Auto-optimize
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetToDefaults}
                  disabled={isUpdating}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <CardDescription>
            Personalize your interface based on how you use features
          </CardDescription>
        </CardHeader>
      )}

      <CardContent className="space-y-6">
        {showSuggestions &&
          (suggestedToSurface.length > 0 || suggestedToHide.length > 0) && (
            <div className="p-3 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">AI Suggestions</span>
              </div>

              {suggestedToSurface.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    Surface these frequently used features:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedToSurface.slice(0, 3).map((featureId) => (
                      <Badge
                        key={featureId}
                        variant="secondary"
                        className="cursor-pointer hover:bg-green-100 dark:hover:bg-green-900"
                        onClick={() => showFeature(featureId)}
                      >
                        {featureIcons[featureId]}{" "}
                        {featureLabels[featureId] || featureId}
                        <Check className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {suggestedToHide.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <TrendingDown className="h-3 w-3 text-orange-500" />
                    Move rarely used features to "More":
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedToHide.slice(0, 3).map((featureId) => (
                      <Badge
                        key={featureId}
                        variant="outline"
                        className="cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900"
                        onClick={() => hideFeature(featureId)}
                      >
                        {featureIcons[featureId]}{" "}
                        {featureLabels[featureId] || featureId}
                        <EyeOff className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium">Most Used Features</span>
          </div>
          <ScrollArea className={compact ? "h-[150px]" : "h-[200px]"}>
            <div className="space-y-2">
              {frequentlyUsed.map((featureId, index) => {
                const usageCount = getUsageCount(featureId);
                const maxUsage = Math.max(
                  ...frequentlyUsed.map((f) => getUsageCount(f)),
                );
                const percentage =
                  maxUsage > 0 ? (usageCount / maxUsage) * 100 : 0;
                const isVisible = visibleFeatures.includes(featureId);

                return (
                  <div
                    key={featureId}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all hover:bg-accent/50",
                      index === 0 &&
                        "border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/20",
                    )}
                    onClick={() => onFeatureClick?.(featureId)}
                  >
                    <span className="text-lg">
                      {featureIcons[featureId] || "📦"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">
                          {featureLabels[featureId] || featureId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {usageCount} uses
                        </span>
                      </div>
                      <Progress value={percentage} className="h-1.5" />
                    </div>
                    <Switch
                      checked={isVisible}
                      onCheckedChange={() =>
                        handleToggleVisibility(featureId, isVisible)
                      }
                      onClick={(e) => e.stopPropagation()}
                      disabled={isUpdating}
                    />
                  </div>
                );
              })}

              {frequentlyUsed.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No usage data yet. Start using features to see your patterns.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {hiddenFeatures.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <EyeOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Hidden Features</span>
              <Badge variant="outline" className="text-xs ml-auto">
                {hiddenFeatures.length} hidden
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {hiddenFeatures.map((featureId) => (
                <Badge
                  key={featureId}
                  variant="secondary"
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => showFeature(featureId)}
                >
                  {featureIcons[featureId]}{" "}
                  {featureLabels[featureId] || featureId}
                  <Eye className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          </div>
        )}

        {!compact && rarelyUsed.length > 0 && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Rarely Used
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {rarelyUsed.slice(0, 5).map((featureId) => (
                <Badge
                  key={featureId}
                  variant="outline"
                  className="text-muted-foreground"
                >
                  {featureIcons[featureId]}{" "}
                  {featureLabels[featureId] || featureId}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FeatureTracker({ featureId }: { featureId: string }) {
  useFeatureTracking(featureId);
  return null;
}

export default FeatureUsageTracker;
