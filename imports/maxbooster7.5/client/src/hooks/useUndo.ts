export {
  useUndo,
  useUndoHistory,
  useUndoActions,
  useLastAction,
} from "@/contexts/UndoContext";

export type { UndoProviderProps } from "@/contexts/UndoContext";

export { UndoProvider } from "@/contexts/UndoContext";

export {
  useUndoableAction,
  useUndoableDelete,
  useUndoableCreate,
  useUndoableMove,
  useUndoableReorder,
  useUndoableUpdate,
  useUndoableSettingsChange,
  createUndoableAction,
} from "@/lib/undo/hooks";

export type { UseUndoableActionOptions, WithUndoProps } from "@/lib/undo/hooks";

export type {
  UndoableAction,
  ActionType,
  ActionCategory,
  ActionMetadata,
  ActionGroup,
  UndoState,
  UndoContextValue,
} from "@/lib/undo/types";

export {
  createActionId,
  createGroupId,
  isDestructiveAction,
  getActionLabel,
} from "@/lib/undo/types";
