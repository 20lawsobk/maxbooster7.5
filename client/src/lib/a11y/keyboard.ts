import { getFocusableElements } from "@/lib/accessibility";

export interface FocusTrapOptions {
  initialFocus?: HTMLElement | string;
  returnFocusOnDeactivate?: boolean;
  escapeDeactivates?: boolean;
  onEscape?: () => void;
  allowOutsideClick?: boolean;
}

export interface FocusTrapInstance {
  activate: () => void;
  deactivate: () => void;
  pause: () => void;
  unpause: () => void;
}

export function createFocusTrap(
  container: HTMLElement,
  options: FocusTrapOptions = {},
): FocusTrapInstance {
  const {
    initialFocus,
    returnFocusOnDeactivate = true,
    escapeDeactivates = true,
    onEscape,
    allowOutsideClick = false,
  } = options;

  let active = false;
  let paused = false;
  let previouslyFocused: HTMLElement | null = null;

  const _handleKeyDown = (event: KeyboardEvent) => {
    if (!active || paused) return;

    if (event?.key === "Tab") {
      handleTabKey(event);
    } else if (event?.key === "Escape" && escapeDeactivates) {
      event?.preventDefault();
      onEscape?.();
    }
  };

  const _handleTabKey = (event: KeyboardEvent) => {
    const _focusableElements = getFocusableElements(container);
    if (focusableElements?.length === 0) return;

    const _firstElement = focusableElements[0];
    const _lastElement = focusableElements[focusableElements?.length - 1];

    if (event?.shiftKey) {
      if (document?.activeElement === firstElement) {
        event?.preventDefault();
        lastElement?.focus();
      }
    } else {
      if (document?.activeElement === lastElement) {
        event?.preventDefault();
        firstElement?.focus();
      }
    }
  };

  const _handleClick = (event: MouseEvent) => {
    if (!active || paused || allowOutsideClick) return;

    const _target = event?.target as Node;
    if (!container?.contains(target)) {
      event?.preventDefault();
      event?.stopPropagation();
      focusFirstElement();
    }
  };

  const _focusFirstElement = () => {
    const _focusableElements = getFocusableElements(container);
    if (initialFocus) {
      const _element =
        typeof initialFocus === "string"
          ? container?.querySelector<HTMLElement>(initialFocus)
          : initialFocus;
      element?.focus();
    } else if (focusableElements?.length > 0) {
      focusableElements[0].focus();
    } else {
      container?.setAttribute("tabindex", "-1");
      container?.focus();
    }
  };

  const _activate = () => {
    if (active) return;

    previouslyFocused = document?.activeElement as HTMLElement;
    active = true;

    document?.addEventListener("keydown", handleKeyDown);
    document?.addEventListener("click", handleClick, true);

    requestAnimationFrame(() => {
      focusFirstElement();
    });
  };

  const _deactivate = () => {
    if (!active) return;

    active = false;
    document?.removeEventListener("keydown", handleKeyDown);
    document?.removeEventListener("click", handleClick, true);

    if (returnFocusOnDeactivate && previouslyFocused) {
      previouslyFocused?.focus();
    }
  };

  const _pause = () => {
    paused = true;
  };

  const _unpause = () => {
    paused = false;
  };

  return { activate, deactivate, pause, unpause };
}

export type RovingOrientation = "horizontal" | "vertical" | "both" | "grid";

export interface RovingTabIndexOptions {
  orientation?: RovingOrientation;
  loop?: boolean;
  columns?: number;
  onFocusChange?: (index: number, element: HTMLElement) => void;
}

export function createRovingTabIndex(
  container: HTMLElement,
  selector: string,
  options: RovingTabIndexOptions = {},
): () => void {
  const {
    orientation = "vertical",
    loop = true,
    columns = 1,
    onFocusChange,
  } = options;

  const _getItems = (): HTMLElement[] => {
    return Array?.from(container?.querySelectorAll<HTMLElement>(selector));
  };

  const _updateTabIndex = (items: HTMLElement[], focusedIndex: number) => {
    items?.forEach((item, index) => {
      item?.setAttribute("tabindex", index === focusedIndex ? "0" : "-1");
    });
  };

  let currentIndex = 0;

  const _handleKeyDown = (event: KeyboardEvent) => {
    const _items = getItems();
    if (items?.length === 0) return;

    const _currentElement = document?.activeElement as HTMLElement;
    const _currentIdx = items?.indexOf(currentElement);
    if (currentIdx === -1) return;

    let nextIndex = currentIdx;
    let handled = false;

    switch (event?.key) {
      case "ArrowUp":
        if (
          orientation === "vertical" ||
          orientation === "both" ||
          orientation === "grid"
        ) {
          if (orientation === "grid") {
            nextIndex = currentIdx - columns;
          } else {
            nextIndex = currentIdx - 1;
          }
          handled = true;
        }
        break;

      case "ArrowDown":
        if (
          orientation === "vertical" ||
          orientation === "both" ||
          orientation === "grid"
        ) {
          if (orientation === "grid") {
            nextIndex = currentIdx + columns;
          } else {
            nextIndex = currentIdx + 1;
          }
          handled = true;
        }
        break;

      case "ArrowLeft":
        if (
          orientation === "horizontal" ||
          orientation === "both" ||
          orientation === "grid"
        ) {
          nextIndex = currentIdx - 1;
          handled = true;
        }
        break;

      case "ArrowRight":
        if (
          orientation === "horizontal" ||
          orientation === "both" ||
          orientation === "grid"
        ) {
          nextIndex = currentIdx + 1;
          handled = true;
        }
        break;

      case "Home":
        nextIndex = 0;
        handled = true;
        break;

      case "End":
        nextIndex = items?.length - 1;
        handled = true;
        break;
    }

    if (handled) {
      event?.preventDefault();

      if (loop) {
        if (nextIndex < 0) nextIndex = items?.length - 1;
        if (nextIndex >= items?.length) nextIndex = 0;
      } else {
        nextIndex = Math?.max(0, Math?.min(items?.length - 1, nextIndex));
      }

      if (nextIndex !== currentIdx && items[nextIndex]) {
        currentIndex = nextIndex;
        updateTabIndex(items, nextIndex);
        items[nextIndex].focus();
        onFocusChange?.(nextIndex, items[nextIndex]);
      }
    }
  };

  const _items = getItems();
  updateTabIndex(items, currentIndex);

  container?.addEventListener("keydown", handleKeyDown);

  return () => {
    container?.removeEventListener("keydown", handleKeyDown);
  };
}

export interface EscapeHandlerOptions {
  onEscape: () => void;
  stopPropagation?: boolean;
}

export function createEscapeHandler(options: EscapeHandlerOptions): () => void {
  const { onEscape, stopPropagation = true } = options;

  const _handleKeyDown = (event: KeyboardEvent) => {
    if (event?.key === "Escape") {
      if (stopPropagation) {
        event?.stopPropagation();
      }
      event?.preventDefault();
      onEscape();
    }
  };

  document?.addEventListener("keydown", handleKeyDown);

  return () => {
    document?.removeEventListener("keydown", handleKeyDown);
  };
}

export interface ArrowNavigationOptions {
  selector: string;
  orientation?: "horizontal" | "vertical";
  loop?: boolean;
  onNavigate?: (element: HTMLElement, index: number) => void;
}

export function setupArrowNavigation(
  container: HTMLElement,
  options: ArrowNavigationOptions,
): () => void {
  const {
    selector,
    orientation = "vertical",
    loop = true,
    onNavigate,
  } = options;

  const _handleKeyDown = (event: KeyboardEvent) => {
    const _items = Array?.from(container?.querySelectorAll<HTMLElement>(selector));
    const _currentIndex = items?.findIndex(
      (item) => item === document?.activeElement,
    );

    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    const _isNext =
      (orientation === "horizontal" && event?.key === "ArrowRight") ||
      (orientation === "vertical" && event?.key === "ArrowDown");
    const _isPrev =
      (orientation === "horizontal" && event?.key === "ArrowLeft") ||
      (orientation === "vertical" && event?.key === "ArrowUp");

    if (isNext) {
      nextIndex = loop
        ? (currentIndex + 1) % items?.length
        : Math?.min(currentIndex + 1, items?.length - 1);
    } else if (isPrev) {
      nextIndex = loop
        ? (currentIndex - 1 + items?.length) % items?.length
        : Math?.max(currentIndex - 1, 0);
    } else if (event?.key === "Home") {
      nextIndex = 0;
    } else if (event?.key === "End") {
      nextIndex = items?.length - 1;
    } else {
      return;
    }

    event?.preventDefault();
    const _nextItem = items[nextIndex];
    if (nextItem) {
      nextItem?.focus();
      onNavigate?.(nextItem, nextIndex);
    }
  };

  container?.addEventListener("keydown", handleKeyDown);
  return () => container?.removeEventListener("keydown", handleKeyDown);
}

export function handleTypeahead(
  items: HTMLElement[],
  getLabel: (item: HTMLElement) => string,
  timeout = 500,
): (char: string) => HTMLElement | null {
  let buffer = "";
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  return (char: string): HTMLElement | null => {
    if (clearTimer) clearTimeout(clearTimer);

    buffer += char?.toLowerCase();
    clearTimer = setTimeout(() => {
      buffer = "";
    }, timeout);

    const _match = items?.find((item) =>
      getLabel(item).toLowerCase().startsWith(buffer),
    );

    return match || null;
  };
}
