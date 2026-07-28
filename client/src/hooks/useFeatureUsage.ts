import { useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface FeatureUsageEntry {
  featureId: string;
  usageCount: number;
  lastUsed: Date;
  totalDuration: number;
  avgSessionDuration: number;
}

export interface FeatureVisibility {
  featureId: string;
  isVisible: boolean;
  inMoreMenu: boolean;
  priority: number;
}

export interface FeatureUsageStats {
  mostUsed: FeatureUsageEntry[];
  leastUsed: FeatureUsageEntry[];
  recentlyUsed: string[];
  neverUsed: string[];
  suggestedToHide: string[];
  suggestedToSurface: string[];
}

export interface FeaturePriorityUpdate {
  featureId: string;
  isVisible?: boolean;
  priority?: number;
}

const ALL_FEATURES = [
  "studio",
  "distribution",
  "analytics",
  "social",
  "marketplace",
  "collaborations",
  "contracts",
  "advertising",
  "notifications",
  "settings",
  "billing",
  "support",
  "ai-coach",
  "releases",
];

export function useFeatureUsage() {
  const queryClient = useQueryClient();
  const activeFeature = useRef<string | null>(null);
  const featureStartTime = useRef<number>(0);

  const { data: usageData, isLoading } = useQuery<FeatureUsageStats>({
    queryKey: ["/api/personalization/feature-usage"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: visibilitySettings } = useQuery<FeatureVisibility[]>({
    queryKey: ["/api/personalization/preferences"],
    staleTime: 10 * 60 * 1000,
    select: (data: Record<string, unknown>) => {
      const hiddenFeatures = data?.hiddenFeatures || [];
      const featurePrefs = data?.featurePreferences || {};

      return ALL_FEATURES?.map((featureId, index) => ({
        featureId,
        isVisible: !hiddenFeatures?.includes(featureId),
        inMoreMenu: hiddenFeatures.includes(featureId),
        priority:
          featurePrefs[featureId]?.priority || ALL_FEATURES?.length - index,
      }));
    },
  });

  const trackFeatureMutation = useMutation({
    mutationFn: async ({
      feature,
      duration,
    }: {
      feature: string;
      duration?: number;
    }) => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/track-feature",
        {
          feature,
          duration,
        },
      );
      return response?.json();
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({
        queryKey: ["/api/personalization/feature-usage"],
      });
      queryClient?.invalidateQueries({
        queryKey: ["/api/personalization/behavior-analysis"],
      });
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async (update: FeaturePriorityUpdate) => {
      const response = await apiRequest(
        "PUT",
        "/api/personalization/feature-priority",
        update,
      );
      return response?.json();
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({
        queryKey: ["/api/personalization/preferences"],
      });
    },
  });

  const resetPrioritiesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/reset-feature-priorities",
      );
      return response?.json();
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({
        queryKey: ["/api/personalization/preferences"],
      });
    },
  });

  const applySuggestedMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/apply-suggested-priorities",
      );
      return response?.json();
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({
        queryKey: ["/api/personalization/preferences"],
      });
    },
  });

  const frequentlyUsed = useMemo(() => {
    return usageData?.mostUsed?.slice(0, 5).map((f) => f?.featureId) || [];
  }, [usageData]);

  const rarelyUsed = useMemo(() => {
    return usageData?.leastUsed?.slice(0, 5).map((f) => f?.featureId) || [];
  }, [usageData]);

  const suggestedToHide = useMemo(() => {
    return usageData?.suggestedToHide || [];
  }, [usageData]);

  const suggestedToSurface = useMemo(() => {
    return usageData?.suggestedToSurface || [];
  }, [usageData]);

  const visibleFeatures = useMemo(() => {
    return (visibilitySettings || [])
      .filter((f) => f?.isVisible)
      .sort((a, b) => b?.priority - a?.priority)
      .map((f) => f?.featureId);
  }, [visibilitySettings]);

  const hiddenFeatures = useMemo(() => {
    return (visibilitySettings || [])
      .filter((f) => !f?.isVisible)
      .map((f) => f?.featureId);
  }, [visibilitySettings]);

  const trackFeatureStart = useCallback(
    (featureId: string) => {
      if (activeFeature?.current && activeFeature?.current !== featureId) {
        const duration = Date?.now() - featureStartTime?.current;
        if (duration > 1000) {
          trackFeatureMutation?.mutate({
            feature: activeFeature.current,
            duration,
          });
        }
      }
      activeFeature.current = featureId;
      featureStartTime.current = Date?.now();
      trackFeatureMutation?.mutate({ feature: featureId });
    },
    [trackFeatureMutation],
  );

  const trackFeatureEnd = useCallback(
    (featureId: string) => {
      if (activeFeature?.current === featureId) {
        const duration = Date?.now() - featureStartTime?.current;
        if (duration > 1000) {
          trackFeatureMutation?.mutate({ feature: featureId, duration });
        }
        activeFeature.current = null;
        featureStartTime.current = 0;
      }
    },
    [trackFeatureMutation],
  );

  const isFrequentlyUsed = useCallback(
    (featureId: string): boolean => {
      return frequentlyUsed?.includes(featureId);
    },
    [frequentlyUsed],
  );

  const isRarelyUsed = useCallback(
    (featureId: string): boolean => {
      return rarelyUsed?.includes(featureId);
    },
    [rarelyUsed],
  );

  const getUsageCount = useCallback(
    (featureId: string): number => {
      const entry = usageData?.mostUsed?.find((f) => f?.featureId === featureId);
      return entry?.usageCount || 0;
    },
    [usageData],
  );

  const hideFeature = useCallback(
    async (featureId: string) => {
      await updatePriorityMutation?.mutateAsync({
        featureId,
        isVisible: false,
      });
    },
    [updatePriorityMutation],
  );

  const showFeature = useCallback(
    async (featureId: string) => {
      await updatePriorityMutation?.mutateAsync({
        featureId,
        isVisible: true,
      });
    },
    [updatePriorityMutation],
  );

  const updatePriority = useCallback(
    async (featureId: string, priority: number) => {
      await updatePriorityMutation?.mutateAsync({
        featureId,
        priority,
      });
    },
    [updatePriorityMutation],
  );

  const resetToDefaults = useCallback(async () => {
    await resetPrioritiesMutation?.mutateAsync();
  }, [resetPrioritiesMutation]);

  const applySuggestedPriorities = useCallback(async () => {
    await applySuggestedMutation?.mutateAsync();
  }, [applySuggestedMutation]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeFeature?.current) {
        const duration = Date?.now() - featureStartTime?.current;
        navigator?.sendBeacon(
          "/api/personalization/track-feature",
          JSON.stringify({
            feature: activeFeature.current,
            duration,
          }),
        );
      }
    };

    window?.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window?.removeEventListener("beforeunload", handleBeforeUnload);
      if (activeFeature?.current) {
        trackFeatureEnd(activeFeature?.current);
      }
    };
  }, [trackFeatureEnd]);

  return {
    usageData,
    isLoading,
    frequentlyUsed,
    rarelyUsed,
    suggestedToHide,
    suggestedToSurface,
    visibleFeatures,
    hiddenFeatures,
    trackFeatureStart,
    trackFeatureEnd,
    isFrequentlyUsed,
    isRarelyUsed,
    getUsageCount,
    hideFeature,
    showFeature,
    updatePriority,
    resetToDefaults,
    applySuggestedPriorities,
    isUpdating:
      updatePriorityMutation?.isPending || resetPrioritiesMutation?.isPending,
  };
}

export function useFeatureTracking(featureId: string) {
  const { trackFeatureStart, trackFeatureEnd } = useFeatureUsage();

  useEffect(() => {
    trackFeatureStart(featureId);
    return () => trackFeatureEnd(featureId);
  }, [featureId, trackFeatureStart, trackFeatureEnd]);
}

export function useFeatureVisibility(featureId: string) {
  const { visibleFeatures, hiddenFeatures, isFrequentlyUsed, isRarelyUsed } =
    useFeatureUsage();

  return {
    isVisible: visibleFeatures.includes(featureId),
    isHidden: hiddenFeatures.includes(featureId),
    isFrequent: isFrequentlyUsed(featureId),
    isRare: isRarelyUsed(featureId),
  };
}

export default useFeatureUsage;
