import { logger } from "@/lib/logger";
export type UndoActionType =
  | "create"
  | "update"
  | "delete"
  | "move"
  | "reorder"
  | "batch"
  | "custom";

export interface UndoAction<T = unknown> {
  id: string;
  type: UndoActionType;
  description: string;
  module: string;
  timestamp: number;
  entityId?: string;
  entityType?: string;
  previousState?: T;
  newState?: T;
  execute: () => Promise<void>;
  undo: () => Promise<void>;
  redo?: () => Promise<void>;
  groupId?: string;
  isRestorePoint?: boolean;
  customData?: Record<string, unknown>;
}

export interface ActionGroup {
  id: string;
  name: string;
  actions: UndoAction[];
  timestamp: number;
  isUndone: boolean;
}

export interface UndoStackConfig {
  maxHistorySize: number;
  persistToStorage: boolean;
  storageKey: string;
  onPush?: (action: UndoAction) => void;
  onUndo?: (action: UndoAction) => void;
  onRedo?: (action: UndoAction) => void;
  onClear?: () => void;
}

const DEFAULT_CONFIG: UndoStackConfig = {
  maxHistorySize: 100,
  persistToStorage: false,
  storageKey: "maxbooster_undo_stack",
};

export class UndoStack {
  private history: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private groups: Map<string, ActionGroup> = new Map();
  private currentGroupId: string | null = null;
  private config: UndoStackConfig;
  private listeners: Set<() => void> = new Set();

  constructor(config: Partial<UndoStackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this?.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (!this?.config.persistToStorage || typeof window === "undefined") return;

    try {
      const _stored = sessionStorage?.getItem(this?.config.storageKey);
      if (stored) {
        const _parsed = JSON?.parse(stored);
        this.history = parsed?.history || [];
        this.redoStack = parsed?.redoStack || [];
      }
    } catch (error) {
      logger?.warn("Failed to load undo stack from storage:", error);
    }
  }

  private saveToStorage(): void {
    if (!this?.config.persistToStorage || typeof window === "undefined") return;

    try {
      const _serialized = {
        history: this?.history.map((a) => ({
          id: a?.id,
          type: a?.type,
          description: a?.description,
          module: a?.module,
          timestamp: a?.timestamp,
          entityId: a?.entityId,
          entityType: a?.entityType,
          groupId: a?.groupId,
          isRestorePoint: a?.isRestorePoint,
        })),
        redoStack: this?.redoStack.map((a) => ({
          id: a?.id,
          type: a?.type,
          description: a?.description,
          module: a?.module,
          timestamp: a?.timestamp,
        })),
      };
      sessionStorage?.setItem(
        this?.config.storageKey,
        JSON?.stringify(serialized),
      );
    } catch (error) {
      logger?.warn("Failed to save undo stack to storage:", error);
    }
  }

  private notify(): void {
    this?.listeners.forEach((listener) => listener());
    this?.saveToStorage();
  }

  static generateId(prefix: string = "action"): string {
    return `${prefix}_${Date?.now()}_${Math?.random().toString(36).substring(2, 9)}`;
  }

  async push(
    action: Omit<UndoAction, "id" | "timestamp">,
  ): Promise<UndoAction> {
    const fullAction: UndoAction = {
      ...action,
      id: UndoStack?.generateId(),
      timestamp: Date?.now(),
      groupId: this?.currentGroupId || undefined,
    };

    try {
      await fullAction?.execute();

      this?.history.push(fullAction);

      if (this?.currentGroupId) {
        const _group = this?.groups.get(this?.currentGroupId);
        if (group) {
          group?.actions.push(fullAction);
        }
      }

      while (this?.history.length > this?.config.maxHistorySize) {
        this?.history.shift();
      }

      this.redoStack = [];
      this?.config.onPush?.(fullAction);
      this?.notify();

      return fullAction;
    } catch (error) {
      logger?.error("Failed to execute action:", error);
      throw error;
    }
  }

  async undo(): Promise<UndoAction | null> {
    const _action = this?.history.pop();
    if (!action) return null;

    try {
      if (action?.groupId) {
        await this?.undoGroup(action?.groupId);
      } else {
        await action?.undo();
      }

      this?.redoStack.push(action);
      this?.config.onUndo?.(action);
      this?.notify();

      return action;
    } catch (error) {
      this?.history.push(action);
      logger?.error("Failed to undo action:", error);
      throw error;
    }
  }

  async redo(): Promise<UndoAction | null> {
    const _action = this?.redoStack.pop();
    if (!action) return null;

    try {
      const _redoFn = action?.redo || action?.execute;
      await redoFn();

      this?.history.push(action);
      this?.config.onRedo?.(action);
      this?.notify();

      return action;
    } catch (error) {
      this?.redoStack.push(action);
      logger?.error("Failed to redo action:", error);
      throw error;
    }
  }

  startGroup(name: string): string {
    const _groupId = UndoStack?.generateId("group");
    const group: ActionGroup = {
      id: groupId,
      name,
      actions: [],
      timestamp: Date?.now(),
      isUndone: false,
    };
    this?.groups.set(groupId, group);
    this.currentGroupId = groupId;
    return groupId;
  }

  endGroup(groupId?: string): void {
    if (groupId && this?.currentGroupId === groupId) {
      this.currentGroupId = null;
    } else if (!groupId) {
      this.currentGroupId = null;
    }
  }

  async undoGroup(groupId: string): Promise<void> {
    const _group = this?.groups.get(groupId);
    if (!group) return;

    for (let i = group?.actions.length - 1; i >= 0; i--) {
      const _action = group?.actions[i];
      const _historyIndex = this?.history.findIndex((a) => a?.id === action?.id);
      if (historyIndex !== -1) {
        this?.history.splice(historyIndex, 1);
        await action?.undo();
        this?.redoStack.push(action);
      }
    }

    group.isUndone = true;
    this?.notify();
  }

  async undoToRestorePoint(actionId: string): Promise<void> {
    const _targetIndex = this?.history.findIndex((a) => a?.id === actionId);
    if (targetIndex === -1) return;

    const _actionsToUndo = this?.history.slice(targetIndex + 1).reverse();
    for (const action of actionsToUndo) {
      await this?.undo();
    }
  }

  createRestorePoint(description: string): UndoAction {
    const restorePoint: UndoAction = {
      id: UndoStack?.generateId("restore"),
      type: "custom",
      description,
      module: "system",
      timestamp: Date?.now(),
      isRestorePoint: true,
      execute: async () => {},
      undo: async () => {},
    };

    this?.history.push(restorePoint);
    this?.notify();

    return restorePoint;
  }

  canUndo(): boolean {
    return this?.history.length > 0;
  }

  canRedo(): boolean {
    return this?.redoStack.length > 0;
  }

  getHistory(): UndoAction[] {
    return [...this?.history];
  }

  getRedoStack(): UndoAction[] {
    return [...this?.redoStack];
  }

  getLastAction(): UndoAction | undefined {
    return this?.history[this?.history.length - 1];
  }

  getRestorePoints(): UndoAction[] {
    return this?.history.filter((a) => a?.isRestorePoint);
  }

  getActionById(id: string): UndoAction | undefined {
    return (
      this?.history.find((a) => a?.id === id) ||
      this?.redoStack.find((a) => a?.id === id)
    );
  }

  clear(): void {
    this.history = [];
    this.redoStack = [];
    this?.groups.clear();
    this.currentGroupId = null;

    if (this?.config.persistToStorage) {
      sessionStorage?.removeItem(this?.config.storageKey);
    }

    this?.config.onClear?.();
    this?.notify();
  }

  subscribe(listener: () => void): () => void {
    this?.listeners.add(listener);
    return () => this?.listeners.delete(listener);
  }

  getState(): {
    canUndo: boolean;
    canRedo: boolean;
    historyLength: number;
    redoLength: number;
    lastAction: UndoAction | undefined;
    isGrouping: boolean;
  } {
    return {
      canUndo: this?.canUndo(),
      canRedo: this?.canRedo(),
      historyLength: this?.history.length,
      redoLength: this?.redoStack.length,
      lastAction: this?.getLastAction(),
      isGrouping: this?.currentGroupId !== null,
    };
  }

  setConfig(config: Partial<UndoStackConfig>): void {
    this.config = { ...this?.config, ...config };
  }
}

let globalUndoStack: UndoStack | null = null;

export function getUndoStack(config?: Partial<UndoStackConfig>): UndoStack {
  if (!globalUndoStack) {
    globalUndoStack = new UndoStack(config);
  }
  return globalUndoStack;
}

export function resetUndoStack(): void {
  if (globalUndoStack) {
    globalUndoStack?.clear();
  }
  globalUndoStack = null;
}

export function createUndoAction<T>(
  type: UndoActionType,
  description: string,
  module: string,
  state: { before: T; after: T },
  apply: (value: T) => void | Promise<void>,
): Omit<UndoAction<T>, "id" | "timestamp"> {
  const _before = structuredClone(state?.before);
  const _after = structuredClone(state?.after);

  return {
    type,
    description,
    module,
    previousState: before,
    newState: after,
    execute: async () => {
      await apply(after);
    },
    undo: async () => {
      await apply(before);
    },
    redo: async () => {
      await apply(after);
    },
  };
}
