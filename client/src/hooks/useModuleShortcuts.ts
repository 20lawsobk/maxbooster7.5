import { useEffect, useCallback, useMemo } from 'react';
import { useShortcuts, useShortcutContext } from '@/contexts/ShortcutContext';
import { ShortcutDefinition, ShortcutContext, ShortcutModifier } from '@/lib/shortcuts/types';

export interface ModuleShortcut {
  id: string;
  key: string;
  modifiers?: ShortcutModifier[];
  description: string;
  category: string;
  handler: () => void;
  enabled?: boolean;
}

export interface UseModuleShortcutsOptions {
  module: ShortcutContext;
  shortcuts: ModuleShortcut[];
  enabled?: boolean;
}

export function useModuleShortcuts({
  module,
  shortcuts,
  enabled = true,
}: UseModuleShortcutsOptions) {
  const { registerShortcut, unregisterShortcut, getShortcutsByContext } = useShortcuts();

  useShortcutContext(module);

  useEffect(() => {
    if (!enabled) return;

    const registeredIds: string[] = [];

    shortcuts.forEach((shortcut) => {
      if (shortcut.enabled === false) return;

      const fullShortcut: ShortcutDefinition = {
        id: `${module}.${shortcut.id}`,
        key: shortcut.key,
        modifiers: shortcut.modifiers,
        description: shortcut.description,
        category: shortcut.category as any,
        context: module,
        action: shortcut.handler,
      };

      registerShortcut(fullShortcut);
      registeredIds.push(fullShortcut.id);
    });

    return () => {
      registeredIds.forEach((id) => unregisterShortcut(id));
    };
  }, [module, shortcuts, enabled, registerShortcut, unregisterShortcut]);

  const moduleShortcuts = useMemo(() => {
    return getShortcutsByContext(module);
  }, [module, getShortcutsByContext]);

  return { shortcuts: moduleShortcuts };
}

export const STUDIO_MODULE_SHORTCUTS: ModuleShortcut[] = [
  { id: 'play-pause', key: ' ', description: 'Play/Stop', category: 'transport', handler: () => {} },
  { id: 'record', key: 'r', description: 'Record', category: 'transport', handler: () => {} },
  { id: 'mute', key: 'm', description: 'Mute Track', category: 'track', handler: () => {} },
  { id: 'solo', key: 's', description: 'Solo Track', category: 'track', handler: () => {} },
  { id: 'save', key: 's', modifiers: ['cmd'], description: 'Save Project', category: 'file', handler: () => {} },
  { id: 'undo', key: 'z', modifiers: ['cmd'], description: 'Undo', category: 'editing', handler: () => {} },
  { id: 'redo', key: 'z', modifiers: ['cmd', 'shift'], description: 'Redo', category: 'editing', handler: () => {} },
  { id: 'loop', key: 'l', description: 'Toggle Loop', category: 'transport', handler: () => {} },
  { id: 'metronome', key: 'k', description: 'Toggle Metronome', category: 'transport', handler: () => {} },
  { id: 'split', key: 'b', description: 'Split Clip', category: 'editing', handler: () => {} },
  { id: 'delete', key: 'Delete', description: 'Delete Selected', category: 'editing', handler: () => {} },
  { id: 'zoom-in', key: '=', modifiers: ['cmd'], description: 'Zoom In', category: 'view', handler: () => {} },
  { id: 'zoom-out', key: '-', modifiers: ['cmd'], description: 'Zoom Out', category: 'view', handler: () => {} },
  { id: 'add-track', key: 't', description: 'Add Track', category: 'track', handler: () => {} },
  { id: 'mixer', key: 'x', modifiers: ['shift'], description: 'Toggle Mixer', category: 'view', handler: () => {} },
];

export const ANALYTICS_MODULE_SHORTCUTS: ModuleShortcut[] = [
  { id: 'refresh', key: 'r', description: 'Refresh Data', category: 'actions', handler: () => {} },
  { id: 'export', key: 'e', description: 'Export Report', category: 'actions', handler: () => {} },
  { id: 'date-range', key: 'd', description: 'Change Date Range', category: 'actions', handler: () => {} },
  { id: 'compare', key: 'c', description: 'Compare Periods', category: 'actions', handler: () => {} },
  { id: 'filter', key: 'f', description: 'Open Filters', category: 'view', handler: () => {} },
  { id: 'fullscreen', key: 'f', modifiers: ['cmd'], description: 'Fullscreen Chart', category: 'view', handler: () => {} },
];

export const SOCIAL_MODULE_SHORTCUTS: ModuleShortcut[] = [
  { id: 'schedule', key: 's', description: 'Schedule Post', category: 'actions', handler: () => {} },
  { id: 'preview', key: 'p', description: 'Preview Post', category: 'actions', handler: () => {} },
  { id: 'new-post', key: 'n', description: 'New Post', category: 'actions', handler: () => {} },
  { id: 'calendar', key: 'c', description: 'Open Calendar', category: 'view', handler: () => {} },
  { id: 'drafts', key: 'd', description: 'View Drafts', category: 'view', handler: () => {} },
  { id: 'analytics', key: 'a', description: 'View Analytics', category: 'navigation', handler: () => {} },
  { id: 'inbox', key: 'i', description: 'Open Inbox', category: 'view', handler: () => {} },
];

export const DISTRIBUTION_MODULE_SHORTCUTS: ModuleShortcut[] = [
  { id: 'new-release', key: 'n', description: 'New Release', category: 'actions', handler: () => {} },
  { id: 'submit', key: 'Enter', description: 'Submit Release', category: 'actions', handler: () => {} },
  { id: 'upload', key: 'u', description: 'Upload Track', category: 'actions', handler: () => {} },
  { id: 'metadata', key: 'm', description: 'Edit Metadata', category: 'actions', handler: () => {} },
  { id: 'status', key: 's', description: 'View Status', category: 'view', handler: () => {} },
  { id: 'schedule', key: 's', modifiers: ['cmd'], description: 'Schedule Release', category: 'actions', handler: () => {} },
];

export const MARKETPLACE_MODULE_SHORTCUTS: ModuleShortcut[] = [
  { id: 'search', key: '/', description: 'Search Beats', category: 'navigation', handler: () => {} },
  { id: 'filter', key: 'f', description: 'Open Filters', category: 'view', handler: () => {} },
  { id: 'play', key: ' ', description: 'Play/Pause Preview', category: 'actions', handler: () => {} },
  { id: 'add-cart', key: 'a', description: 'Add to Cart', category: 'actions', handler: () => {} },
  { id: 'favorite', key: 'l', description: 'Toggle Favorite', category: 'actions', handler: () => {} },
];

export function useStudioShortcuts(handlers: Partial<Record<string, () => void>> = {}) {
  const shortcuts = useMemo(() => {
    return STUDIO_MODULE_SHORTCUTS.map((s) => ({
      ...s,
      handler: handlers[s.id] || s.handler,
    }));
  }, [handlers]);

  return useModuleShortcuts({ module: 'studio', shortcuts });
}

export function useAnalyticsShortcuts(handlers: Partial<Record<string, () => void>> = {}) {
  const shortcuts = useMemo(() => {
    return ANALYTICS_MODULE_SHORTCUTS.map((s) => ({
      ...s,
      handler: handlers[s.id] || s.handler,
    }));
  }, [handlers]);

  return useModuleShortcuts({ module: 'analytics', shortcuts });
}

export function useSocialShortcuts(handlers: Partial<Record<string, () => void>> = {}) {
  const shortcuts = useMemo(() => {
    return SOCIAL_MODULE_SHORTCUTS.map((s) => ({
      ...s,
      handler: handlers[s.id] || s.handler,
    }));
  }, [handlers]);

  return useModuleShortcuts({ module: 'social', shortcuts });
}

export function useDistributionShortcuts(handlers: Partial<Record<string, () => void>> = {}) {
  const shortcuts = useMemo(() => {
    return DISTRIBUTION_MODULE_SHORTCUTS.map((s) => ({
      ...s,
      handler: handlers[s.id] || s.handler,
    }));
  }, [handlers]);

  return useModuleShortcuts({ module: 'distribution', shortcuts });
}

export function useMarketplaceShortcuts(handlers: Partial<Record<string, () => void>> = {}) {
  const shortcuts = useMemo(() => {
    return MARKETPLACE_MODULE_SHORTCUTS.map((s) => ({
      ...s,
      handler: handlers[s.id] || s.handler,
    }));
  }, [handlers]);

  return useModuleShortcuts({ module: 'marketplace', shortcuts });
}

export default useModuleShortcuts;
