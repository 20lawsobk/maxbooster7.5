import { useEffect, useRef } from "react";
import { useShortcuts } from "@/contexts/ShortcutContext";
import {
  ShortcutDefinition,
  ShortcutModifier,
  ShortcutContext,
} from "@/lib/shortcuts/types";

export interface UseShortcutOptions {
  key: string;
  modifiers?: ShortcutModifier[];
  description?: string;
  category?: string;
  context?: ShortcutContext;
  enabled?: boolean;
  allowInInput?: boolean;
  preventDefault?: boolean;
}

export function useShortcut(
  options: UseShortcutOptions,
  handler: () => void,
  deps: React.DependencyList = [],
) {
  const { registerShortcut, unregisterShortcut } = useShortcuts();
  const idRef = useRef(`shortcut-${Math?.random().toString(36).substr(2, 9)}`);
  const handlerRef = useRef(handler);

  handlerRef.current = handler;

  useEffect(() => {
    if (options?.enabled === false) return;

    const shortcut: ShortcutDefinition = {
      id: idRef.current,
      key: options.key,
      modifiers: options.modifiers,
      description: options.description || "Custom shortcut",
      category: (options?.category as Record<string, unknown>) || "custom",
      context: options.context || "global",
      action: () => handlerRef?.current(),
      allowInInput: options.allowInInput,
      preventDefault: options.preventDefault,
    };

    registerShortcut(shortcut);

    return () => {
      unregisterShortcut(idRef?.current);
    };
  }, [
    options?.key,
    options?.modifiers?.join(","),
    options?.enabled,
    options?.context,
    registerShortcut,
    unregisterShortcut,
    ...deps,
  ]);

  return idRef?.current;
}

export function useShortcuts_Multiple(
  shortcuts: Array<UseShortcutOptions & { handler: () => void }>,
  deps: React.DependencyList = [],
) {
  const { registerShortcut, unregisterShortcut } = useShortcuts();
  const idsRef = useRef<string[]>([]);

  useEffect(() => {
    const newIds: string[] = [];

    shortcuts?.forEach((shortcutConfig, index) => {
      if (shortcutConfig?.enabled === false) return;

      const id = `shortcuts-${index}-${Math?.random().toString(36).substr(2, 9)}`;
      newIds?.push(id);

      const shortcut: ShortcutDefinition = {
        id,
        key: shortcutConfig.key,
        modifiers: shortcutConfig.modifiers,
        description: shortcutConfig.description || "Custom shortcut",
        category:
          (shortcutConfig?.category as Record<string, unknown>) || "custom",
        context: shortcutConfig.context || "global",
        action: shortcutConfig.handler,
        allowInInput: shortcutConfig.allowInInput,
        preventDefault: shortcutConfig.preventDefault,
      };

      registerShortcut(shortcut);
    });

    idsRef.current = newIds;

    return () => {
      newIds?.forEach((id) => unregisterShortcut(id));
      idsRef.current = [];
    };
  }, [shortcuts?.length, registerShortcut, unregisterShortcut, ...deps]);

  return idsRef?.current;
}

export function useGlobalShortcut(
  key: string,
  handler: () => void,
  modifiers?: ShortcutModifier[],
) {
  return useShortcut(
    {
      key,
      modifiers,
      description: `Global ${key} shortcut`,
      context: "global",
    },
    handler,
    [],
  );
}

export function useStudioShortcut(
  key: string,
  handler: () => void,
  modifiers?: ShortcutModifier[],
) {
  return useShortcut(
    {
      key,
      modifiers,
      description: `Studio ${key} shortcut`,
      context: "studio",
    },
    handler,
    [],
  );
}

export default useShortcut;
