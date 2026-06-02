import { useEffect, useCallback } from "react";
import { useUndo } from "@/contexts/UndoContext";

export interface UndoKeyboardHandlerProps {
  enabled?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  excludeInputs?: boolean;
  customShortcuts?: {
    undo?: string[];
    redo?: string[];
  };
}

export function UndoKeyboardHandler({
  enabled = true,
  onUndo,
  onRedo,
  excludeInputs = true,
  customShortcuts,
}: UndoKeyboardHandlerProps) {
  const { undo, redo, canUndo, canRedo } = useUndo();

  const isInputElement = useCallback((target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;

    return (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      target.closest("[data-undo-exclude]") !== null
    );
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      if (excludeInputs && isInputElement(e.target)) return;

      const isMetaKey = e.ctrlKey || e.metaKey;

      if (isMetaKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) {
          onUndo?.();
          undo();
        }
        return;
      }

      if (
        (isMetaKey && e.key === "z" && e.shiftKey) ||
        (isMetaKey && e.key === "y")
      ) {
        e.preventDefault();
        if (canRedo) {
          onRedo?.();
          redo();
        }
        return;
      }

      if (customShortcuts?.undo) {
        const isUndoShortcut = customShortcuts.undo.some((shortcut) => {
          const keys = shortcut.toLowerCase().split("+");
          const needsCtrl = keys.includes("ctrl");
          const needsMeta = keys.includes("meta") || keys.includes("cmd");
          const needsShift = keys.includes("shift");
          const needsAlt = keys.includes("alt");
          const keyChar = keys.find(
            (k) => !["ctrl", "meta", "cmd", "shift", "alt"].includes(k),
          );

          return (
            ((needsCtrl && e.ctrlKey) || (needsMeta && e.metaKey)) &&
            needsShift === e.shiftKey &&
            needsAlt === e.altKey &&
            keyChar === e.key.toLowerCase()
          );
        });

        if (isUndoShortcut && canUndo) {
          e.preventDefault();
          onUndo?.();
          undo();
          return;
        }
      }

      if (customShortcuts?.redo) {
        const isRedoShortcut = customShortcuts.redo.some((shortcut) => {
          const keys = shortcut.toLowerCase().split("+");
          const needsCtrl = keys.includes("ctrl");
          const needsMeta = keys.includes("meta") || keys.includes("cmd");
          const needsShift = keys.includes("shift");
          const needsAlt = keys.includes("alt");
          const keyChar = keys.find(
            (k) => !["ctrl", "meta", "cmd", "shift", "alt"].includes(k),
          );

          return (
            ((needsCtrl && e.ctrlKey) || (needsMeta && e.metaKey)) &&
            needsShift === e.shiftKey &&
            needsAlt === e.altKey &&
            keyChar === e.key.toLowerCase()
          );
        });

        if (isRedoShortcut && canRedo) {
          e.preventDefault();
          onRedo?.();
          redo();
          return;
        }
      }
    },
    [
      enabled,
      excludeInputs,
      isInputElement,
      undo,
      redo,
      canUndo,
      canRedo,
      onUndo,
      onRedo,
      customShortcuts,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return null;
}

export function useUndoKeyboardShortcuts(
  options: Omit<UndoKeyboardHandlerProps, "children"> = {},
) {
  const { undo, redo, canUndo, canRedo } = useUndo();
  const {
    enabled = true,
    onUndo,
    onRedo,
    excludeInputs = true,
    customShortcuts,
  } = options;

  const isInputElement = useCallback((target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;

    return (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      target.closest("[data-undo-exclude]") !== null
    );
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!enabled) return;
      if (excludeInputs && isInputElement(e.target)) return;

      const isMetaKey = e.ctrlKey || e.metaKey;

      if (isMetaKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) {
          onUndo?.();
          undo();
        }
        return;
      }

      if (
        (isMetaKey && e.key === "z" && e.shiftKey) ||
        (isMetaKey && e.key === "y")
      ) {
        e.preventDefault();
        if (canRedo) {
          onRedo?.();
          redo();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enabled,
    excludeInputs,
    isInputElement,
    undo,
    redo,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
  ]);

  return { undo, redo, canUndo, canRedo };
}

export default UndoKeyboardHandler;
