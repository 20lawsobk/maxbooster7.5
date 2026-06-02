import { logger } from "../logger";
import {
  ShortcutDefinition,
  ShortcutConfig,
  ShortcutContext,
  ShortcutConflict,
  ShortcutEvent,
  ShortcutListener,
  ShortcutModifier,
  matchesShortcut,
  formatShortcutKeys,
} from "./types";

const STORAGE_KEY = "max-booster-shortcuts";

interface ShortcutManagerOptions {
  persistConfig?: boolean;
  onConflict?: (conflict: ShortcutConflict) => void;
}

class ShortcutManagerImpl {
  private shortcuts: Map<string, ShortcutDefinition> = new Map();
  private customConfigs: Map<string, ShortcutConfig> = new Map();
  private listeners: ShortcutListener[] = [];
  private currentContext: ShortcutContext = "global";
  private enabled: boolean = true;
  private handleKeyDown: (event: KeyboardEvent) => void;
  private options: ShortcutManagerOptions;

  constructor(options: ShortcutManagerOptions = {}) {
    this.options = options;
    this.handleKeyDown = this.onKeyDown.bind(this);

    if (typeof window !== "undefined") {
      this.loadCustomConfigs();
      window.addEventListener("keydown", this.handleKeyDown);
    }
  }

  private loadCustomConfigs(): void {
    if (!this.options.persistConfig) return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const configs: ShortcutConfig[] = JSON.parse(stored);
        configs.forEach((config) => {
          this.customConfigs.set(config.id, config);
        });
      }
    } catch (e) {
      logger.warn("Failed to load shortcut configs:", e);
    }
  }

  private saveCustomConfigs(): void {
    if (!this.options.persistConfig) return;

    try {
      const configs = Array.from(this.customConfigs.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    } catch (e) {
      logger.warn("Failed to save shortcut configs:", e);
    }
  }

  register(shortcut: ShortcutDefinition): void {
    const customConfig = this.customConfigs.get(shortcut.id);
    if (customConfig) {
      shortcut = {
        ...shortcut,
        key: customConfig.key ?? shortcut.key,
        modifiers: customConfig.modifiers ?? shortcut.modifiers,
        enabled: customConfig.enabled ?? shortcut.enabled ?? true,
      };
    }

    const conflicts = this.detectConflicts(shortcut);
    if (conflicts.length > 0 && this.options.onConflict) {
      this.options.onConflict({
        shortcutId: shortcut.id,
        conflictsWith: conflicts,
        key: shortcut.key,
        modifiers: shortcut.modifiers || [],
      });
    }

    this.shortcuts.set(shortcut.id, shortcut);
  }

  unregister(shortcutId: string): void {
    this.shortcuts.delete(shortcutId);
  }

  registerMany(shortcuts: ShortcutDefinition[]): void {
    shortcuts.forEach((s) => this.register(s));
  }

  getShortcut(id: string): ShortcutDefinition | undefined {
    return this.shortcuts.get(id);
  }

  getAllShortcuts(): ShortcutDefinition[] {
    return Array.from(this.shortcuts.values());
  }

  getShortcutsByContext(context: ShortcutContext): ShortcutDefinition[] {
    return this.getAllShortcuts().filter(
      (s) => s.context === context || s.context === "global",
    );
  }

  getShortcutsByCategory(category: string): ShortcutDefinition[] {
    return this.getAllShortcuts().filter((s) => s.category === category);
  }

  setContext(context: ShortcutContext): void {
    this.currentContext = context;
  }

  getContext(): ShortcutContext {
    return this.currentContext;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  customize(shortcutId: string, config: Partial<ShortcutConfig>): void {
    const shortcut = this.shortcuts.get(shortcutId);
    if (!shortcut) return;

    const newConfig: ShortcutConfig = {
      id: shortcutId,
      key: config.key ?? shortcut.key,
      modifiers: config.modifiers ?? shortcut.modifiers,
      enabled: config.enabled ?? shortcut.enabled ?? true,
    };

    this.customConfigs.set(shortcutId, newConfig);
    this.shortcuts.set(shortcutId, {
      ...shortcut,
      ...newConfig,
    });

    this.saveCustomConfigs();
  }

  resetShortcut(shortcutId: string): void {
    this.customConfigs.delete(shortcutId);
    this.saveCustomConfigs();
  }

  resetAllShortcuts(): void {
    this.customConfigs.clear();
    this.saveCustomConfigs();
  }

  private detectConflicts(shortcut: ShortcutDefinition): string[] {
    const conflicts: string[] = [];

    this.shortcuts.forEach((existing, id) => {
      if (id === shortcut.id) return;

      const sameContext =
        existing.context === shortcut.context ||
        existing.context === "global" ||
        shortcut.context === "global";

      if (!sameContext) return;

      if (!existing.key || !shortcut.key) return;
      const sameKey = existing.key.toLowerCase() === shortcut.key.toLowerCase();
      const sameModifiers = this.modifiersEqual(
        existing.modifiers || [],
        shortcut.modifiers || [],
      );

      if (sameKey && sameModifiers) {
        conflicts.push(id);
      }
    });

    return conflicts;
  }

  private modifiersEqual(
    a: ShortcutModifier[],
    b: ShortcutModifier[],
  ): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((mod, i) => mod === sortedB[i]);
  }

  addListener(callback: (event: ShortcutEvent) => void): string {
    const id = Math.random().toString(36).substr(2, 9);
    this.listeners.push({ id, callback });
    return id;
  }

  removeListener(id: string): void {
    this.listeners = this.listeners.filter((l) => l.id !== id);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;

    const target = event.target as HTMLElement;
    const isInput =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable;

    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.enabled === false) continue;
      if (
        shortcut.context !== "global" &&
        shortcut.context !== this.currentContext
      )
        continue;
      if (isInput && !shortcut.allowInInput) continue;

      if (matchesShortcut(event, shortcut)) {
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
          event.stopPropagation();
        }

        const shortcutEvent: ShortcutEvent = {
          shortcutId: shortcut.id,
          key: shortcut.key,
          modifiers: shortcut.modifiers || [],
          timestamp: Date.now(),
          context: this.currentContext,
        };

        if (typeof shortcut.action === "function") {
          shortcut.action();
        }

        this.listeners.forEach((l) => l.callback(shortcutEvent));
        return;
      }
    }
  }

  getFormattedShortcut(id: string): string {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) return "";
    return formatShortcutKeys(shortcut.key, shortcut.modifiers);
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.handleKeyDown);
    }
    this.shortcuts.clear();
    this.customConfigs.clear();
    this.listeners = [];
  }
}

let instance: ShortcutManagerImpl | null = null;

export function getShortcutManager(
  options?: ShortcutManagerOptions,
): ShortcutManagerImpl {
  if (!instance) {
    instance = new ShortcutManagerImpl(options);
  }
  return instance;
}

export function resetShortcutManager(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: "global.command-palette",
    key: "k",
    modifiers: ["cmd"],
    description: "Open command palette",
    category: "global",
    context: "global",
    action: "openCommandPalette",
  },
  {
    id: "global.help",
    key: "/",
    modifiers: ["cmd"],
    description: "Show keyboard shortcuts",
    category: "global",
    context: "global",
    action: "showHelp",
  },
  {
    id: "global.settings",
    key: ",",
    modifiers: ["cmd"],
    description: "Open settings",
    category: "navigation",
    context: "global",
    action: "openSettings",
  },
  {
    id: "global.search",
    key: "/",
    description: "Focus search",
    category: "global",
    context: "global",
    action: "focusSearch",
  },
  {
    id: "global.escape",
    key: "Escape",
    description: "Close modal/dialog",
    category: "global",
    context: "global",
    action: "closeModal",
    allowInInput: true,
  },
  {
    id: "studio.play-pause",
    key: " ",
    description: "Play/Pause",
    category: "transport",
    context: "studio",
    action: "togglePlayPause",
  },
  {
    id: "studio.record",
    key: "r",
    description: "Toggle recording",
    category: "transport",
    context: "studio",
    action: "toggleRecord",
  },
  {
    id: "studio.mute",
    key: "m",
    description: "Mute selected track",
    category: "track",
    context: "studio",
    action: "toggleMute",
  },
  {
    id: "studio.solo",
    key: "s",
    description: "Solo selected track",
    category: "track",
    context: "studio",
    action: "toggleSolo",
  },
  {
    id: "studio.save",
    key: "s",
    modifiers: ["cmd"],
    description: "Save project",
    category: "file",
    context: "studio",
    action: "saveProject",
  },
  {
    id: "studio.undo",
    key: "z",
    modifiers: ["cmd"],
    description: "Undo",
    category: "editing",
    context: "studio",
    action: "undo",
  },
  {
    id: "studio.redo",
    key: "z",
    modifiers: ["cmd", "shift"],
    description: "Redo",
    category: "editing",
    context: "studio",
    action: "redo",
  },
  {
    id: "studio.loop",
    key: "l",
    description: "Toggle loop",
    category: "transport",
    context: "studio",
    action: "toggleLoop",
  },
  {
    id: "studio.metronome",
    key: "k",
    description: "Toggle metronome",
    category: "transport",
    context: "studio",
    action: "toggleMetronome",
  },
  {
    id: "dashboard.new-project",
    key: "n",
    description: "Create new project",
    category: "actions",
    context: "dashboard",
    action: "newProject",
  },
  {
    id: "dashboard.upload",
    key: "u",
    description: "Upload file",
    category: "actions",
    context: "dashboard",
    action: "uploadFile",
  },
  {
    id: "dashboard.distribution",
    key: "d",
    description: "Go to distribution",
    category: "navigation",
    context: "dashboard",
    action: "goToDistribution",
  },
  {
    id: "social.new-post",
    key: "p",
    description: "Create new post",
    category: "actions",
    context: "social",
    action: "newPost",
  },
  {
    id: "social.schedule",
    key: "s",
    description: "Open scheduler",
    category: "actions",
    context: "social",
    action: "openScheduler",
  },
  {
    id: "social.analytics",
    key: "a",
    description: "View analytics",
    category: "navigation",
    context: "social",
    action: "viewAnalytics",
  },
  {
    id: "social.preview",
    key: "p",
    description: "Preview post",
    category: "actions",
    context: "social",
    action: "previewPost",
  },
  {
    id: "distribution.new-release",
    key: "n",
    description: "New release",
    category: "actions",
    context: "distribution",
    action: "newRelease",
  },
  {
    id: "distribution.submit",
    key: "Enter",
    description: "Submit release",
    category: "actions",
    context: "distribution",
    action: "submitRelease",
  },
  {
    id: "analytics.refresh",
    key: "r",
    description: "Refresh data",
    category: "actions",
    context: "analytics",
    action: "refreshData",
  },
  {
    id: "analytics.export",
    key: "e",
    description: "Export report",
    category: "actions",
    context: "analytics",
    action: "exportReport",
  },
];

export type { ShortcutManagerImpl as ShortcutManager };
