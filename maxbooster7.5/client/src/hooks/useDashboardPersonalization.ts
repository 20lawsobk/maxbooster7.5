import { useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface WidgetUsageData {
  widgetId: string;
  viewCount: number;
  totalDuration: number;
  lastViewed: Date;
  interactionCount: number;
}

export interface DashboardWidget {
  id: string;
  position: number;
  visible: boolean;
  size: 'small' | 'medium' | 'large';
  priority: number;
  usageCount: number;
  lastUsed?: Date;
}

export interface PersonalizedLayout {
  widgets: DashboardWidget[];
  quickActions: string[];
  hiddenFeatures: string[];
  theme: 'compact' | 'standard' | 'expanded';
  autoArrangeEnabled: boolean;
  lastAutoArranged?: Date;
}

export interface DashboardPreferences {
  artistType: string;
  careerStage: string;
  primaryGenres: string[];
  goals: string[];
  layout: PersonalizedLayout;
}

export function useDashboardPersonalization() {
  const queryClient = useQueryClient();
  const widgetViewTimers = useRef<Record<string, number>>({});

  const { data: layout, isLoading, error } = useQuery<PersonalizedLayout>({
    queryKey: ['/api/personalization/dashboard-layout'],
    staleTime: 10 * 60 * 1000,
  });

  const { data: usagePatterns } = useQuery<Record<string, WidgetUsageData>>({
    queryKey: ['/api/personalization/behavior-analysis'],
    staleTime: 15 * 60 * 1000,
  });

  const updateLayoutMutation = useMutation({
    mutationFn: async (updates: Partial<PersonalizedLayout>) => {
      const response = await apiRequest('PUT', '/api/personalization/dashboard-layout', updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/personalization/dashboard-layout'] });
    },
  });

  const trackWidgetMutation = useMutation({
    mutationFn: async ({ widgetId, duration }: { widgetId: string; duration: number }) => {
      const response = await apiRequest('POST', '/api/personalization/track-widget-view', {
        widgetId,
        duration,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/personalization/behavior-analysis'] });
    },
  });

  const visibleWidgets = useMemo(() => {
    return (layout?.widgets || [])
      .filter(w => w.visible)
      .sort((a, b) => b.priority - a.priority || a.position - b.position);
  }, [layout]);

  const hiddenWidgets = useMemo(() => {
    return (layout?.widgets || []).filter(w => !w.visible);
  }, [layout]);

  const mostUsedWidgets = useMemo(() => {
    if (!usagePatterns) return [];
    return Object.entries(usagePatterns as Record<string, WidgetUsageData>)
      .sort(([, a], [, b]) => b.viewCount - a.viewCount)
      .slice(0, 5)
      .map(([id]) => id);
  }, [usagePatterns]);

  const startWidgetView = useCallback((widgetId: string) => {
    widgetViewTimers.current[widgetId] = Date.now();
  }, []);

  const endWidgetView = useCallback((widgetId: string) => {
    const startTime = widgetViewTimers.current[widgetId];
    if (startTime) {
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        trackWidgetMutation.mutate({ widgetId, duration });
      }
      delete widgetViewTimers.current[widgetId];
    }
  }, [trackWidgetMutation]);

  const updateWidgetPosition = useCallback((widgetId: string, newPosition: number) => {
    if (!layout) return;

    const widgets = layout.widgets.map((w, index) => ({
      ...w,
      position: w.id === widgetId ? newPosition : w.position >= newPosition ? w.position + 1 : w.position,
    })).sort((a, b) => a.position - b.position);

    updateLayoutMutation.mutate({ widgets });
  }, [layout, updateLayoutMutation]);

  const updateWidgetSize = useCallback((widgetId: string, size: 'small' | 'medium' | 'large') => {
    if (!layout) return;

    const widgets = layout.widgets.map(w =>
      w.id === widgetId ? { ...w, size } : w
    );

    updateLayoutMutation.mutate({ widgets });
  }, [layout, updateLayoutMutation]);

  const toggleWidgetVisibility = useCallback((widgetId: string) => {
    if (!layout) return;

    const widgets = layout.widgets.map(w =>
      w.id === widgetId ? { ...w, visible: !w.visible } : w
    );

    updateLayoutMutation.mutate({ widgets });
  }, [layout, updateLayoutMutation]);

  const autoArrangeByUsage = useCallback(async () => {
    if (!layout || !usagePatterns) return;

    const usageMap = usagePatterns as Record<string, WidgetUsageData>;
    const widgets = [...layout.widgets].sort((a, b) => {
      const aUsage = usageMap[a.id]?.viewCount || 0;
      const bUsage = usageMap[b.id]?.viewCount || 0;
      return bUsage - aUsage;
    }).map((w, index) => ({
      ...w,
      position: index,
      priority: Math.max(0, 10 - index),
    }));

    await updateLayoutMutation.mutateAsync({
      widgets,
      autoArrangeEnabled: true,
      lastAutoArranged: new Date(),
    });
  }, [layout, usagePatterns, updateLayoutMutation]);

  const setTheme = useCallback((theme: 'compact' | 'standard' | 'expanded') => {
    updateLayoutMutation.mutate({ theme });
  }, [updateLayoutMutation]);

  const resetLayout = useCallback(async () => {
    const response = await apiRequest('POST', '/api/personalization/reset-defaults');
    await response.json();
    queryClient.invalidateQueries({ queryKey: ['/api/personalization/dashboard-layout'] });
  }, [queryClient]);

  const saveWidgetPositions = useCallback((positions: Record<string, { x: number; y: number; width: number; height: number }>) => {
    if (!layout) return;

    const widgets = layout.widgets.map(w => ({
      ...w,
      position: positions[w.id] ? Object.values(positions).findIndex(p => p === positions[w.id]) : w.position,
    }));

    updateLayoutMutation.mutate({ widgets });
  }, [layout, updateLayoutMutation]);

  useEffect(() => {
    return () => {
      Object.keys(widgetViewTimers.current).forEach(widgetId => {
        endWidgetView(widgetId);
      });
    };
  }, [endWidgetView]);

  return {
    layout,
    isLoading,
    error,
    visibleWidgets,
    hiddenWidgets,
    mostUsedWidgets,
    usagePatterns,
    startWidgetView,
    endWidgetView,
    updateWidgetPosition,
    updateWidgetSize,
    toggleWidgetVisibility,
    autoArrangeByUsage,
    setTheme,
    resetLayout,
    saveWidgetPositions,
    isUpdating: updateLayoutMutation.isPending,
  };
}

export function useWidgetTracking(widgetId: string) {
  const { startWidgetView, endWidgetView } = useDashboardPersonalization();

  useEffect(() => {
    startWidgetView(widgetId);
    return () => endWidgetView(widgetId);
  }, [widgetId, startWidgetView, endWidgetView]);
}

export default useDashboardPersonalization;
