export type ActionCategory =
  | "CRUD"
  | "navigation"
  | "settings"
  | "file"
  | "track"
  | "release"
  | "social"
  | "collaboration"
  | "other";

export type ActionType =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "move"
  | "copy"
  | "rename"
  | "batch"
  | "settings_change"
  | "file_upload"
  | "file_delete"
  | "track_edit"
  | "track_remove"
  | "release_edit"
  | "post_create"
  | "post_delete"
  | "post_schedule"
  | "collaboration_invite"
  | "collaboration_remove"
  | "custom";

export interface ActionMetadata {
  timestamp: number;
  userId?: string;
  module: string;
  description: string;
  category: ActionCategory;
  isDestructive?: boolean;
  requiresConfirmation?: boolean;
  entityId?: string;
  entityType?: string;
  previousState?: unknown;
  newState?: unknown;
  customData?: Record<string, unknown>;
}

export interface UndoableAction<T = unknown> {
  id: string;
  type: ActionType;
  metadata: ActionMetadata;
  execute: () => Promise<T>;
  undo: () => Promise<void>;
  redo?: () => Promise<T>;
  canUndo: () => boolean;
  canRedo?: () => boolean;
  groupId?: string;
  isUndone: boolean;
  result?: T;
}

export interface ActionGroup {
  id: string;
  name: string;
  actions: UndoableAction[];
  metadata: Pick<
    ActionMetadata,
    "timestamp" | "userId" | "module" | "description"
  >;
  isUndone: boolean;
}

export interface UndoManagerConfig {
  maxHistorySize: number;
  persistToStorage: boolean;
  storageKey: string;
  onUndo?: (action: UndoableAction | ActionGroup) => void;
  onRedo?: (action: UndoableAction | ActionGroup) => void;
  onActionExecuted?: (action: UndoableAction) => void;
  onHistoryChange?: (
    history: UndoableAction[],
    redoStack: UndoableAction[],
  ) => void;
}

export interface SerializedAction {
  id: string;
  type: ActionType;
  metadata: ActionMetadata;
  groupId?: string;
  isUndone: boolean;
}

export interface UndoState {
  history: UndoableAction[];
  redoStack: UndoableAction[];
  isUndoing: boolean;
  isRedoing: boolean;
  currentGroupId: string | null;
  lastAction: UndoableAction | null;
}

export interface UndoContextValue {
  state: UndoState;
  executeAction: <T>(
    action: Omit<UndoableAction<T>, "id" | "isUndone" | "result">,
  ) => Promise<T>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  clearHistory: () => void;
  getHistory: () => UndoableAction[];
  getRedoStack: () => UndoableAction[];
  startGroup: (name: string) => string;
  endGroup: (groupId: string) => void;
  undoGroup: (groupId: string) => Promise<void>;
  getActionById: (id: string) => UndoableAction | undefined;
  showUndoToast: boolean;
  dismissUndoToast: () => void;
}

export interface UndoApiPayload {
  actionId: string;
  type: ActionType;
  metadata: ActionMetadata;
  previousState?: unknown;
  newState?: unknown;
}

export interface UndoApiResponse {
  success: boolean;
  actionId?: string;
  message?: string;
  restoredState?: unknown;
}

export interface ActionHistoryEntry {
  id: string;
  type: ActionType;
  metadata: ActionMetadata;
  createdAt: string;
  isUndone: boolean;
  canUndo: boolean;
}

export function createActionId(): string {
  return `action_${Date?.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function createGroupId(): string {
  return `group_${Date?.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function isDestructiveAction(type: ActionType): boolean {
  return [
    "delete",
    "file_delete",
    "post_delete",
    "track_remove",
    "collaboration_remove",
  ].includes(type);
}

export function getActionLabel(action: UndoableAction): string {
  const { type, metadata } = action;
  if (metadata?.description) return metadata?.description;

  const typeLabels: Record<ActionType, string> = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    restore: "Restored",
    move: "Moved",
    copy: "Copied",
    rename: "Renamed",
    batch: "Batch operation",
    settings_change: "Changed settings",
    file_upload: "Uploaded file",
    file_delete: "Deleted file",
    track_edit: "Edited track",
    track_remove: "Removed track",
    release_edit: "Edited release",
    post_create: "Created post",
    post_delete: "Deleted post",
    post_schedule: "Scheduled post",
    collaboration_invite: "Invited collaborator",
    collaboration_remove: "Removed collaborator",
    custom: "Action",
  };

  const entityLabel = metadata?.entityType ? ` ${metadata?.entityType}` : "";
  return `${typeLabels[type]}${entityLabel}`;
}
