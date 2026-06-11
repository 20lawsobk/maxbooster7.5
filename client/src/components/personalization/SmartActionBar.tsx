import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Upload,
  Link,
  Compass,
  TrendingUp,
  Users,
  DollarSign,
  Music,
  Clock,
  Zap,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Calendar,
} from "lucide-react";

interface ActionSuggestion {
  id: string;
  type:
    | "distribution"
    | "social"
    | "marketing"
    | "studio"
    | "analytics"
    | "setup";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  action: string;
  actionUrl?: string;
  icon: string;
  timeEstimate: string;
  deadline?: string;
  context?: Record<string, any>;
}

interface SmartActionBarProps {
  onNavigate?: (path: string) => void;
  maxActions?: number;
}

const iconMap: Record<string, React.ElementType> = {
  upload: Upload,
  link: Link,
  compass: Compass,
  "trending-up": TrendingUp,
  users: Users,
  "dollar-sign": DollarSign,
  music: Music,
  clock: Clock,
  zap: Zap,
  calendar: Calendar,
};

const priorityStyles: Record<
  string,
  { bg: string; border: string; badge: string }
> = {
  high: {
    bg: "bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30",
    border: "border-red-200 dark:border-red-800",
    badge: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
  medium: {
    bg: "bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30",
    border: "border-blue-200 dark:border-blue-800",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  low: {
    bg: "bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-950/30 dark:to-slate-950/30",
    border: "border-gray-200 dark:border-gray-700",
    badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
};

export function SmartActionBar({
  onNavigate,
  maxActions = 4,
}: SmartActionBarProps) {
  const {
    data: suggestions,
    isLoading,
    error,
  } = useQuery<ActionSuggestion[]>({
    queryKey: ["/api/personalization/suggestions"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const handleAction = (suggestion: ActionSuggestion) => {
    if (suggestion.actionUrl && onNavigate) {
      onNavigate(suggestion.actionUrl);
    } else if (suggestion.actionUrl) {
      window.location.href = suggestion.actionUrl;
    }
  };

  if (isLoading) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="flex gap-3 overflow-hidden">
            {[...Array(3)].map((_, i) => (
              <Skeleton
                key={i}
                className="h-24 w-64 flex-shrink-0 rounded-lg"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !suggestions?.length) {
    return null;
  }

  const visibleSuggestions = suggestions.slice(0, maxActions);

  return (
    <Card className="border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50/50 to-blue-50/50 dark:from-purple-950/20 dark:to-blue-950/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <h3 className="font-semibold text-sm">Recommended Actions</h3>
            <Badge variant="secondary" className="text-xs">
              AI-Powered
            </Badge>
          </div>
          {suggestions.length > maxActions && (
            <Button variant="ghost" size="sm" className="text-xs">
              View All ({suggestions.length})
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>

        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-3">
            {visibleSuggestions.map((suggestion) => {
              const IconComponent = iconMap[suggestion.icon] || Zap;
              const styles = priorityStyles[suggestion.priority];

              return (
                <Card
                  key={suggestion.id}
                  className={`flex-shrink-0 w-72 cursor-pointer hover:shadow-md transition-shadow ${styles.bg} ${styles.border}`}
                  onClick={() => handleAction(suggestion)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-white dark:bg-gray-900 shadow-sm">
                          <IconComponent className="h-4 w-4 text-purple-600" />
                        </div>
                        <Badge className={`text-xs ${styles.badge}`}>
                          {suggestion.priority === "high" && (
                            <AlertCircle className="h-3 w-3 mr-1" />
                          )}
                          {suggestion.priority}
                        </Badge>
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 mr-1" />
                        {suggestion.timeEstimate}
                      </div>
                    </div>

                    <h4 className="font-semibold text-sm mb-1 truncate">
                      {suggestion.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2 whitespace-normal">
                      {suggestion.description}
                    </p>

                    <Button size="sm" className="w-full" variant="outline">
                      {suggestion.action}
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default SmartActionBar;
