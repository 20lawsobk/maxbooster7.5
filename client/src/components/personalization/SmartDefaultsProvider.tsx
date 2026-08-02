import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useEffect,
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

export interface SmartDefault {
  category: string;
  key: string;
  value: Record<string, unknown>;
  confidence: number;
  reasoning: string;
  source: "onboarding" | "behavior" | "ai" | "manual";
}

export interface GenrePreset {
  genre: string;
  defaultBPM: number;
  defaultKey: string;
  suggestedPlatforms: string[];
  contentStyle: string[];
  colorPalette: string[];
  postingFrequency: "low" | "medium" | "high";
  audienceAge: [number, number];
}

export interface DashboardWidget {
  id: string;
  position: number;
  visible: boolean;
  size: "small" | "medium" | "large";
  priority: number;
  lastUsed?: Date;
  usageCount: number;
}

export interface TimeOfDayLayout {
  morning: DashboardWidget[];
  afternoon: DashboardWidget[];
  evening: DashboardWidget[];
  night: DashboardWidget[];
}

export interface PersonalizationPreferences {
  artistType: ArtistType;
  careerStage: CareerStage;
  primaryGenres: string[];
  goals: string[];
  dashboardWidgets: DashboardWidget[];
  timeBasedLayouts: TimeOfDayLayout;
  featurePreferences: Record<string, boolean>;
  notificationPriorities: Record<string, "high" | "medium" | "low">;
  quickActions: string[];
  hiddenFeatures: string[];
}

export interface InteractionEvent {
  type: "click" | "view" | "complete" | "dismiss" | "hover" | "search";
  target: string;
  context?: Record<string, any>;
  duration?: number;
  timestamp?: Date;
}

export interface LearningInsight {
  pattern: string;
  confidence: number;
  suggestedChange: string;
  appliedAutomatically: boolean;
}

interface SmartDefaultsContextValue {
  preferences: PersonalizationPreferences | undefined;
  isLoading: boolean;
  error: Error | null;
  defaults: SmartDefault[];
  getDefault: (category: string, key: string) => SmartDefault | undefined;
  getDefaultValue: <T>(category: string, key: string, fallback: T) => T;
  updatePreference: (
    key: string,
    value: Record<string, unknown>,
  ) => Promise<void>;
  trackInteraction: (event: InteractionEvent) => Promise<void>;
  applyArtistTypeDefaults: (artistType: ArtistType) => Promise<void>;
  applyGenrePreset: (genre: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  learningInsights: LearningInsight[];
  currentTimeLayout: "morning" | "afternoon" | "evening" | "night";
  getTimeAdjustedWidgets: () => DashboardWidget[];
}

const SmartDefaultsContext = createContext<
  SmartDefaultsContextValue | undefined
>(undefined);



function getCurrentTimeOfDay(): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

interface SmartDefaultsProviderProps {
  children: React.ReactNode;
  userId?: string;
}

export function SmartDefaultsProvider({
  children,
  _userId,
}: SmartDefaultsProviderProps) {
  const queryClient = useQueryClient();
  const currentTimeLayout = getCurrentTimeOfDay();

  const {
    data: preferences,
    isLoading: prefsLoading,
    error: prefsError,
  } = useQuery<PersonalizationPreferences>({
    queryKey: ["/api/personalization/preferences"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: defaults = [], isLoading: defaultsLoading } = useQuery<
    SmartDefault[]
  >({
    queryKey: ["/api/preferences/smart-defaults"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: learningInsights = [] } = useQuery<LearningInsight[]>({
    queryKey: ["/api/personalization/learning-insights"],
    staleTime: 30 * 60 * 1000,
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

  const trackInteractionMutation = useMutation({
    mutationFn: async (event: InteractionEvent) => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/track-interaction",
        {
          ...event,
          timestamp: event.timestamp || new Date(),
        },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/behavior-analysis"],
      });
    },
    onError: () => {},
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
    async (key: string, value: Record<string, unknown>) => {
      await updatePreferenceMutation.mutateAsync({ key, value });
    },
    [updatePreferenceMutation],
  );

  const trackInteraction = useCallback(
    async (event: InteractionEvent) => {
      await trackInteractionMutation.mutateAsync(event);
    },
    [trackInteractionMutation],
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

  const applyGenrePreset = useCallback(
    async (genre: string) => {
      await applyDefaultsMutation.mutateAsync({ type: "genre", value: genre });
    },
    [applyDefaultsMutation],
  );

  const resetToDefaults = useCallback(async () => {
    await resetDefaultsMutation.mutateAsync();
  }, [resetDefaultsMutation]);

  const getTimeAdjustedWidgets = useCallback((): DashboardWidget[] => {
    if (!preferences?.timeBasedLayouts) {
      return preferences?.dashboardWidgets || [];
    }
    const timeLayouts = preferences.timeBasedLayouts;
    const currentLayouts = timeLayouts[currentTimeLayout];

    if (currentLayouts && currentLayouts.length > 0) {
      return currentLayouts;
    }

    return preferences.dashboardWidgets || [];
  }, [preferences, currentTimeLayout]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        trackInteraction({
          type: "view",
          target: "dashboard",
          context: { timeOfDay: currentTimeLayout },
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [trackInteraction, currentTimeLayout]);

  const contextValue = useMemo<SmartDefaultsContextValue>(
    () => ({
      preferences,
      isLoading: prefsLoading || defaultsLoading,
      error: prefsError as Error | null,
      defaults,
      getDefault,
      getDefaultValue,
      updatePreference,
      trackInteraction,
      applyArtistTypeDefaults,
      applyGenrePreset,
      resetToDefaults,
      learningInsights,
      currentTimeLayout,
      getTimeAdjustedWidgets,
    }),
    [
      preferences,
      prefsLoading,
      defaultsLoading,
      prefsError,
      defaults,
      getDefault,
      getDefaultValue,
      updatePreference,
      trackInteraction,
      applyArtistTypeDefaults,
      applyGenrePreset,
      resetToDefaults,
      learningInsights,
      currentTimeLayout,
      getTimeAdjustedWidgets,
    ],
  );

  return (
    <SmartDefaultsContext.Provider value={contextValue}>
      {children}
    </SmartDefaultsContext.Provider>
  );
}

export function useSmartDefaultsContext() {
  const context = useContext(SmartDefaultsContext);
  if (context === undefined) {
    throw new Error(
      "useSmartDefaultsContext must be used within a SmartDefaultsProvider",
    );
  }
  return context;
}

export default SmartDefaultsProvider;
