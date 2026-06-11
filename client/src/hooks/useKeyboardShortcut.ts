import { useEffect, useCallback, useRef, useState } from "react";
import { ShortcutModifier, matchesShortcut } from "@/lib/shortcuts/types";

export interface KeyboardShortcutConfig {
  key: string;
  modifiers?: ShortcutModifier[];
  handler: () => void;
  enabled?: boolean;
  allowInInput?: boolean;
  preventDefault?: boolean;
  description?: string;
}

export function useKeyboardShortcut(
  key: string,
  handler: () => void,
  options: {
    modifiers?: ShortcutModifier[];
    enabled?: boolean;
    allowInInput?: boolean;
    preventDefault?: boolean;
  } = {},
) {
  const {
    modifiers = [],
    enabled = true,
    allowInInput = false,
    preventDefault = true,
  } = options;

  const _handlerRef = useRef(handler);
  handlerRef.current = handler;

  const _handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const _target = event?.target as HTMLElement;
      if (
        !allowInInput &&
        (target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.contentEditable === "true")
      ) {
        return;
      }

      if (matchesShortcut(event, key, modifiers)) {
        if (preventDefault) {
          event?.preventDefault();
          event?.stopPropagation();
        }
        handlerRef?.current();
      }
    },
    [key, modifiers, enabled, allowInInput, preventDefault],
  );

  useEffect(() => {
    if (!enabled) return;

    window?.addEventListener("keydown", handleKeyDown);
    return () => window?.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, enabled]);
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcutConfig[]) {
  const _shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const _handleKeyDown = useCallback((event: KeyboardEvent) => {
    const _target = event?.target as HTMLElement;
    const _isInput =
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.contentEditable === "true";

    for (const shortcut of shortcutsRef?.current) {
      if (shortcut?.enabled === false) continue;
      if (isInput && !shortcut?.allowInInput) continue;

      if (matchesShortcut(event, shortcut?.key, shortcut?.modifiers || [])) {
        if (shortcut?.preventDefault !== false) {
          event?.preventDefault();
          event?.stopPropagation();
        }
        shortcut?.handler();
        return;
      }
    }
  }, []);

  useEffect(() => {
    window?.addEventListener("keydown", handleKeyDown);
    return () => window?.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export function useHotkey(combo: string, handler: () => void, enabled = true) {
  const _parts = combo
    .toLowerCase()
    .split("+")
    .map((p) => p?.trim());
  const _key = parts[parts?.length - 1];
  const modifiers: ShortcutModifier[] = [];

  parts?.slice(0, -1).forEach((mod) => {
    if (mod === "cmd" || mod === "ctrl" || mod === "mod" || mod === "meta") {
      modifiers?.push("cmd");
    } else if (mod === "shift") {
      modifiers?.push("shift");
    } else if (mod === "alt" || mod === "option") {
      modifiers?.push("alt");
    }
  });

  useKeyboardShortcut(key, handler, { modifiers, enabled });
}

export function useEscapeKey(handler: () => void, enabled = true) {
  useKeyboardShortcut("Escape", handler, { enabled, allowInInput: true });
}

export function useArrowKeys(
  handlers: {
    up?: () => void;
    down?: () => void;
    left?: () => void;
    right?: () => void;
  },
  enabled = true,
) {
  const _handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const _handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const _target = event?.target as HTMLElement;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.contentEditable === "true"
      ) {
        return;
      }

      switch (event?.key) {
        case "ArrowUp":
          if (handlersRef?.current.up) {
            event?.preventDefault();
            handlersRef?.current.up();
          }
          break;
        case "ArrowDown":
          if (handlersRef?.current.down) {
            event?.preventDefault();
            handlersRef?.current.down();
          }
          break;
        case "ArrowLeft":
          if (handlersRef?.current.left) {
            event?.preventDefault();
            handlersRef?.current.left();
          }
          break;
        case "ArrowRight":
          if (handlersRef?.current.right) {
            event?.preventDefault();
            handlersRef?.current.right();
          }
          break;
      }
    },
    [enabled],
  );

  useEffect(() => {
    window?.addEventListener("keydown", handleKeyDown);
    return () => window?.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export function useKeyPress(targetKey: string) {
  const [isPressed, setIsPressed] = useState(false);

  useEffect(() => {
    const _handleKeyDown = (event: KeyboardEvent) => {
      if (event?.key === targetKey) {
        setIsPressed(true);
      }
    };

    const _handleKeyUp = (event: KeyboardEvent) => {
      if (event?.key === targetKey) {
        setIsPressed(false);
      }
    };

    window?.addEventListener("keydown", handleKeyDown);
    window?.addEventListener("keyup", handleKeyUp);

    return () => {
      window?.removeEventListener("keydown", handleKeyDown);
      window?.removeEventListener("keyup", handleKeyUp);
    };
  }, [targetKey]);

  return isPressed;
}

export function useModifierKeys() {
  const [modifiers, setModifiers] = useState({
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
  });

  useEffect(() => {
    const _handleKeyDown = (event: KeyboardEvent) => {
      setModifiers({
        ctrl: event?.ctrlKey,
        shift: event?.shiftKey,
        alt: event?.altKey,
        meta: event?.metaKey,
      });
    };

    const _handleKeyUp = (event: KeyboardEvent) => {
      setModifiers({
        ctrl: event?.ctrlKey,
        shift: event?.shiftKey,
        alt: event?.altKey,
        meta: event?.metaKey,
      });
    };

    window?.addEventListener("keydown", handleKeyDown);
    window?.addEventListener("keyup", handleKeyUp);

    return () => {
      window?.removeEventListener("keydown", handleKeyDown);
      window?.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return modifiers;
}

export default useKeyboardShortcut;
