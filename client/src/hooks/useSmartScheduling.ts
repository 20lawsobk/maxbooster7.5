// @ts-nocheck
import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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

export interface AudienceTimezone {
  timezone: string;
  percentage: number;
  peakHours: string[];
}

export interface SmartScheduleData {
  suggestions: ScheduleSuggestion[];
  bestOverallTime: ScheduleSuggestion | null;
  weeklyPattern: Record<DayOfWeek, number>;
  audienceTimezones: AudienceTimezone[];
  engagementTrend: "increasing" | "stable" | "decreasing";
  lastUpdated: string;
}

export interface EngagementPattern {
  platform: string;
  dayOfWeek: DayOfWeek;
  hour: number;
  avgEngagement: number;
  sampleSize: number;
}

export function useSmartScheduling(
  platform: string = "all",
  contentType: string = "post",
) {
  const queryClient = useQueryClient();

  const {
    data: scheduleData,
    isLoading,
    error,
    refetch,
  } = useQuery<SmartScheduleData>({
    queryKey: ["/api/personalization/smart-schedule", platform, contentType],
    staleTime: 15 * 60 * 1000,
  });

  const { data: engagementPatterns } = useQuery<EngagementPattern[]>({
    queryKey: ["/api/personalization/interaction-patterns"],
    staleTime: 30 * 60 * 1000,
  });

  const applyScheduleMutation = useMutation({
    mutationFn: async (suggestion: ScheduleSuggestion) => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/apply-schedule",
        {
          suggestionId: suggestion.id,
          platform,
        },
      );
      return response?.json();
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({
        queryKey: ["/api/personalization/smart-schedule"],
      });
    },
  });

  const bestTime = useMemo(() => {
    return scheduleData?.bestOverallTime || null;
  }, [scheduleData]);

  const topSuggestions = useMemo(() => {
    if (!scheduleData?.suggestions) return [];
    return [...(scheduleData?.suggestions ?? [])]
      .sort((a, b) => b?.confidence - a?.confidence)
      .slice(0, 5);
  }, [scheduleData]);

  const weeklyHeatmap = useMemo(() => {
    return scheduleData?.weeklyPattern || {};
  }, [scheduleData]);

  const audienceTimezones = useMemo(() => {
    return scheduleData?.audienceTimezones || [];
  }, [scheduleData]);

  const primaryTimezone = useMemo(() => {
    if (!audienceTimezones?.length) return null;
    return audienceTimezones?.reduce((prev, current) =>
      prev?.percentage > current?.percentage ? prev : current,
    );
  }, [audienceTimezones]);

  const getSuggestionsForDay = useCallback(
    (day: DayOfWeek): ScheduleSuggestion[] => {
      if (!scheduleData?.suggestions) return [];
      return scheduleData?.suggestions.filter((s) => s?.dayOfWeek === day);
    },
    [scheduleData],
  );

  const getSuggestionsForPlatform = useCallback(
    (platformName: string): ScheduleSuggestion[] => {
      if (!scheduleData?.suggestions) return [];
      return scheduleData?.suggestions.filter((s) =>
        s?.platforms.includes(platformName),
      );
    },
    [scheduleData],
  );

  const getBestTimeForPlatform = useCallback(
    (platformName: string): ScheduleSuggestion | null => {
      const platformSuggestions = getSuggestionsForPlatform(platformName);
      if (!platformSuggestions?.length) return null;
      return platformSuggestions?.reduce((prev, current) =>
        prev?.confidence > current?.confidence ? prev : current,
      );
    },
    [getSuggestionsForPlatform],
  );

  const getEngagementScore = useCallback(
    (day: DayOfWeek, hour: number): number => {
      if (!engagementPatterns) return 0.5;
      const patterns = engagementPatterns?.filter(
        (p) => p?.dayOfWeek === day && p?.hour === hour,
      );
      if (!patterns?.length) return 0.5;
      return (
        patterns?.reduce((sum, p) => sum + p?.avgEngagement, 0) / patterns?.length
      );
    },
    [engagementPatterns],
  );

  const getOptimalTimeRange = useCallback(
    (day: DayOfWeek): { start: string; end: string } | null => {
      const daySuggestions = getSuggestionsForDay(day);
      if (!daySuggestions?.length) return null;

      const times = daySuggestions?.map((s) =>
        parseInt(s?.specificTime.split(":")[0]),
      );
      const minHour = Math.min(...times);
      const maxHour = Math.max(...times);

      return {
        start: `${minHour?.toString().padStart(2, "0")}:00`,
        end: `${maxHour?.toString().padStart(2, "0")}:00`,
      };
    },
    [getSuggestionsForDay],
  );

  const applySchedule = useCallback(
    async (suggestion: ScheduleSuggestion) => {
      await applyScheduleMutation?.mutateAsync(suggestion);
    },
    [applyScheduleMutation],
  );

  const refreshSuggestions = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    scheduleData,
    isLoading,
    error,
    bestTime,
    topSuggestions,
    weeklyHeatmap,
    audienceTimezones,
    primaryTimezone,
    engagementTrend: scheduleData.engagementTrend || "stable",
    getSuggestionsForDay,
    getSuggestionsForPlatform,
    getBestTimeForPlatform,
    getEngagementScore,
    getOptimalTimeRange,
    applySchedule,
    refreshSuggestions,
    isApplying: applyScheduleMutation.isPending,
    lastUpdated: scheduleData.lastUpdated,
  };
}

export function useOptimalPostingTime(platform?: string) {
  const { bestTime, getBestTimeForPlatform, isLoading } = useSmartScheduling();

  const optimalTime = useMemo(() => {
    if (platform) {
      return getBestTimeForPlatform(platform);
    }
    return bestTime;
  }, [platform, bestTime, getBestTimeForPlatform]);

  return {
    optimalTime,
    isLoading,
    formattedTime: optimalTime
      ? `${optimalTime?.dayOfWeek.charAt(0).toUpperCase() + optimalTime?.dayOfWeek.slice(1)} at ${optimalTime?.specificTime}`
      : null,
    confidence: optimalTime.confidence || 0,
  };
}

export function useAudienceTimezones() {
  const { audienceTimezones, primaryTimezone, isLoading } =
    useSmartScheduling();

  return {
    timezones: audienceTimezones,
    primaryTimezone,
    isLoading,
    timezoneCount: audienceTimezones.length,
    hasInternationalAudience: audienceTimezones.length > 1,
  };
}

export default useSmartScheduling;
