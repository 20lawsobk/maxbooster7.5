// @ts-nocheck
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { Clock, Calendar, TrendingUp, Users, Sparkles, Globe, Sun, Moon, Sunrise, Sunset, Target, Info, Zap, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
export type TimeSlot = "morning" | "afternoon" | "evening" | "night";

export interface ScheduleSuggestion {
  id: string;
  dayOfWeek: DayOfWeek;
  timeSlot: TimeSlot;
  specificTime: string;
  timezone: string;
  confidence: number;
  estimatedEngagement: number;
  reasoning: string;
  platforms: string[];
  audienceActivity: number;
  historicalPerformance?: number;
}

export interface SmartScheduleData {
  suggestions: ScheduleSuggestion[];
  bestOverallTime: ScheduleSuggestion | null;
  weeklyPattern: Record<DayOfWeek, number>;
  audienceTimezones: { timezone: string; percentage: number }[];
  engagementTrend: "increasing" | "stable" | "decreasing";
  lastUpdated: string;
}

interface SmartScheduleSuggestionProps {
  platform?: string;
  contentType?: string;
  onSelectTime?: (suggestion: ScheduleSuggestion) => void;
  showAnalytics?: boolean;
  compact?: boolean;
}

const dayLabels: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const fullDayLabels: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const timeSlotIcons: Record<TimeSlot, React.ElementType> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: Moon,
};


const daysOfWeek: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export function SmartScheduleSuggestion({
  platform = "all",
  contentType = "post",
  onSelectTime,
  showAnalytics = true,
  compact = false,
}: SmartScheduleSuggestionProps) {
  useQueryClient();
  const [selectedPlatform, setSelectedPlatform] = useState(platform);
  const [hoveredDay, setHoveredDay] = useState<DayOfWeek | null>(null);

  const {
    data: scheduleData,
    isLoading,
    error,
  } = useQuery<SmartScheduleData>({
    queryKey: [
      "/api/personalization/smart-schedule",
      selectedPlatform,
      contentType,
    ],
    staleTime: 15 * 60 * 1000,
  });

  const applyScheduleMutation = useMutation({
    mutationFn: async (suggestion: ScheduleSuggestion) => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/apply-schedule",
        {
          suggestionId: suggestion.id,
          platform: selectedPlatform,
        },
      );
      return response.json();
    },
  });

  const topSuggestions = useMemo(() => {
    if (!scheduleData?.suggestions) return [];
    return [...scheduleData.suggestions]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }, [scheduleData]);

  const weekHeatmap = useMemo(() => {
    if (!scheduleData?.weeklyPattern) return {};
    return scheduleData.weeklyPattern;
  }, [scheduleData]);

  const handleSelectTime = (suggestion: ScheduleSuggestion) => {
    applyScheduleMutation.mutate(suggestion);
    onSelectTime?.(suggestion);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-7 gap-2">
              {[...Array(7)].map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !scheduleData) {
    return (
      <Card>
        <CardContent className="text-center py-8 text-muted-foreground">
          <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>Unable to load schedule suggestions</p>
          <p className="text-xs mt-1">Try again later</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-base">Smart Schedule</CardTitle>
          </div>
          <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
            <SelectTrigger className="w-32 h-8">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="twitter">Twitter</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CardDescription className="flex items-center gap-2">
          <Globe className="h-3 w-3" />
          AI-optimized posting times based on your audience
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {scheduleData.bestOverallTime && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Best Time to Post</span>
              <Badge variant="secondary" className="text-xs ml-auto">
                {Math.round(scheduleData.bestOverallTime.confidence * 100)}%
                confidence
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-2xl font-bold">
                  {fullDayLabels[scheduleData.bestOverallTime.dayOfWeek]},{" "}
                  {scheduleData.bestOverallTime.specificTime}
                </span>
                <p className="text-sm text-muted-foreground mt-1">
                  {scheduleData.bestOverallTime.reasoning}
                </p>
              </div>
              <Button
                onClick={() => handleSelectTime(scheduleData.bestOverallTime!)}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Schedule
              </Button>
            </div>
          </div>
        )}

        {!compact && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">
                Weekly Engagement Heatmap
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Darker colors indicate higher engagement potential</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {daysOfWeek.map((day) => {
                const activity = weekHeatmap[day] || 0;
                const opacity = 0.2 + activity * 0.8;
                const suggestion = scheduleData.suggestions.find(
                  (s) => s.dayOfWeek === day,
                );

                return (
                  <TooltipProvider key={day}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex flex-col items-center p-3 rounded-lg border cursor-pointer transition-all",
                            hoveredDay === day && "ring-2 ring-primary",
                          )}
                          style={{
                            backgroundColor: `rgba(124, 58, 237, ${opacity})`,
                          }}
                          onMouseEnter={() => setHoveredDay(day)}
                          onMouseLeave={() => setHoveredDay(null)}
                          onClick={() =>
                            suggestion && handleSelectTime(suggestion)
                          }
                        >
                          <span className="text-xs font-medium text-white">
                            {dayLabels[day]}
                          </span>
                          <span className="text-lg font-bold text-white mt-1">
                            {Math.round(activity * 100)}%
                          </span>
                          {suggestion && (
                            <span className="text-xs text-white/80 mt-1">
                              {suggestion.specificTime}
                            </span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{fullDayLabels[day]}</p>
                        <p className="text-xs text-muted-foreground">
                          {Math.round(activity * 100)}% audience activity
                        </p>
                        {suggestion && (
                          <p className="text-xs">
                            Best time: {suggestion.specificTime}
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Top Recommendations</span>
            <Badge variant="outline" className="text-xs">
              <TrendingUp className="h-3 w-3 mr-1" />
              {scheduleData.engagementTrend} engagement
            </Badge>
          </div>
          <div className="space-y-2">
            {topSuggestions.map((suggestion, index) => {
              const TimeIcon = timeSlotIcons[suggestion.timeSlot];
              return (
                <div
                  key={suggestion.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:bg-accent/50",
                    index === 0 &&
                      "border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20",
                  )}
                  onClick={() => handleSelectTime(suggestion)}
                >
                  <div
                    className={cn(
                      "p-2 rounded-lg",
                      index === 0
                        ? "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400"
                        : "bg-muted",
                    )}
                  >
                    <TimeIcon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {fullDayLabels[suggestion.dayOfWeek]} at{" "}
                        {suggestion.specificTime}
                      </span>
                      {index === 0 && (
                        <Badge variant="secondary" className="text-xs">
                          <ThumbsUp className="h-3 w-3 mr-1" />
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {suggestion.reasoning}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {Math.round(suggestion.confidence * 100)}% confidence
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {Math.round(suggestion.audienceActivity * 100)}%
                        audience active
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600">
                      +{Math.round(suggestion.estimatedEngagement)}%
                    </div>
                    <span className="text-xs text-muted-foreground">
                      est. engagement
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showAnalytics && scheduleData.audienceTimezones.length > 0 && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Audience Timezones</span>
            </div>
            <div className="space-y-2">
              {scheduleData.audienceTimezones.slice(0, 4).map((tz) => (
                <div key={tz.timezone} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-24 truncate">
                    {tz.timezone}
                  </span>
                  <Progress value={tz.percentage} className="flex-1 h-2" />
                  <span className="text-xs font-medium w-10 text-right">
                    {tz.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t text-xs text-muted-foreground flex items-center gap-2">
          <Clock className="h-3 w-3" />
          Last updated:{" "}
          {new Date(scheduleData.lastUpdated).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );
}

export default SmartScheduleSuggestion;
