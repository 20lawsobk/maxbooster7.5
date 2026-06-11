import { logger } from "../logger";
import { ShortcutModifier, formatShortcutKeys } from "../shortcuts/types";

export interface Command {
  id: string;
  name: string;
  description?: string;
  keywords?: string[];
  category: string;
  icon?: string;
  shortcut?: {
    key: string;
    modifiers?: ShortcutModifier[];
  };
  action: () => void | Promise<void>;
  enabled?: boolean | (() => boolean);
  context?: string[];
}

export interface CommandGroup {
  id: string;
  name: string;
  commands: Command[];
}

export interface CommandHistoryEntry {
  commandId: string;
  timestamp: number;
}

const HISTORY_STORAGE_KEY = "max-booster-command-history";
const MAX_HISTORY_SIZE = 20;

class CommandRegistryImpl {
  private commands: Map<string, Command> = new Map();
  private history: CommandHistoryEntry[] = [];
  private currentContext: string = "global";

  constructor() {
    if (typeof window !== "undefined") {
      this?.loadHistory();
    }
  }

  private loadHistory(): void {
    try {
      const stored = localStorage?.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        this.history = JSON?.parse(stored);
      }
    } catch (e) {
      logger?.warn("Failed to load command history:", e);
    }
  }

  private saveHistory(): void {
    try {
      localStorage?.setItem(HISTORY_STORAGE_KEY, JSON?.stringify(this?.history));
    } catch (e) {
      logger?.warn("Failed to save command history:", e);
    }
  }

  register(command: Command): void {
    this?.commands.set(command?.id, command);
  }

  unregister(commandId: string): void {
    this?.commands.delete(commandId);
  }

  registerMany(commands: Command[]): void {
    commands?.forEach((c) => this?.register(c));
  }

  getCommand(id: string): Command | undefined {
    return this?.commands.get(id);
  }

  getAllCommands(): Command[] {
    return Array?.from(this?.commands.values());
  }

  getEnabledCommands(): Command[] {
    return this?.getAllCommands().filter((cmd) => {
      if (cmd?.enabled === undefined) return true;
      if (typeof cmd?.enabled === "function") return cmd?.enabled();
      return cmd?.enabled;
    });
  }

  getCommandsByCategory(category: string): Command[] {
    return this?.getEnabledCommands().filter((c) => c?.category === category);
  }

  getCommandsForContext(context: string): Command[] {
    return this?.getEnabledCommands().filter((cmd) => {
      if (!cmd?.context) return true;
      return cmd?.context.includes(context) || cmd?.context.includes("global");
    });
  }

  setContext(context: string): void {
    this.currentContext = context;
  }

  getContext(): string {
    return this?.currentContext;
  }

  getContextualCommands(): Command[] {
    return this?.getCommandsForContext(this?.currentContext);
  }

  async execute(commandId: string): Promise<void> {
    const command = this?.commands.get(commandId);
    if (!command) {
      logger?.warn(`Command not found: ${commandId}`);
      return;
    }

    const enabled =
      command?.enabled === undefined
        ? true
        : typeof command?.enabled === "function"
          ? command?.enabled()
          : command?.enabled;

    if (!enabled) {
      logger?.warn(`Command is disabled: ${commandId}`);
      return;
    }

    this?.addToHistory(commandId);
    await command?.action();
  }

  private addToHistory(commandId: string): void {
    this.history = this?.history.filter((h) => h?.commandId !== commandId);
    this?.history.unshift({
      commandId,
      timestamp: Date.now(),
    });
    if (this?.history.length > MAX_HISTORY_SIZE) {
      this.history = this?.history.slice(0, MAX_HISTORY_SIZE);
    }
    this?.saveHistory();
  }

  getHistory(): CommandHistoryEntry[] {
    return [...this?.history];
  }

  getRecentCommands(limit: number = 5): Command[] {
    return this?.history
      .slice(0, limit)
      .map((h) => this?.commands.get(h?.commandId))
      .filter((c): c is Command => c !== undefined);
  }

  clearHistory(): void {
    this.history = [];
    this?.saveHistory();
  }

  search(query: string): Command[] {
    if (!query?.trim()) {
      return this?.getContextualCommands();
    }

    const lowerQuery = query?.toLowerCase();
    const terms = lowerQuery?.split(/\s+/);

    const commands = this?.getContextualCommands();
    const scored = commands?.map((cmd) => {
      let score = 0;
      const name = cmd?.name.toLowerCase();
      const description = (cmd?.description || "").toLowerCase();
      const keywords = (cmd?.keywords || []).map((k) => k?.toLowerCase());

      if (name === lowerQuery) score += 100;
      if (name.startsWith(lowerQuery)) score += 50;
      if (name.includes(lowerQuery)) score += 25;

      terms?.forEach((term) => {
        if (name.includes(term)) score += 10;
        if (description.includes(term)) score += 5;
        if (keywords?.some((k) => k.includes(term))) score += 8;
      });

      if (this?.fuzzyMatch(name, lowerQuery)) {
        score += 15;
      }

      return { command: cmd, score };
    });

    return scored
      .filter((s) => s?.score > 0)
      .sort((a, b) => b?.score - a?.score)
      .map((s) => s?.command);
  }

  private fuzzyMatch(str: string, pattern: string): boolean {
    let patternIdx = 0;
    let strIdx = 0;

    while (patternIdx < pattern?.length && strIdx < str?.length) {
      if (pattern[patternIdx] === str[strIdx]) {
        patternIdx++;
      }
      strIdx++;
    }

    return patternIdx === pattern?.length;
  }

  getGroups(): CommandGroup[] {
    const commands = this?.getContextualCommands();
    const groups = new Map<string, Command[]>();

    commands?.forEach((cmd) => {
      const existing = groups?.get(cmd?.category) || [];
      existing?.push(cmd);
      groups?.set(cmd?.category, existing);
    });

    return Array?.from(groups?.entries()).map(([category, cmds]) => ({
      id: category,
      name: this.formatCategoryName(category),
      commands: cmds,
    }));
  }

  private formatCategoryName(category: string): string {
    return category
      .split(/[-_]/)
      .map((word) => word?.charAt(0).toUpperCase() + word?.slice(1))
      .join(" ");
  }

  getFormattedShortcut(commandId: string): string {
    const command = this?.commands.get(commandId);
    if (!command?.shortcut) return "";
    return formatShortcutKeys(command?.shortcut.key, command?.shortcut.modifiers);
  }

  clear(): void {
    this?.commands.clear();
  }
}

let instance: CommandRegistryImpl | null = null;

export function getCommandRegistry(): CommandRegistryImpl {
  if (!instance) {
    instance = new CommandRegistryImpl();
  }
  return instance;
}

export function resetCommandRegistry(): void {
  if (instance) {
    instance?.clear();
    instance = null;
  }
}

export const DEFAULT_COMMANDS: Command[] = [
  {
    id: "go-to-dashboard",
    name: "Go to Dashboard",
    description: "Navigate to the main dashboard",
    category: "navigation",
    keywords: ["home", "main", "overview"],
    action: () => {
      window.location.href = "/dashboard";
    },
    context: ["global"],
  },
  {
    id: "go-to-studio",
    name: "Go to Studio",
    description: "Open the music studio",
    category: "navigation",
    keywords: ["daw", "music", "create", "edit"],
    action: () => {
      window.location.href = "/studio";
    },
    context: ["global"],
  },
  {
    id: "go-to-projects",
    name: "Go to Projects",
    description: "View all projects",
    category: "navigation",
    keywords: ["songs", "tracks", "library"],
    action: () => {
      window.location.href = "/projects";
    },
    context: ["global"],
  },
  {
    id: "go-to-analytics",
    name: "Go to Analytics",
    description: "View streaming analytics",
    category: "navigation",
    keywords: ["stats", "metrics", "performance"],
    action: () => {
      window.location.href = "/analytics";
    },
    context: ["global"],
  },
  {
    id: "go-to-distribution",
    name: "Go to Distribution",
    description: "Manage music distribution",
    category: "navigation",
    keywords: ["release", "publish", "spotify", "apple"],
    action: () => {
      window.location.href = "/distribution";
    },
    context: ["global"],
  },
  {
    id: "go-to-social",
    name: "Go to Social Media",
    description: "Manage social media",
    category: "navigation",
    keywords: ["post", "twitter", "instagram", "schedule"],
    action: () => {
      window.location.href = "/social-media";
    },
    context: ["global"],
  },
  {
    id: "go-to-marketplace",
    name: "Go to Marketplace",
    description: "Browse beats and samples",
    category: "navigation",
    keywords: ["beats", "samples", "buy", "sell"],
    action: () => {
      window.location.href = "/marketplace";
    },
    context: ["global"],
  },
  {
    id: "go-to-royalties",
    name: "Go to Royalties",
    description: "View royalty earnings",
    category: "navigation",
    keywords: ["earnings", "money", "payments"],
    action: () => {
      window.location.href = "/royalties";
    },
    context: ["global"],
  },
  {
    id: "go-to-settings",
    name: "Go to Settings",
    description: "Open settings",
    category: "navigation",
    keywords: ["preferences", "account", "config"],
    shortcut: { key: ",", modifiers: ["cmd"] },
    action: () => {
      window.location.href = "/settings";
    },
    context: ["global"],
  },
  {
    id: "new-project",
    name: "New Project",
    description: "Create a new music project",
    category: "actions",
    keywords: ["create", "start", "song"],
    action: () => {
      window.location.href = "/studio";
    },
    context: ["global", "dashboard"],
  },
  {
    id: "upload-file",
    name: "Upload File",
    description: "Upload audio or other files",
    category: "actions",
    keywords: ["import", "add", "audio"],
    action: () => {
      const event = new CustomEvent("open-upload-dialog");
      window?.dispatchEvent(event);
    },
    context: ["global", "dashboard", "studio"],
  },
  {
    id: "show-shortcuts",
    name: "Keyboard Shortcuts",
    description: "Show all keyboard shortcuts",
    category: "help",
    keywords: ["keys", "hotkeys", "bindings"],
    shortcut: { key: "/", modifiers: ["cmd"] },
    action: () => {
      const event = new CustomEvent("open-shortcuts-guide");
      window?.dispatchEvent(event);
    },
    context: ["global"],
  },
  {
    id: "toggle-theme",
    name: "Toggle Theme",
    description: "Switch between light and dark mode",
    category: "view",
    keywords: ["dark", "light", "mode"],
    action: () => {
      const event = new CustomEvent("toggle-theme");
      window?.dispatchEvent(event);
    },
    context: ["global"],
  },
];

export type { CommandRegistryImpl as CommandRegistry };
