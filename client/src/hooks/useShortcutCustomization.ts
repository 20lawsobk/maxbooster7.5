import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfTokenFromCookie } from '@/lib/queryClient';
import { useShortcuts } from '@/contexts/ShortcutContext';
import { ShortcutConfig, ShortcutModifier, ShortcutConflict } from '@/lib/shortcuts/types';

export interface CustomShortcut {
  id: string;
  key: string;
  modifiers: ShortcutModifier[];
  enabled: boolean;
}

export interface ShortcutPreferences {
  shortcuts: CustomShortcut[];
  updatedAt: string;
}

async function fetchUserShortcuts(): Promise<ShortcutPreferences | null> {
  const response = await fetch('/api/shortcuts/user', { credentials: 'include' });
  if (!response.ok) {
    if (response.status === 401) return null;
    throw new Error('Failed to fetch shortcuts');
  }
  return response.json();
}

async function saveUserShortcuts(shortcuts: CustomShortcut[]): Promise<ShortcutPreferences> {
  const csrfToken = getCsrfTokenFromCookie();
  const response = await fetch('/api/shortcuts/user', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
    credentials: 'include',
    body: JSON.stringify({ shortcuts }),
  });
  if (!response.ok) throw new Error('Failed to save shortcuts');
  return response.json();
}

async function fetchDefaultShortcuts(): Promise<CustomShortcut[]> {
  const response = await fetch('/api/shortcuts/defaults', { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch defaults');
  const data = await response.json();
  return data.shortcuts;
}

export function useShortcutCustomization() {
  const queryClient = useQueryClient();
  const { shortcutManager } = useShortcuts();
  const [pendingChanges, setPendingChanges] = useState<Map<string, Partial<ShortcutConfig>>>(new Map());
  const [conflicts, setConflicts] = useState<ShortcutConflict[]>([]);

  const { data: userShortcuts, isLoading: isLoadingUser, error: userError } = useQuery({
    queryKey: ['/api/shortcuts/user'],
    queryFn: fetchUserShortcuts,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: defaultShortcuts, isLoading: isLoadingDefaults } = useQuery({
    queryKey: ['/api/shortcuts/defaults'],
    queryFn: fetchDefaultShortcuts,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: saveUserShortcuts,
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/shortcuts/user'], data);
      setPendingChanges(new Map());
    },
  });

  useEffect(() => {
    if (userShortcuts?.shortcuts && shortcutManager) {
      userShortcuts.shortcuts.forEach((config) => {
        shortcutManager.customize(config.id, {
          key: config.key,
          modifiers: config.modifiers,
          enabled: config.enabled,
        });
      });
    }
  }, [userShortcuts, shortcutManager]);

  const customizeShortcut = useCallback(
    (id: string, config: Partial<ShortcutConfig>) => {
      if (!shortcutManager) return;

      const existing = shortcutManager.getShortcut(id);
      if (!existing) return;

      const newKey = config.key || existing.key;
      const newModifiers = config.modifiers || existing.modifiers || [];

      const allShortcuts = shortcutManager.getAllShortcuts();
      const conflicting = allShortcuts.filter((s) => {
        if (s.id === id) return false;
        const sameKey = s.key.toLowerCase() === newKey.toLowerCase();
        const sameMods =
          (s.modifiers || []).length === newModifiers.length &&
          (s.modifiers || []).every((m) => newModifiers.includes(m));
        const sameContext = s.context === existing.context || s.context === 'global' || existing.context === 'global';
        return sameKey && sameMods && sameContext;
      });

      if (conflicting.length > 0) {
        setConflicts([
          {
            shortcutId: id,
            conflictsWith: conflicting.map((c) => c.id),
            key: newKey,
            modifiers: newModifiers,
          },
        ]);
        return false;
      }

      setConflicts([]);
      shortcutManager.customize(id, config);
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(id, { ...prev.get(id), ...config });
        return next;
      });

      return true;
    },
    [shortcutManager]
  );

  const resetShortcut = useCallback(
    (id: string) => {
      if (!shortcutManager) return;

      const defaultConfig = defaultShortcuts?.find((s) => s.id === id);
      if (defaultConfig) {
        shortcutManager.customize(id, {
          key: defaultConfig.key,
          modifiers: defaultConfig.modifiers,
          enabled: defaultConfig.enabled,
        });
      } else {
        shortcutManager.resetShortcut(id);
      }

      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setConflicts([]);
    },
    [shortcutManager, defaultShortcuts]
  );

  const resetAllShortcuts = useCallback(() => {
    if (!shortcutManager) return;
    shortcutManager.resetAllShortcuts();
    setPendingChanges(new Map());
    setConflicts([]);
    queryClient.setQueryData(['/api/shortcuts/user'], null);
  }, [shortcutManager, queryClient]);

  const saveChanges = useCallback(async () => {
    if (!shortcutManager || pendingChanges.size === 0) return;

    const allShortcuts = shortcutManager.getAllShortcuts();
    const customized: CustomShortcut[] = allShortcuts
      .filter((s) => pendingChanges.has(s.id) || userShortcuts?.shortcuts.some((us) => us.id === s.id))
      .map((s) => ({
        id: s.id,
        key: s.key,
        modifiers: s.modifiers || [],
        enabled: s.enabled !== false,
      }));

    await saveMutation.mutateAsync(customized);
  }, [shortcutManager, pendingChanges, userShortcuts, saveMutation]);

  const discardChanges = useCallback(() => {
    if (!shortcutManager || !userShortcuts?.shortcuts) return;

    userShortcuts.shortcuts.forEach((config) => {
      shortcutManager.customize(config.id, {
        key: config.key,
        modifiers: config.modifiers,
        enabled: config.enabled,
      });
    });

    setPendingChanges(new Map());
    setConflicts([]);
  }, [shortcutManager, userShortcuts]);

  const hasUnsavedChanges = pendingChanges.size > 0;
  const isLoading = isLoadingUser || isLoadingDefaults;
  const isSaving = saveMutation.isPending;

  return {
    userShortcuts: userShortcuts?.shortcuts || [],
    defaultShortcuts: defaultShortcuts || [],
    customizeShortcut,
    resetShortcut,
    resetAllShortcuts,
    saveChanges,
    discardChanges,
    hasUnsavedChanges,
    conflicts,
    isLoading,
    isSaving,
    error: userError,
  };
}

export default useShortcutCustomization;
