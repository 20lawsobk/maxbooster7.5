import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useAccessibility } from '@/components/a11y/AccessibilityProvider';
import { apiRequest } from '@/lib/queryClient';
import type { FontSize, ColorBlindMode } from '@/components/a11y/AccessibilityProvider';
import type { ContrastMode } from '@/hooks/useHighContrast';

export interface AccessibilityPreferences {
  reducedMotion: boolean | null;
  contrastMode: ContrastMode | null;
  fontSize: FontSize;
  colorBlindMode: ColorBlindMode;
  focusIndicatorWidth: number;
  screenReaderOptimized: boolean;
  keyboardNavigationEnabled: boolean;
}

const defaultPreferences: AccessibilityPreferences = {
  reducedMotion: null,
  contrastMode: null,
  fontSize: 'medium',
  colorBlindMode: 'none',
  focusIndicatorWidth: 2,
  screenReaderOptimized: false,
  keyboardNavigationEnabled: true,
};

export function useAccessibilityPreferences() {
  const queryClient = useQueryClient();
  const {
    reducedMotion,
    highContrast,
    fontSize,
    setFontSize,
    colorBlindMode,
    setColorBlindMode,
    announce,
    resetAllPreferences,
  } = useAccessibility();

  const { data: serverPreferences, isLoading, error } = useQuery<AccessibilityPreferences>({
    queryKey: ['/api/user/accessibility-preferences'],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<AccessibilityPreferences>) => {
      const response = await apiRequest('PUT', '/api/user/accessibility-preferences', updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/accessibility-preferences'] });
    },
  });

  const syncFromServer = useCallback(() => {
    if (!serverPreferences) return;

    if (serverPreferences.reducedMotion !== null) {
      reducedMotion.setReducedMotion(serverPreferences.reducedMotion);
    }
    if (serverPreferences.contrastMode !== null) {
      highContrast.setContrastMode(serverPreferences.contrastMode);
    }
    if (serverPreferences.fontSize) {
      setFontSize(serverPreferences.fontSize);
    }
    if (serverPreferences.colorBlindMode) {
      setColorBlindMode(serverPreferences.colorBlindMode);
    }
  }, [serverPreferences, reducedMotion, highContrast, setFontSize, setColorBlindMode]);

  const saveToServer = useCallback(async () => {
    const preferences: Partial<AccessibilityPreferences> = {
      reducedMotion: reducedMotion.prefersReducedMotion,
      contrastMode: highContrast.contrastMode,
      fontSize,
      colorBlindMode,
      focusIndicatorWidth: highContrast.getFocusIndicatorWidth(),
    };

    try {
      await updateMutation.mutateAsync(preferences);
      announce('Accessibility preferences saved to your profile');
    } catch (error) {
      console.error('Failed to save accessibility preferences:', error);
    }
  }, [reducedMotion, highContrast, fontSize, colorBlindMode, updateMutation, announce]);

  const updatePreference = useCallback(
    async <K extends keyof AccessibilityPreferences>(
      key: K,
      value: AccessibilityPreferences[K]
    ) => {
      switch (key) {
        case 'reducedMotion':
          reducedMotion.setReducedMotion(value as boolean | null);
          break;
        case 'contrastMode':
          highContrast.setContrastMode(value as ContrastMode | null);
          break;
        case 'fontSize':
          setFontSize(value as FontSize);
          break;
        case 'colorBlindMode':
          setColorBlindMode(value as ColorBlindMode);
          break;
      }

      try {
        await updateMutation.mutateAsync({ [key]: value });
      } catch (error) {
        console.error(`Failed to update ${key}:`, error);
      }
    },
    [reducedMotion, highContrast, setFontSize, setColorBlindMode, updateMutation]
  );

  const resetPreferences = useCallback(async () => {
    resetAllPreferences();
    try {
      await apiRequest('DELETE', '/api/user/accessibility-preferences');
      queryClient.invalidateQueries({ queryKey: ['/api/user/accessibility-preferences'] });
      announce('Accessibility preferences reset to defaults');
    } catch (error) {
      console.error('Failed to reset accessibility preferences:', error);
    }
  }, [resetAllPreferences, queryClient, announce]);

  const currentPreferences: AccessibilityPreferences = {
    reducedMotion: reducedMotion.prefersReducedMotion,
    contrastMode: highContrast.contrastMode,
    fontSize,
    colorBlindMode,
    focusIndicatorWidth: highContrast.getFocusIndicatorWidth(),
    screenReaderOptimized: serverPreferences?.screenReaderOptimized || false,
    keyboardNavigationEnabled: serverPreferences?.keyboardNavigationEnabled ?? true,
  };

  return {
    preferences: currentPreferences,
    serverPreferences,
    isLoading,
    error,
    isSaving: updateMutation.isPending,
    saveToServer,
    syncFromServer,
    updatePreference,
    resetPreferences,
    reducedMotion: {
      enabled: reducedMotion.prefersReducedMotion,
      isSystemPreference: reducedMotion.isSystemPreference,
      setEnabled: (value: boolean | null) => updatePreference('reducedMotion', value),
    },
    highContrast: {
      mode: highContrast.contrastMode,
      isHighContrast: highContrast.isHighContrast,
      isSystemPreference: highContrast.isSystemPreference,
      setMode: (value: ContrastMode | null) => updatePreference('contrastMode', value),
    },
    fontSize: {
      current: fontSize,
      set: (value: FontSize) => updatePreference('fontSize', value),
    },
    colorBlindMode: {
      current: colorBlindMode,
      set: (value: ColorBlindMode) => updatePreference('colorBlindMode', value),
    },
  };
}

export function useAutoSyncAccessibilityPreferences(enabled: boolean = true) {
  const { syncFromServer, serverPreferences, isLoading } = useAccessibilityPreferences();

  useEffect(() => {
    if (enabled && !isLoading && serverPreferences) {
      syncFromServer();
    }
  }, [enabled, isLoading, serverPreferences, syncFromServer]);
}

export default useAccessibilityPreferences;
