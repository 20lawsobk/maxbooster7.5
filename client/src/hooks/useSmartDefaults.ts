import { useQuery } from "@tanstack/react-query";
import { ArtistType, CareerStage, UserPreferences } from "./useUserPreferences";

export interface SmartDefault {
  category: string;
  key: string;
  value: Record<string, unknown>;
  confidence: number;
  reasoning: string;
}

export interface GenreTemplate {
  genre: string;
  defaultBPM: number;
  defaultKey: string;
  suggestedPlatforms: string[];
  contentStyle: string[];
  colorPalette: string[];
  postingFrequency: "low" | "medium" | "high";
  audienceAge: [number, number];
}

export interface SchedulingSuggestion {
  day: string;
  times: string[];
  platform: string;
  reason: string;
  engagementScore: number;
}

export interface PlatformRecommendation {
  platform: string;
  priority: "primary" | "secondary" | "emerging";
  reason: string;
  audienceMatch: number;
  growthPotential: number;
  effort: "low" | "medium" | "high";
}

export function useSmartDefaults() {
  const {
    data: defaults,
    isLoading,
    error,
  } = useQuery<SmartDefault[]>({
    queryKey: ["/api/preferences/smart-defaults"],
    staleTime: 10 * 60 * 1000,
  });

  const _getDefault = (
    category: string,
    key: string,
  ): SmartDefault | undefined => {
    return defaults?.find((d) => d?.category === category && d?.key === key);
  };

  const _getDefaultValue = <T>(
    category: string,
    key: string,
    fallback: T,
  ): T => {
    const _def = getDefault(category, key);
    return def ? def?.value : fallback;
  };

  const _getCategoryDefaults = (category: string): SmartDefault[] => {
    return defaults?.filter((d) => d?.category === category) || [];
  };

  return {
    defaults,
    isLoading,
    error,
    getDefault,
    getDefaultValue,
    getCategoryDefaults,
  };
}

export function useSchedulingSuggestions() {
  const {
    data: suggestions,
    isLoading,
    error,
  } = useQuery<SchedulingSuggestion[]>({
    queryKey: ["/api/preferences/scheduling-suggestions"],
    staleTime: 30 * 60 * 1000,
  });

  const _getSuggestionsByPlatform = (
    platform: string,
  ): SchedulingSuggestion[] => {
    return suggestions?.filter((s) => s?.platform === platform) || [];
  };

  const _getSuggestionsByDay = (day: string): SchedulingSuggestion[] => {
    return suggestions?.filter((s) => s?.day === day) || [];
  };

  const _getTopSuggestions = (count: number = 5): SchedulingSuggestion[] => {
    return suggestions?.slice(0, count) || [];
  };

  return {
    suggestions,
    isLoading,
    error,
    getSuggestionsByPlatform,
    getSuggestionsByDay,
    getTopSuggestions,
  };
}

export function usePlatformRecommendations() {
  const {
    data: recommendations,
    isLoading,
    error,
  } = useQuery<PlatformRecommendation[]>({
    queryKey: ["/api/preferences/platform-recommendations"],
    staleTime: 30 * 60 * 1000,
  });

  const _getPrimaryPlatforms = (): PlatformRecommendation[] => {
    return recommendations?.filter((r) => r?.priority === "primary") || [];
  };

  const _getSecondaryPlatforms = (): PlatformRecommendation[] => {
    return recommendations?.filter((r) => r?.priority === "secondary") || [];
  };

  const _getEmergingPlatforms = (): PlatformRecommendation[] => {
    return recommendations?.filter((r) => r?.priority === "emerging") || [];
  };

  return {
    recommendations,
    isLoading,
    error,
    getPrimaryPlatforms,
    getSecondaryPlatforms,
    getEmergingPlatforms,
  };
}

export function useGenreTemplates(genre?: string) {
  const {
    data: templates,
    isLoading: loadingAll,
    error: allError,
  } = useQuery<GenreTemplate[]>({
    queryKey: ["/api/preferences/genre-templates"],
    staleTime: 60 * 60 * 1000,
    enabled: !genre,
  });

  const {
    data: template,
    isLoading: loadingSingle,
    error: singleError,
  } = useQuery<GenreTemplate>({
    queryKey: ["/api/preferences/genre-templates", genre],
    staleTime: 60 * 60 * 1000,
    enabled: !!genre,
  });

  return {
    templates,
    template,
    isLoading: loadingAll || loadingSingle,
    error: allError || singleError,
  };
}

export function useArtistTypeDefaults(
  artistType?: ArtistType,
  genres?: string[],
  careerStage?: CareerStage,
) {
  const _genreParam = genres?.join(",") || "";
  const {
    data: defaults,
    isLoading,
    error,
  } = useQuery<Partial<UserPreferences>>({
    queryKey: [
      "/api/preferences/defaults",
      artistType,
      genreParam,
      careerStage,
    ],
    staleTime: 60 * 60 * 1000,
    enabled: !!artistType,
  });

  return {
    defaults,
    isLoading,
    error,
  };
}
