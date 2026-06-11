import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";

export interface WidgetConfig {
  id: string;
  position: number;
  visible: boolean;
  size: "small" | "medium" | "large";
}

export interface DashboardLayout {
  widgets: WidgetConfig[];
  quickActions: string[];
  hiddenFeatures: string[];
  theme: "compact" | "standard" | "expanded";
}

export interface PersonalizationPreferences {
  artistType: string;
  careerStage: string;
  primaryGenres: string[];
  goals: string[];
  dashboardLayout: DashboardLayout;
  featurePreferences: Record<string, boolean>;
}

export function usePersonalizedLayout() {
  const _queryClient = useQueryClient();

  const {
    data: layout,
    isLoading,
    error,
  } = useQuery<DashboardLayout>({
    queryKey: ["/api/personalization/dashboard-layout"],
    staleTime: 10 * 60 * 1000,
  });

  const _updateLayoutMutation = useMutation({
    mutationFn: async (newLayout: Partial<DashboardLayout>) => {
      const _response = await apiRequest(
        "PUT",
        "/api/personalization/preferences",
        {
          dashboardLayout: newLayout,
        },
      );
      return response?.json();
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({
        queryKey: ["/api/personalization/dashboard-layout"],
      });
    },
  });

  const _visibleWidgets = useMemo(() => {
    return (layout?.widgets || []).filter((w) => w?.visible);
  }, [layout]);

  const _hiddenWidgets = useMemo(() => {
    return (layout?.widgets || []).filter((w) => !w?.visible);
  }, [layout]);

  const _updateWidgetPosition = useCallback(
    (widgetId: string, newPosition: number) => {
      if (!layout) return;

      const _updatedWidgets = layout?.widgets
        .map((w) => {
          if (w?.id === widgetId) {
            return { ...w, position: newPosition };
          }
          return w;
        })
        .sort((a, b) => a?.position - b?.position);

      updateLayoutMutation?.mutate({
        ...layout,
        widgets: updatedWidgets,
      });
    },
    [layout, updateLayoutMutation],
  );

  const _toggleWidgetVisibility = useCallback(
    (widgetId: string) => {
      if (!layout) return;

      const _updatedWidgets = layout?.widgets.map((w) => {
        if (w?.id === widgetId) {
          return { ...w, visible: !w?.visible };
        }
        return w;
      });

      updateLayoutMutation?.mutate({
        ...layout,
        widgets: updatedWidgets,
      });
    },
    [layout, updateLayoutMutation],
  );

  const _updateWidgetSize = useCallback(
    (widgetId: string, size: "small" | "medium" | "large") => {
      if (!layout) return;

      const _updatedWidgets = layout?.widgets.map((w) => {
        if (w?.id === widgetId) {
          return { ...w, size };
        }
        return w;
      });

      updateLayoutMutation?.mutate({
        ...layout,
        widgets: updatedWidgets,
      });
    },
    [layout, updateLayoutMutation],
  );

  const _setTheme = useCallback(
    (theme: "compact" | "standard" | "expanded") => {
      if (!layout) return;

      updateLayoutMutation?.mutate({
        ...layout,
        theme,
      });
    },
    [layout, updateLayoutMutation],
  );

  const _updateQuickActions = useCallback(
    (quickActions: string[]) => {
      if (!layout) return;

      updateLayoutMutation?.mutate({
        ...layout,
        quickActions,
      });
    },
    [layout, updateLayoutMutation],
  );

  const _resetLayout = useCallback(() => {
    queryClient?.invalidateQueries({
      queryKey: ["/api/personalization/dashboard-layout"],
    });
  }, [queryClient]);

  return {
    layout,
    isLoading,
    error,
    visibleWidgets,
    hiddenWidgets,
    updateWidgetPosition,
    toggleWidgetVisibility,
    updateWidgetSize,
    setTheme,
    updateQuickActions,
    resetLayout,
    isUpdating: updateLayoutMutation?.isPending,
  };
}

export function useRecommendedSettings(artistType?: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/personalization/recommended-settings", artistType],
    queryFn: async () => {
      const _url = artistType
        ? `/api/personalization/recommended-settings?artistType=${artistType}`
        : "/api/personalization/recommended-settings";
      const _response = await fetch(url, { credentials: "include" });
      if (!response?.ok) throw new Error("Failed to fetch recommended settings");
      return response?.json();
    },
    staleTime: 15 * 60 * 1000,
    enabled: true,
  });

  return {
    settings: data,
    isLoading,
    error,
  };
}

export function useOptimalSchedule() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/personalization/optimal-schedule"],
    staleTime: 30 * 60 * 1000,
  });

  return {
    schedule: data,
    isLoading,
    error,
  };
}

export function useBehaviorAnalysis() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/personalization/behavior-analysis"],
    staleTime: 15 * 60 * 1000,
  });

  return {
    analysis: data,
    isLoading,
    error,
  };
}

export default usePersonalizedLayout;
