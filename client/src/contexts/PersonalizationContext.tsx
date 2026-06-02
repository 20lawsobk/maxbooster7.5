import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useEffect,
  useState,
} from "react";
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
export type WidgetSize = "small" | "medium" | "large";
export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export interface DashboardWidget {
  id: string;
  title: string;
  size: WidgetSize;
  position: number;
  visible: boolean;
  pinned: boolean;
  viewCount: number;
  avgViewDuration: number;
  category: string;
  lastUsed?: Date;
}

export interface ScheduleSuggestion {
  id: string;
  dayOfWeek: string;
  timeSlot: TimeOfDay;
  specificTime: string;
  confidence: number;
  estimatedEngagement: number;
  reasoning: string;
  platforms: string[];
}

export interface RecommendedAction {
  id: string;
  type: "action" | "feature" | "content" | "setting";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: string;
  link?: string;
  estimatedTime?: string;
  impact: "high" | "medium" | "low";
  contextual: boolean;
  completed?: boolean;
  dismissed?: boolean;
}

export interface UserPersonalization {
  artistType: ArtistType;
  careerStage: CareerStage;
  primaryGenres: string[];
  goals: string[];
  dashboardWidgets: DashboardWidget[];
  featurePreferences: Record<string, boolean>;
  notificationPriorities: Record<string, "high" | "medium" | "low">;
  quickActions: string[];
  hiddenFeatures: string[];
  timezone: string;
  preferredPlatforms: string[];
}

export interface SmartDefault {
  category: string;
  key: string;
  value: Record<string, unknown>;
  confidence: number;
  reasoning: string;
  source: "onboarding" | "behavior" | "ai" | "manual";
}

export interface LearningInsight {
  id: string;
  pattern: string;
  confidence: number;
  suggestedChange: string;
  appliedAutomatically: boolean;
  createdAt: Date;
}

export interface InteractionEvent {
  type: "click" | "view" | "complete" | "dismiss" | "hover" | "search";
  target: string;
  context?: Record<string, any>;
  duration?: number;
  timestamp?: Date;
}

interface PersonalizationContextValue {
  personalization: UserPersonalization | undefined;
  isLoading: boolean;
  error: Error | null;

  defaults: SmartDefault[];
  getDefault: (category: string, key: string) => SmartDefault | undefined;
  getDefaultValue: <T>(category: string, key: string, fallback: T) => T;

  recommendations: RecommendedAction[];
  isLoadingRecommendations: boolean;
  completeAction: (actionId: string) => Promise<void>;
  dismissAction: (actionId: string) => Promise<void>;

  scheduleSuggestions: ScheduleSuggestion[];
  bestPostingTime: ScheduleSuggestion | null;
  isLoadingSchedule: boolean;
  applySchedule: (suggestion: ScheduleSuggestion) => Promise<void>;

  dashboardLayout: { widgets: DashboardWidget[] } | undefined;
  isLoadingLayout: boolean;
  updateWidgetPosition: (widgetId: string, position: number) => Promise<void>;
  updateWidgetVisibility: (widgetId: string, visible: boolean) => Promise<void>;
  updateWidgetSize: (widgetId: string, size: WidgetSize) => Promise<void>;
  saveDashboardLayout: (widgets: DashboardWidget[]) => Promise<void>;

  updatePreference: (
    key: keyof UserPersonalization,
    value: Record<string, unknown>,
  ) => Promise<void>;
  applyArtistTypeDefaults: (artistType: ArtistType) => Promise<void>;
  applyGenreDefaults: (genre: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;

  trackInteraction: (event: InteractionEvent) => void;
  trackFeatureUsage: (feature: string) => void;
  trackWidgetView: (widgetId: string, duration: number) => void;

  learningInsights: LearningInsight[];
  applyInsight: (insightId: string) => Promise<void>;
  dismissInsight: (insightId: string) => Promise<void>;

  currentTimeOfDay: TimeOfDay;
  getTimeAdjustedWidgets: () => DashboardWidget[];

  featureUsage: Record<string, number>;
  topFeatures: string[];
}

const PersonalizationContext = createContext<
  PersonalizationContextValue | undefined
>(undefined);

function getCurrentTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

interface PersonalizationProviderProps {
  children: React.ReactNode;
}

export function PersonalizationProvider({
  children,
}: PersonalizationProviderProps) {
  const queryClient = useQueryClient();
  const [currentTimeOfDay, setCurrentTimeOfDay] = useState<TimeOfDay>(
    getCurrentTimeOfDay(),
  );
  const [pendingInteractions, setPendingInteractions] = useState<
    InteractionEvent[]
  >([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeOfDay(getCurrentTimeOfDay());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (pendingInteractions.length >= 10) {
      flushInteractions();
    }
  }, [pendingInteractions]);

  const {
    data: personalization,
    isLoading: personalizationLoading,
    error: personalizationError,
  } = useQuery<UserPersonalization>({
    queryKey: ["/api/personalization/preferences"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: defaults = [] } = useQuery<SmartDefault[]>({
    queryKey: ["/api/preferences/smart-defaults"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: recommendations = [], isLoading: recommendationsLoading } =
    useQuery<RecommendedAction[]>({
      queryKey: ["/api/personalization/recommendations"],
      staleTime: 10 * 60 * 1000,
    });

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery<{
    suggestions: ScheduleSuggestion[];
    bestOverallTime: ScheduleSuggestion | null;
  }>({
    queryKey: ["/api/personalization/smart-schedule"],
    staleTime: 15 * 60 * 1000,
  });

  const { data: dashboardLayout, isLoading: layoutLoading } = useQuery<{
    widgets: DashboardWidget[];
  }>({
    queryKey: ["/api/personalization/dashboard-layout"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: learningInsights = [] } = useQuery<LearningInsight[]>({
    queryKey: ["/api/personalization/learning-insights"],
    staleTime: 30 * 60 * 1000,
  });

  const { data: featureUsage = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/personalization/feature-usage"],
    staleTime: 10 * 60 * 1000,
  });

  const updatePreferenceMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const response = await apiRequest(
        "PUT",
        "/api/personalization/preferences",
        { [key]: value },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/preferences"],
      });
    },
  });

  const applyDefaultsMutation = useMutation({
    mutationFn: async ({
      type,
      value,
    }: {
      type: "artistType" | "genre";
      value: string;
    }) => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/apply-defaults",
        { type, value },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/preferences"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/dashboard-layout"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/recommendations"],
      });
    },
  });

  const resetDefaultsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/reset-defaults",
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/preferences"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/dashboard-layout"],
      });
    },
  });

  const completeActionMutation = useMutation({
    mutationFn: async (actionId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/personalization/complete-action/${actionId}`,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/recommendations"],
      });
    },
  });

  const dismissActionMutation = useMutation({
    mutationFn: async (actionId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/personalization/dismiss-action/${actionId}`,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/recommendations"],
      });
    },
  });

  const applyScheduleMutation = useMutation({
    mutationFn: async (suggestion: ScheduleSuggestion) => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/apply-schedule",
        {
          suggestionId: suggestion.id,
          platform: "all",
        },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/smart-schedule"],
      });
    },
  });

  const saveLayoutMutation = useMutation({
    mutationFn: async (widgets: DashboardWidget[]) => {
      const response = await apiRequest(
        "PUT",
        "/api/personalization/dashboard-layout",
        {
          name: "Custom Layout",
          widgets,
        },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/dashboard-layout"],
      });
    },
  });

  const updateWidgetMutation = useMutation({
    mutationFn: async ({
      widgetId,
      updates,
    }: {
      widgetId: string;
      updates: Partial<DashboardWidget>;
    }) => {
      const response = await apiRequest(
        "PUT",
        `/api/personalization/widget/${widgetId}`,
        updates,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/dashboard-layout"],
      });
    },
  });

  const trackInteractionMutation = useMutation({
    mutationFn: async (events: InteractionEvent[]) => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/track-batch",
        { interactions: events },
      );
      return response.json();
    },
    onError: () => {},
  });

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
        queryKey: ["/api/personalization/feature-usage"],
      });
    },
    onError: () => {},
  });

  const trackWidgetViewMutation = useMutation({
    mutationFn: async ({
      widgetId,
      duration,
    }: {
      widgetId: string;
      duration: number;
    }) => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/track-widget-view",
        { widgetId, duration },
      );
      return response.json();
    },
    onError: () => {},
  });

  const applyInsightMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/personalization/apply-insight/${insightId}`,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/learning-insights"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/preferences"],
      });
    },
  });

  const dismissInsightMutation = useMutation({
    mutationFn: async (insightId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/personalization/dismiss-insight/${insightId}`,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/learning-insights"],
      });
    },
  });

  const flushInteractions = useCallback(() => {
    if (pendingInteractions.length > 0) {
      trackInteractionMutation.mutate(pendingInteractions);
      setPendingInteractions([]);
    }
  }, [pendingInteractions, trackInteractionMutation]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingInteractions.length > 0) {
        navigator.sendBeacon(
          "/api/personalization/track-batch",
          JSON.stringify({ interactions: pendingInteractions }),
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pendingInteractions]);

  const getDefault = useCallback(
    (category: string, key: string): SmartDefault | undefined => {
      return defaults.find((d) => d.category === category && d.key === key);
    },
    [defaults],
  );

  const getDefaultValue = useCallback(
    <T,>(category: string, key: string, fallback: T): T => {
      const def = getDefault(category, key);
      return def ? def.value : fallback;
    },
    [getDefault],
  );

  const updatePreference = useCallback(
    async (key: keyof UserPersonalization, value: Record<string, unknown>) => {
      await updatePreferenceMutation.mutateAsync({ key, value });
    },
    [updatePreferenceMutation],
  );

  const applyArtistTypeDefaults = useCallback(
    async (artistType: ArtistType) => {
      await applyDefaultsMutation.mutateAsync({
        type: "artistType",
        value: artistType,
      });
    },
    [applyDefaultsMutation],
  );

  const applyGenreDefaults = useCallback(
    async (genre: string) => {
      await applyDefaultsMutation.mutateAsync({ type: "genre", value: genre });
    },
    [applyDefaultsMutation],
  );

  const resetToDefaults = useCallback(async () => {
    await resetDefaultsMutation.mutateAsync();
  }, [resetDefaultsMutation]);

  const completeAction = useCallback(
    async (actionId: string) => {
      await completeActionMutation.mutateAsync(actionId);
    },
    [completeActionMutation],
  );

  const dismissAction = useCallback(
    async (actionId: string) => {
      await dismissActionMutation.mutateAsync(actionId);
    },
    [dismissActionMutation],
  );

  const applySchedule = useCallback(
    async (suggestion: ScheduleSuggestion) => {
      await applyScheduleMutation.mutateAsync(suggestion);
    },
    [applyScheduleMutation],
  );

  const updateWidgetPosition = useCallback(
    async (widgetId: string, position: number) => {
      await updateWidgetMutation.mutateAsync({
        widgetId,
        updates: { position },
      });
    },
    [updateWidgetMutation],
  );

  const updateWidgetVisibility = useCallback(
    async (widgetId: string, visible: boolean) => {
      await updateWidgetMutation.mutateAsync({
        widgetId,
        updates: { visible },
      });
    },
    [updateWidgetMutation],
  );

  const updateWidgetSize = useCallback(
    async (widgetId: string, size: WidgetSize) => {
      await updateWidgetMutation.mutateAsync({ widgetId, updates: { size } });
    },
    [updateWidgetMutation],
  );

  const saveDashboardLayout = useCallback(
    async (widgets: DashboardWidget[]) => {
      await saveLayoutMutation.mutateAsync(widgets);
    },
    [saveLayoutMutation],
  );

  const trackInteraction = useCallback((event: InteractionEvent) => {
    setPendingInteractions((prev) => [
      ...prev,
      { ...event, timestamp: new Date() },
    ]);
  }, []);

  const trackFeatureUsage = useCallback(
    (feature: string) => {
      trackFeatureMutation.mutate(feature);
    },
    [trackFeatureMutation],
  );

  const trackWidgetView = useCallback(
    (widgetId: string, duration: number) => {
      trackWidgetViewMutation.mutate({ widgetId, duration });
    },
    [trackWidgetViewMutation],
  );

  const applyInsight = useCallback(
    async (insightId: string) => {
      await applyInsightMutation.mutateAsync(insightId);
    },
    [applyInsightMutation],
  );

  const dismissInsight = useCallback(
    async (insightId: string) => {
      await dismissInsightMutation.mutateAsync(insightId);
    },
    [dismissInsightMutation],
  );

  const getTimeAdjustedWidgets = useCallback((): DashboardWidget[] => {
    if (!dashboardLayout?.widgets) return [];
    return dashboardLayout.widgets
      .filter((w) => w.visible)
      .sort((a, b) => a.position - b.position);
  }, [dashboardLayout]);

  const topFeatures = useMemo(() => {
    return Object.entries(featureUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([feature]) => feature);
  }, [featureUsage]);

  const contextValue = useMemo<PersonalizationContextValue>(
    () => ({
      personalization,
      isLoading: personalizationLoading,
      error: personalizationError as Error | null,

      defaults,
      getDefault,
      getDefaultValue,

      recommendations: recommendations.filter(
        (r) => !r.completed && !r.dismissed,
      ),
      isLoadingRecommendations: recommendationsLoading,
      completeAction,
      dismissAction,

      scheduleSuggestions: scheduleData?.suggestions || [],
      bestPostingTime: scheduleData?.bestOverallTime || null,
      isLoadingSchedule: scheduleLoading,
      applySchedule,

      dashboardLayout,
      isLoadingLayout: layoutLoading,
      updateWidgetPosition,
      updateWidgetVisibility,
      updateWidgetSize,
      saveDashboardLayout,

      updatePreference,
      applyArtistTypeDefaults,
      applyGenreDefaults,
      resetToDefaults,

      trackInteraction,
      trackFeatureUsage,
      trackWidgetView,

      learningInsights,
      applyInsight,
      dismissInsight,

      currentTimeOfDay,
      getTimeAdjustedWidgets,

      featureUsage,
      topFeatures,
    }),
    [
      personalization,
      personalizationLoading,
      personalizationError,
      defaults,
      getDefault,
      getDefaultValue,
      recommendations,
      recommendationsLoading,
      completeAction,
      dismissAction,
      scheduleData,
      scheduleLoading,
      applySchedule,
      dashboardLayout,
      layoutLoading,
      updateWidgetPosition,
      updateWidgetVisibility,
      updateWidgetSize,
      saveDashboardLayout,
      updatePreference,
      applyArtistTypeDefaults,
      applyGenreDefaults,
      resetToDefaults,
      trackInteraction,
      trackFeatureUsage,
      trackWidgetView,
      learningInsights,
      applyInsight,
      dismissInsight,
      currentTimeOfDay,
      getTimeAdjustedWidgets,
      featureUsage,
      topFeatures,
    ],
  );

  return (
    <PersonalizationContext.Provider value={contextValue}>
      {children}
    </PersonalizationContext.Provider>
  );
}

export function usePersonalization() {
  const context = useContext(PersonalizationContext);
  if (context === undefined) {
    throw new Error(
      "usePersonalization must be used within a PersonalizationProvider",
    );
  }
  return context;
}

export function useRecommendedActions() {
  const {
    recommendations,
    isLoadingRecommendations,
    completeAction,
    dismissAction,
  } = usePersonalization();
  return {
    recommendations,
    isLoading: isLoadingRecommendations,
    completeAction,
    dismissAction,
  };
}

export function useSmartSchedule() {
  const {
    scheduleSuggestions,
    bestPostingTime,
    isLoadingSchedule,
    applySchedule,
  } = usePersonalization();
  return {
    suggestions: scheduleSuggestions,
    bestTime: bestPostingTime,
    isLoading: isLoadingSchedule,
    applySchedule,
  };
}

export function useDashboardLayout() {
  const {
    dashboardLayout,
    isLoadingLayout,
    updateWidgetPosition,
    updateWidgetVisibility,
    updateWidgetSize,
    saveDashboardLayout,
    getTimeAdjustedWidgets,
  } = usePersonalization();
  return {
    layout: dashboardLayout,
    isLoading: isLoadingLayout,
    updatePosition: updateWidgetPosition,
    updateVisibility: updateWidgetVisibility,
    updateSize: updateWidgetSize,
    saveLayout: saveDashboardLayout,
    getTimeAdjustedWidgets,
  };
}

export function useUserDefaults() {
  const {
    defaults,
    getDefault,
    getDefaultValue,
    applyArtistTypeDefaults,
    applyGenreDefaults,
    resetToDefaults,
  } = usePersonalization();
  return {
    defaults,
    getDefault,
    getDefaultValue,
    applyArtistTypeDefaults,
    applyGenreDefaults,
    resetToDefaults,
  };
}

export function useLearningInsights() {
  const { learningInsights, applyInsight, dismissInsight } =
    usePersonalization();
  return { insights: learningInsights, applyInsight, dismissInsight };
}

export function useInteractionTracking() {
  const { trackInteraction, trackFeatureUsage, trackWidgetView } =
    usePersonalization();
  return { trackInteraction, trackFeatureUsage, trackWidgetView };
}

export default PersonalizationContext;
