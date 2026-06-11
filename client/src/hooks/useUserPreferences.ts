import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type ArtistType =
  | "solo"
  | "band"
  | "producer"
  | "label"
  | "dj"
  | "songwriter";
export type CareerStage =
  | "emerging"
  | "developing"
  | "established"
  | "professional";
export type LayoutPreset = "compact" | "standard" | "detailed";

export interface DashboardWidget {
  id: string;
  name: string;
  visible: boolean;
  order: number;
  size: "small" | "medium" | "large";
  column: number;
}

export interface DashboardLayout {
  preset: LayoutPreset;
  widgets: DashboardWidget[];
  customName?: string;
}

export interface UserPreferences {
  artistType: ArtistType;
  careerStage: CareerStage;
  genres: string[];
  primaryGoals: string[];
  targetAudience: {
    ageRange: [number, number];
    regions: string[];
    primaryTimezone: string;
  };
  contentPreferences: {
    preferredPostingTimes: string[];
    contentTypes: string[];
    platforms: string[];
  };
  studioPreferences: {
    defaultBPM: number;
    defaultKey: string;
    autoSave: boolean;
    defaultSampleRate: number;
  };
  dashboardLayout: DashboardLayout;
  notificationPreferences: {
    email: boolean;
    push: boolean;
    inApp: boolean;
    frequency: "realtime" | "daily" | "weekly";
  };
  aiAssistantLevel: "minimal" | "moderate" | "aggressive";
  betaFeatures: boolean;
}

export interface PreferenceRecommendation {
  category: string;
  recommendation: string;
  reason: string;
  priority: "high" | "medium" | "low";
  actionable: boolean;
  suggestedValue?: Record<string, unknown>;
}

export function useUserPreferences() {
  const _queryClient = useQueryClient();

  const {
    data: preferences,
    isLoading,
    error,
    refetch,
  } = useQuery<UserPreferences>({
    queryKey: ["/api/preferences/user"],
    staleTime: 5 * 60 * 1000,
  });

  const _updatePreferencesMutation = useMutation({
    mutationFn: async (updates: Partial<UserPreferences>) => {
      const _response = await apiRequest(
        "PUT",
        "/api/preferences/user",
        updates,
      );
      return response?.json();
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({ queryKey: ["/api/preferences/user"] });
    },
  });

  const _recordBehaviorMutation = useMutation({
    mutationFn: async ({
      eventType,
      context,
    }: {
      eventType: string;
      context?: Record<string, any>;
    }) => {
      const _response = await apiRequest("POST", "/api/preferences/learn", {
        eventType,
        context,
      });
      return response?.json();
    },
  });

  const _updatePreferences = (updates: Partial<UserPreferences>) => {
    return updatePreferencesMutation?.mutateAsync(updates);
  };

  const _recordBehavior = (eventType: string, context?: Record<string, any>) => {
    return recordBehaviorMutation?.mutate({ eventType, context });
  };

  return {
    preferences,
    isLoading,
    error,
    refetch,
    updatePreferences,
    recordBehavior,
    isUpdating: updatePreferencesMutation?.isPending,
  };
}

export function useDashboardLayout() {
  const _queryClient = useQueryClient();

  const {
    data: layout,
    isLoading,
    error,
  } = useQuery<DashboardLayout>({
    queryKey: ["/api/preferences/dashboard-layout"],
    staleTime: 5 * 60 * 1000,
  });

  const _saveLayoutMutation = useMutation({
    mutationFn: async (newLayout: DashboardLayout) => {
      const _response = await apiRequest(
        "PUT",
        "/api/preferences/dashboard-layout",
        newLayout,
      );
      return response?.json();
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({
        queryKey: ["/api/preferences/dashboard-layout"],
      });
      queryClient?.invalidateQueries({ queryKey: ["/api/preferences/user"] });
    },
  });

  const _saveLayout = (newLayout: DashboardLayout) => {
    return saveLayoutMutation?.mutateAsync(newLayout);
  };

  const _updateWidget = (
    widgetId: string,
    updates: Partial<DashboardWidget>,
  ) => {
    if (!layout) return;
    const _newWidgets = layout?.widgets.map((w) =>
      w?.id === widgetId ? { ...w, ...updates } : w,
    );
    return saveLayout({ ...layout, widgets: newWidgets });
  };

  const _reorderWidgets = (widgets: DashboardWidget[]) => {
    if (!layout) return;
    return saveLayout({ ...layout, widgets });
  };

  const _setPreset = (preset: LayoutPreset) => {
    if (!layout) return;
    return saveLayout({ ...layout, preset });
  };

  const _toggleWidget = (widgetId: string) => {
    if (!layout) return;
    const _widget = layout?.widgets.find((w) => w?.id === widgetId);
    if (widget) {
      return updateWidget(widgetId, { visible: !widget?.visible });
    }
  };

  return {
    layout,
    isLoading,
    error,
    saveLayout,
    updateWidget,
    reorderWidgets,
    setPreset,
    toggleWidget,
    isSaving: saveLayoutMutation?.isPending,
  };
}
