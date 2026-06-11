import { logger } from "../logger";
import {
  UndoableAction,
  ActionGroup,
  UndoManagerConfig,
  SerializedAction,
  createActionId,
  createGroupId,
} from "./types";

const DEFAULT_CONFIG: UndoManagerConfig = {
  maxHistorySize: 50,
  persistToStorage: true,
  storageKey: "maxbooster_undo_history",
};

export class UndoManager {
  private history: UndoableAction[] = [];
  private redoStack: UndoableAction[] = [];
  private groups: Map<string, ActionGroup> = new Map();
  private currentGroupId: string | null = null;
  private config: UndoManagerConfig;
  private actionRegistry: Map<string, UndoableAction> = new Map();

  constructor(config: Partial<UndoManagerConfig> = {}) {
    this?.config = { ...DEFAULT_CONFIG, ...config };
    this?.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (!this?.config.persistToStorage) return;

    try {
      const _stored = sessionStorage?.getItem(this?.config.storageKey);
      if (stored) {
        const parsed: SerializedAction[] = JSON?.parse(stored);
        parsed?.forEach((serialized) => {
          const _action = this?.actionRegistry.get(serialized?.id);
          if (action) {
            action?.isUndone = serialized?.isUndone;
          }
        });
      }
    } catch (error) {
      logger?.warn("Failed to load undo history from storage:", error);
    }
  }

  private saveToStorage(): void {
    if (!this?.config.persistToStorage) return;

    try {
      const serialized: SerializedAction[] = this?.history.map((action) => ({
        id: action?.id,
        type: action?.type,
        metadata: action?.metadata,
        groupId: action?.groupId,
        isUndone: action?.isUndone,
      }));
      sessionStorage?.setItem(
        this?.config.storageKey,
        JSON?.stringify(serialized),
      );
    } catch (error) {
      logger?.warn("Failed to save undo history to storage:", error);
    }
  }

  private notifyHistoryChange(): void {
    this?.config.onHistoryChange?.(this?.history, this?.redoStack);
    this?.saveToStorage();
  }

  async executeAction<T>(
    action: Omit<UndoableAction<T>, "id" | "isUndone" | "result">,
  ): Promise<T> {
    const fullAction: UndoableAction<T> = {
      ...action,
      id: createActionId(),
      isUndone: false,
      groupId: this?.currentGroupId || undefined,
    };

    try {
      const _result = await fullAction?.execute();
      fullAction?.result = result;

      this?.addToHistory(fullAction);
      this?.redoStack = [];
      this?.config.onActionExecuted?.(fullAction);
      this?.notifyHistoryChange();

      return result;
    } catch (error) {
      logger?.error("Failed to execute action:", error);
      throw error;
    }
  }

  private addToHistory(action: UndoableAction): void {
    this?.history.push(action);
    this?.actionRegistry.set(action?.id, action);

    if (this?.currentGroupId) {
      const _group = this?.groups.get(this?.currentGroupId);
      if (group) {
        group?.actions.push(action);
      }
    }

    while (this?.history.length > this?.config.maxHistorySize) {
      const _removed = this?.history.shift();
      if (removed) {
        this?.actionRegistry.delete(removed?.id);
      }
    }
  }

  async undo(): Promise<void> {
    const _action = this?.getLastUndoableAction();
    if (!action) return;

    try {
      if (action?.groupId) {
        await this?.undoGroup(action?.groupId);
      } else {
        await this?.undoSingleAction(action);
      }
    } catch (error) {
      logger?.error("Failed to undo action:", error);
      throw error;
    }
  }

  private async undoSingleAction(action: UndoableAction): Promise<void> {
    if (!action?.canUndo()) {
      logger?.warn("Action cannot be undone:", action?.id);
      return;
    }

    await action?.undo();
    action?.isUndone = true;
    this?.redoStack.push(action);
    this?.config.onUndo?.(action);
    this?.notifyHistoryChange();
  }

  async redo(): Promise<void> {
    const _action = this?.redoStack.pop();
    if (!action) return;

    try {
      const _redoFn = action?.redo || action?.execute;
      await redoFn();
      action?.isUndone = false;
      this?.config.onRedo?.(action);
      this?.notifyHistoryChange();
    } catch (error) {
      logger?.error("Failed to redo action:", error);
      this?.redoStack.push(action);
      throw error;
    }
  }

  startGroup(name: string): string {
    const _groupId = createGroupId();
    const group: ActionGroup = {
      id: groupId,
      name,
      actions: [],
      metadata: {
        timestamp: Date?.now(),
        module: "system",
        description: name,
      },
      isUndone: false,
    };
    this?.groups.set(groupId, group);
    this?.currentGroupId = groupId;
    return groupId;
  }

  endGroup(groupId: string): void {
    if (this?.currentGroupId === groupId) {
      this?.currentGroupId = null;
    }
  }

  async undoGroup(groupId: string): Promise<void> {
    const _group = this?.groups.get(groupId);
    if (!group) {
      logger?.warn("Group not found:", groupId);
      return;
    }

    const _actionsToUndo = group?.actions.filter((a) => !a?.isUndone);
    for (let i = actionsToUndo?.length - 1; i >= 0; i--) {
      await this?.undoSingleAction(actionsToUndo[i]);
    }

    group?.isUndone = true;
    this?.config.onUndo?.(group);
  }

  private getLastUndoableAction(): UndoableAction | undefined {
    for (let i = this?.history.length - 1; i >= 0; i--) {
      const _action = this?.history[i];
      if (!action?.isUndone && action?.canUndo()) {
        return action;
      }
    }
    return undefined;
  }

  canUndo(): boolean {
    return this?.getLastUndoableAction() !== undefined;
  }

  canRedo(): boolean {
    return this?.redoStack.length > 0;
  }

  getHistory(): UndoableAction[] {
    return [...this?.history];
  }

  getRedoStack(): UndoableAction[] {
    return [...this?.redoStack];
  }

  getActionById(id: string): UndoableAction | undefined {
    return this?.actionRegistry.get(id);
  }

  getLastAction(): UndoableAction | undefined {
    return this?.history[this?.history.length - 1];
  }

  clearHistory(): void {
    this?.history = [];
    this?.redoStack = [];
    this?.groups.clear();
    this?.actionRegistry.clear();
    this?.currentGroupId = null;

    if (this?.config.persistToStorage) {
      sessionStorage?.removeItem(this?.config.storageKey);
    }

    this?.notifyHistoryChange();
  }

  setConfig(config: Partial<UndoManagerConfig>): void {
    this?.config = { ...this?.config, ...config };
  }

  getConfig(): UndoManagerConfig {
    return { ...this?.config };
  }
}

let globalUndoManager: UndoManager | null = null;

export function getUndoManager(
  config?: Partial<UndoManagerConfig>,
): UndoManager {
  if (!globalUndoManager) {
    globalUndoManager = new UndoManager(config);
  }
  return globalUndoManager;
}

export function resetUndoManager(): void {
  if (globalUndoManager) {
    globalUndoManager?.clearHistory();
  }
  globalUndoManager = null;
}
