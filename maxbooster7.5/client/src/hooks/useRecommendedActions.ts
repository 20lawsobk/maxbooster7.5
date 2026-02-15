import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export type CareerStage = 'emerging' | 'developing' | 'established' | 'professional';
export type ArtistType = 'solo' | 'band' | 'producer' | 'label' | 'dj' | 'songwriter';
export type ActionPriority = 'high' | 'medium' | 'low';
export type ActionType = 'action' | 'feature' | 'content' | 'setting' | 'goal';
export type ActionCategory = 'setup' | 'content' | 'distribution' | 'marketing' | 'engagement' | 'monetization' | 'analytics' | 'collaboration' | 'social';

export interface RecommendedAction {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  priority: ActionPriority;
  category: ActionCategory;
  link?: string;
  estimatedTime?: string;
  impact: ActionPriority;
  careerStages?: CareerStage[];
  artistTypes?: ArtistType[];
  contextual: boolean;
  completed?: boolean;
  dismissed?: boolean;
  dueDate?: Date;
  progress?: number;
}

export interface PersonalizedTip {
  id: string;
  title: string;
  content: string;
  category: string;
  relevanceScore: number;
  forCareerStage: CareerStage[];
  forArtistType: ArtistType[];
  actionable: boolean;
  actionLink?: string;
}

export interface CareerGuidance {
  currentStage: CareerStage;
  nextStage: CareerStage;
  progressToNext: number;
  milestones: {
    id: string;
    title: string;
    completed: boolean;
    requiredForProgress: boolean;
  }[];
  recommendations: string[];
}

export function useRecommendedActions(options?: {
  limit?: number;
  careerStage?: CareerStage;
  artistType?: ArtistType;
  category?: ActionCategory;
}) {
  const queryClient = useQueryClient();
  const { limit = 10, careerStage, artistType, category } = options || {};

  const { data: allActions = [], isLoading, error, refetch } = useQuery<RecommendedAction[]>({
    queryKey: ['/api/personalization/recommendations'],
    staleTime: 10 * 60 * 1000,
  });

  const { data: careerGuidance } = useQuery<CareerGuidance>({
    queryKey: ['/api/personalization/next-action'],
    staleTime: 15 * 60 * 1000,
  });

  const completeActionMutation = useMutation({
    mutationFn: async (actionId: string) => {
      const response = await apiRequest('POST', `/api/personalization/complete-action/${actionId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/personalization/recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/personalization/next-action'] });
    },
  });

  const dismissActionMutation = useMutation({
    mutationFn: async (actionId: string) => {
      const response = await apiRequest('POST', `/api/personalization/dismiss-action/${actionId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/personalization/recommendations'] });
    },
  });

  const filteredActions = useMemo(() => {
    let actions = allActions.filter(a => !a.completed && !a.dismissed);

    if (careerStage) {
      actions = actions.filter(a => !a.careerStages || a.careerStages.includes(careerStage));
    }
    if (artistType) {
      actions = actions.filter(a => !a.artistTypes || a.artistTypes.includes(artistType));
    }
    if (category) {
      actions = actions.filter(a => a.category === category);
    }

    return actions.slice(0, limit);
  }, [allActions, careerStage, artistType, category, limit]);

  const highPriorityActions = useMemo(() => {
    return filteredActions.filter(a => a.priority === 'high');
  }, [filteredActions]);

  const contextualActions = useMemo(() => {
    return filteredActions.filter(a => a.contextual);
  }, [filteredActions]);

  const nextAction = useMemo(() => {
    return highPriorityActions[0] || filteredActions[0] || null;
  }, [highPriorityActions, filteredActions]);

  const getActionsByCategory = useCallback((cat: ActionCategory): RecommendedAction[] => {
    return filteredActions.filter(a => a.category === cat);
  }, [filteredActions]);

  const getActionsByType = useCallback((type: ActionType): RecommendedAction[] => {
    return filteredActions.filter(a => a.type === type);
  }, [filteredActions]);

  const getActionProgress = useCallback((actionId: string): number => {
    const action = allActions.find(a => a.id === actionId);
    return action?.progress || 0;
  }, [allActions]);

  const completeAction = useCallback(async (actionId: string) => {
    await completeActionMutation.mutateAsync(actionId);
  }, [completeActionMutation]);

  const dismissAction = useCallback(async (actionId: string) => {
    await dismissActionMutation.mutateAsync(actionId);
  }, [dismissActionMutation]);

  const refreshActions = useCallback(() => {
    refetch();
  }, [refetch]);

  const pendingCount = useMemo(() => filteredActions.length, [filteredActions]);
  const highPriorityCount = useMemo(() => highPriorityActions.length, [highPriorityActions]);

  return {
    actions: filteredActions,
    isLoading,
    error,
    highPriorityActions,
    contextualActions,
    nextAction,
    careerGuidance,
    getActionsByCategory,
    getActionsByType,
    getActionProgress,
    completeAction,
    dismissAction,
    refreshActions,
    pendingCount,
    highPriorityCount,
    isUpdating: completeActionMutation.isPending || dismissActionMutation.isPending,
  };
}

export function useNextAction() {
  const { nextAction, completeAction, dismissAction, isLoading, isUpdating } = useRecommendedActions({ limit: 1 });

  return {
    action: nextAction,
    complete: nextAction ? () => completeAction(nextAction.id) : undefined,
    dismiss: nextAction ? () => dismissAction(nextAction.id) : undefined,
    isLoading,
    isUpdating,
  };
}

export function usePersonalizedTips(careerStage?: CareerStage, artistType?: ArtistType) {
  const { data: tips = [], isLoading } = useQuery<PersonalizedTip[]>({
    queryKey: ['/api/personalization/learning-insights'],
    staleTime: 30 * 60 * 1000,
  });

  const filteredTips = useMemo(() => {
    return tips.filter(tip => {
      if (careerStage && !tip.forCareerStage.includes(careerStage)) return false;
      if (artistType && !tip.forArtistType.includes(artistType)) return false;
      return true;
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }, [tips, careerStage, artistType]);

  return {
    tips: filteredTips,
    isLoading,
    topTip: filteredTips[0] || null,
  };
}

export function useCareerProgress() {
  const { careerGuidance, isLoading } = useRecommendedActions();

  return {
    currentStage: careerGuidance?.currentStage || 'emerging',
    nextStage: careerGuidance?.nextStage || 'developing',
    progress: careerGuidance?.progressToNext || 0,
    milestones: careerGuidance?.milestones || [],
    recommendations: careerGuidance?.recommendations || [],
    isLoading,
  };
}

export default useRecommendedActions;
