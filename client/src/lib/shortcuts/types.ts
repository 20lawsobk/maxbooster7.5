export type ShortcutModifier = 'ctrl' | 'cmd' | 'shift' | 'alt' | 'meta';

export type ShortcutCategory = 
  | 'global'
  | 'navigation'
  | 'actions'
  | 'editing'
  | 'transport'
  | 'track'
  | 'view'
  | 'file';

export type ShortcutContext = 
  | 'global'
  | 'studio'
  | 'dashboard'
  | 'social'
  | 'marketplace'
  | 'distribution'
  | 'analytics';

export interface ShortcutDefinition {
  id: string;
  key: string;
  modifiers?: ShortcutModifier[];
  description: string;
  category: ShortcutCategory;
  context: ShortcutContext;
  action: string | (() => void);
  enabled?: boolean;
  allowInInput?: boolean;
  preventDefault?: boolean;
}

export interface ShortcutConfig {
  id: string;
  key: string;
  modifiers?: ShortcutModifier[];
  enabled: boolean;
}

export interface ShortcutConflict {
  shortcutId: string;
  conflictsWith: string[];
  key: string;
  modifiers: ShortcutModifier[];
}

export interface ShortcutEvent {
  shortcutId: string;
  key: string;
  modifiers: ShortcutModifier[];
  timestamp: number;
  context: ShortcutContext;
}

export interface ShortcutListener {
  id: string;
  callback: (event: ShortcutEvent) => void;
}

export interface PlatformModifiers {
  mod: string;
  modKey: 'metaKey' | 'ctrlKey';
  alt: string;
  shift: string;
}

export function getPlatformModifiers(): PlatformModifiers {
  const isMac = typeof navigator !== 'undefined' && 
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  
  return {
    mod: isMac ? '⌘' : 'Ctrl',
    modKey: isMac ? 'metaKey' : 'ctrlKey',
    alt: isMac ? '⌥' : 'Alt',
    shift: '⇧',
  };
}

export function formatShortcutKeys(
  key: string, 
  modifiers?: ShortcutModifier[]
): string {
  const platform = getPlatformModifiers();
  const parts: string[] = [];
  
  if (modifiers?.includes('cmd') || modifiers?.includes('ctrl')) {
    parts.push(platform.mod);
  }
  if (modifiers?.includes('shift')) {
    parts.push(platform.shift);
  }
  if (modifiers?.includes('alt')) {
    parts.push(platform.alt);
  }
  
  const displayKey = key.length === 1 ? key.toUpperCase() : key;
  parts.push(displayKey);
  
  return parts.join('+');
}

export function parseShortcutString(shortcut: string): { 
  key: string; 
  modifiers: ShortcutModifier[] 
} {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const modifiers: ShortcutModifier[] = [];
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i].trim();
    if (part === 'cmd' || part === 'command' || part === '⌘') {
      modifiers.push('cmd');
    } else if (part === 'ctrl' || part === 'control') {
      modifiers.push('ctrl');
    } else if (part === 'shift' || part === '⇧') {
      modifiers.push('shift');
    } else if (part === 'alt' || part === 'option' || part === '⌥') {
      modifiers.push('alt');
    } else if (part === 'meta') {
      modifiers.push('meta');
    }
  }
  
  return { key, modifiers };
}

export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutDefinition
): boolean {
  const platform = getPlatformModifiers();
  const modifiers = shortcut.modifiers || [];
  
  const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase() ||
    event.code.toLowerCase() === `key${shortcut.key}`.toLowerCase();
  
  const cmdCtrlRequired = modifiers.includes('cmd') || modifiers.includes('ctrl');
  const cmdCtrlPressed = event[platform.modKey] || event.ctrlKey;
  const cmdCtrlMatches = cmdCtrlRequired === cmdCtrlPressed;
  
  const shiftRequired = modifiers.includes('shift');
  const shiftMatches = shiftRequired === event.shiftKey;
  
  const altRequired = modifiers.includes('alt');
  const altMatches = altRequired === event.altKey;
  
  return keyMatches && cmdCtrlMatches && shiftMatches && altMatches;
}
