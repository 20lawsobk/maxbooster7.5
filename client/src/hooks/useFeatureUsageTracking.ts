import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface FeatureUsageData {
  feature: string;
  count: number;
  lastUsed: Date;
}

interface UsageSession {
  feature: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

interface FeatureUsageStats {
  mostUsedFeatures: FeatureUsageData[];
  recentFeatures: string[];
  sessionDuration: number;
  featureTimeSpent: Record<string, number>;
}

export function useFeatureUsageTracking() {
  const queryClient = useQueryClient();
  const currentSession = useRef<UsageSession | null>(null);
  const sessionStartTime = useRef<number>(Date.now());

  const trackFeatureMutation = useMutation({
    mutationFn: async (feature: string) => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/track-feature",
        { feature },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/behavior-analysis"],
      });
    },
  });

  const { data: behaviorAnalysis } = useQuery({
    queryKey: ["/api/personalization/behavior-analysis"],
    staleTime: 10 * 60 * 1000,
  });

  const trackFeature = useCallback(
    (feature: string) => {
      if (
        currentSession.current &&
        currentSession.current.feature !== feature
      ) {
        currentSession.current.endTime = Date.now();
        currentSession.current.duration =
          currentSession.current.endTime - currentSession.current.startTime;
      }

      currentSession.current = {
        feature,
        startTime: Date.now(),
      };

      trackFeatureMutation.mutate(feature);
    },
    [trackFeatureMutation],
  );

  const trackPageView = useCallback(
    (pageName: string) => {
      trackFeature(`page:${pageName}`);
    },
    [trackFeature],
  );

  const trackAction = useCallback(
    (actionName: string, _context?: Record<string, any>) => {
      trackFeature(`action:${actionName}`);
    },
    [trackFeature],
  );

  const trackButtonClick = useCallback(
    (buttonId: string, _context?: Record<string, any>) => {
      trackFeature(`button:${buttonId}`);
    },
    [trackFeature],
  );

  const trackFormSubmit = useCallback(
    (formId: string, success: boolean) => {
      trackFeature(`form:${formId}:${success ? "success" : "failure"}`);
    },
    [trackFeature],
  );

  const getFeatureUsageStats = useCallback((): FeatureUsageStats | null => {
    if (!behaviorAnalysis) return null;

    const analysis = behaviorAnalysis as Record<string, unknown>;
    return {
      mostUsedFeatures: analysis.mostUsedFeatures || [],
      recentFeatures:
        analysis.mostUsedFeatures
          ?.slice(0, 5)
          .map((f: Record<string, unknown>) => f.feature) || [],
      sessionDuration: Date.now() - sessionStartTime.current,
      featureTimeSpent: {},
    };
  }, [behaviorAnalysis]);

  const isFrequentlyUsed = useCallback(
    (feature: string): boolean => {
      if (!behaviorAnalysis) return false;
      const analysis = behaviorAnalysis as Record<string, unknown>;
      const featureData = analysis.mostUsedFeatures?.find(
        (f: Record<string, unknown>) => f.feature === feature,
      );
      return featureData ? featureData.count >= 5 : false;
    },
    [behaviorAnalysis],
  );

  const getFeatureUsageCount = useCallback(
    (feature: string): number => {
      if (!behaviorAnalysis) return 0;
      const analysis = behaviorAnalysis as Record<string, unknown>;
      const featureData = analysis.mostUsedFeatures?.find(
        (f: Record<string, unknown>) => f.feature === feature,
      );
      return featureData?.count || 0;
    },
    [behaviorAnalysis],
  );

  const getTopFeatures = useCallback(
    (count: number = 5): string[] => {
      if (!behaviorAnalysis) return [];
      const analysis = behaviorAnalysis as Record<string, unknown>;
      return (analysis.mostUsedFeatures || [])
        .slice(0, count)
        .map((f: Record<string, unknown>) => f.feature);
    },
    [behaviorAnalysis],
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && currentSession.current) {
        currentSession.current.endTime = Date.now();
        currentSession.current.duration =
          currentSession.current.endTime - currentSession.current.startTime;
      }
    };

    const handleBeforeUnload = () => {
      if (currentSession.current) {
        currentSession.current.endTime = Date.now();
        currentSession.current.duration =
          currentSession.current.endTime - currentSession.current.startTime;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return {
    trackFeature,
    trackPageView,
    trackAction,
    trackButtonClick,
    trackFormSubmit,
    getFeatureUsageStats,
    isFrequentlyUsed,
    getFeatureUsageCount,
    getTopFeatures,
    isTracking: trackFeatureMutation.isPending,
  };
}

export function usePageTracking(pageName: string) {
  const { trackPageView } = useFeatureUsageTracking();

  useEffect(() => {
    trackPageView(pageName);
  }, [pageName, trackPageView]);
}

export function useActionTracking() {
  const { trackAction, trackButtonClick } = useFeatureUsageTracking();

  const withTracking = useCallback(
    <T extends (...args: unknown[]) => any>(
      actionName: string,
      handler: T,
    ): T => {
      return ((...args: Parameters<T>) => {
        trackAction(actionName);
        return handler(...args);
      }) as T;
    },
    [trackAction],
  );

  return {
    trackAction,
    trackButtonClick,
    withTracking,
  };
}

export default useFeatureUsageTracking;
