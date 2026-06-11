import { useState, useCallback, useEffect, useRef } from "react";
import { ContextMenuItem } from "@/components/commands/ContextMenu";

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  context?: string;
}

export interface UseContextMenuOptions {
  items?: ContextMenuItem[];
  onOpen?: (x: number, y: number) => void;
  onClose?: () => void;
  onAction?: (itemId: string) => void;
  disabled?: boolean;
}

export function useContextMenu(options: UseContextMenuOptions = {}) {
  const { items = [], onOpen, onClose, onAction, disabled = false } = options;
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  });

  const open = useCallback(
    (
      x: number,
      y: number,
      customItems?: ContextMenuItem[],
      context?: string,
    ) => {
      if (disabled) return;

      setState({
        isOpen: true,
        x,
        y,
        items: customItems || items,
        context,
      });
      onOpen?.(x, y);
    },
    [items, disabled, onOpen],
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    onClose?.();
  }, [onClose]);

  const handleAction = useCallback(
    (itemId: string) => {
      onAction?.(itemId);
    },
    [onAction],
  );

  const handleContextMenu = useCallback(
    (
      e: React.MouseEvent,
      customItems?: ContextMenuItem[],
      context?: string,
    ) => {
      e?.preventDefault();
      e?.stopPropagation();
      open(e?.clientX, e?.clientY, customItems, context);
    },
    [open],
  );

  const getContextMenuProps = useCallback(
    (customItems?: ContextMenuItem[], context?: string) => ({
      onContextMenu: (e: React.MouseEvent) =>
        handleContextMenu(e, customItems, context),
    }),
    [handleContextMenu],
  );

  return {
    ...state,
    open,
    close,
    handleAction,
    handleContextMenu,
    getContextMenuProps,
  };
}

export function useContextMenuTarget<T extends HTMLElement = HTMLDivElement>(
  options: UseContextMenuOptions = {},
) {
  const ref = useRef<T>(null);
  const menu = useContextMenu(options);

  useEffect(() => {
    const element = ref?.current;
    if (!element || options?.disabled) return;

    const handleContextMenu = (e: MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      menu?.open(e?.clientX, e?.clientY);
    };

    element?.addEventListener("contextmenu", handleContextMenu);

    return () => {
      element?.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [menu?.open, options?.disabled]);

  return {
    ref,
    ...menu,
  };
}

export function useGlobalContextMenu() {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  });

  const show = useCallback(
    (x: number, y: number, items: ContextMenuItem[], context?: string) => {
      setState({
        isOpen: true,
        x,
        y,
        items,
        context,
      });
    },
    [],
  );

  const hide = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e?.key === "Escape" && state?.isOpen) {
        hide();
      }
    };

    window?.addEventListener("keydown", handleEscape);
    return () => window?.removeEventListener("keydown", handleEscape);
  }, [state?.isOpen, hide]);

  return {
    ...state,
    show,
    hide,
  };
}

export default useContextMenu;
