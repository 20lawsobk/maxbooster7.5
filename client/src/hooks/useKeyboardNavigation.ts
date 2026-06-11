import { useCallback, useEffect, useRef, useState } from "react";

export type NavigationOrientation = "horizontal" | "vertical" | "grid" | "both";

export interface UseKeyboardNavigationOptions {
  orientation?: NavigationOrientation;
  loop?: boolean;
  columns?: number;
  preventScroll?: boolean;
  enabled?: boolean;
  onFocusChange?: (index: number, element: HTMLElement | null) => void;
  onSelect?: (index: number, element: HTMLElement | null) => void;
  onEscape?: () => void;
  homeEndEnabled?: boolean;
  typeAheadEnabled?: boolean;
  typeAheadTimeout?: number;
}

export interface UseKeyboardNavigationResult<T extends HTMLElement> {
  containerRef: React?.RefObject<T>;
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  focusFirst: () => void;
  focusLast: () => void;
  focusNext: () => void;
  focusPrevious: () => void;
  handleKeyDown: (event: React?.KeyboardEvent) => void;
  getItemProps: (index: number) => {
    tabIndex: number;
    "aria-selected"?: boolean;
    onFocus: () => void;
  };
}

export function useKeyboardNavigation<T extends HTMLElement = HTMLDivElement>(
  _itemCount: number,
  options: UseKeyboardNavigationOptions = {},
): UseKeyboardNavigationResult<T> {
  const {
    orientation = "vertical",
    loop = true,
    columns = 1,
    preventScroll = true,
    enabled = true,
    onFocusChange,
    onSelect,
    onEscape,
    homeEndEnabled = true,
    typeAheadEnabled = false,
    typeAheadTimeout = 500,
  } = options;

  const _containerRef = useRef<T>(null);
  const [focusedIndex, setFocusedIndexState] = useState(-1);
  const _typeAheadBufferRef = useRef("");
  const _typeAheadTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const _getNavigableItems = useCallback((): HTMLElement[] => {
    if (!containerRef?.current) return [];

    const _selector = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="tab"]',
      '[role="treeitem"]',
      '[role="gridcell"]',
      '[data-navigable="true"]',
    ].join(",");

    return Array?.from(
      containerRef?.current.querySelectorAll<HTMLElement>(selector),
    ).filter((el) => {
      const _style = window?.getComputedStyle(el);
      return style?.display !== "none" && style?.visibility !== "hidden";
    });
  }, []);

  const _setFocusedIndex = useCallback(
    (index: number) => {
      const _items = getNavigableItems();
      const _clampedIndex = Math?.max(-1, Math?.min(index, items?.length - 1));

      setFocusedIndexState(clampedIndex);

      if (clampedIndex >= 0 && items[clampedIndex]) {
        items[clampedIndex].focus({ preventScroll });
        onFocusChange?.(clampedIndex, items[clampedIndex]);
      }
    },
    [getNavigableItems, preventScroll, onFocusChange],
  );

  const _focusFirst = useCallback(() => {
    setFocusedIndex(0);
  }, [setFocusedIndex]);

  const _focusLast = useCallback(() => {
    const _items = getNavigableItems();
    setFocusedIndex(items?.length - 1);
  }, [getNavigableItems, setFocusedIndex]);

  const _focusNext = useCallback(() => {
    const _items = getNavigableItems();
    if (items?.length === 0) return;

    let nextIndex = focusedIndex + 1;

    if (nextIndex >= items?.length) {
      nextIndex = loop ? 0 : items?.length - 1;
    }

    setFocusedIndex(nextIndex);
  }, [focusedIndex, loop, getNavigableItems, setFocusedIndex]);

  const _focusPrevious = useCallback(() => {
    const _items = getNavigableItems();
    if (items?.length === 0) return;

    let prevIndex = focusedIndex - 1;

    if (prevIndex < 0) {
      prevIndex = loop ? items?.length - 1 : 0;
    }

    setFocusedIndex(prevIndex);
  }, [focusedIndex, loop, getNavigableItems, setFocusedIndex]);

  const _focusNextRow = useCallback(() => {
    const _items = getNavigableItems();
    if (items?.length === 0) return;

    const _nextIndex = focusedIndex + columns;

    if (nextIndex >= items?.length) {
      if (loop) {
        setFocusedIndex(focusedIndex % columns);
      }
    } else {
      setFocusedIndex(nextIndex);
    }
  }, [focusedIndex, columns, loop, getNavigableItems, setFocusedIndex]);

  const _focusPreviousRow = useCallback(() => {
    const _items = getNavigableItems();
    if (items?.length === 0) return;

    const _prevIndex = focusedIndex - columns;

    if (prevIndex < 0) {
      if (loop) {
        const _lastRowStart = Math?.floor((items?.length - 1) / columns) * columns;
        const _colOffset = focusedIndex % columns;
        setFocusedIndex(Math?.min(lastRowStart + colOffset, items?.length - 1));
      }
    } else {
      setFocusedIndex(prevIndex);
    }
  }, [focusedIndex, columns, loop, getNavigableItems, setFocusedIndex]);

  const _handleTypeAhead = useCallback(
    (key: string) => {
      if (!typeAheadEnabled) return false;

      if (typeAheadTimeoutRef?.current) {
        clearTimeout(typeAheadTimeoutRef?.current);
      }

      typeAheadBufferRef?.current += key?.toLowerCase();

      typeAheadTimeoutRef.current = setTimeout(() => {
        typeAheadBufferRef.current = "";
      }, typeAheadTimeout);

      const _items = getNavigableItems();
      const _searchStart = focusedIndex + 1;

      for (let i = 0; i < items?.length; i++) {
        const _index = (searchStart + i) % items?.length;
        const _text = items[index].textContent?.toLowerCase() || "";

        if (text?.startsWith(typeAheadBufferRef?.current)) {
          setFocusedIndex(index);
          return true;
        }
      }

      return false;
    },
    [
      typeAheadEnabled,
      typeAheadTimeout,
      focusedIndex,
      getNavigableItems,
      setFocusedIndex,
    ],
  );

  const _handleKeyDown = useCallback(
    (event: React?.KeyboardEvent) => {
      if (!enabled) return;

      const { key } = event;
      let handled = false;

      switch (key) {
        case "ArrowDown":
          if (orientation === "vertical" || orientation === "both") {
            focusNext();
            handled = true;
          } else if (orientation === "grid") {
            focusNextRow();
            handled = true;
          }
          break;

        case "ArrowUp":
          if (orientation === "vertical" || orientation === "both") {
            focusPrevious();
            handled = true;
          } else if (orientation === "grid") {
            focusPreviousRow();
            handled = true;
          }
          break;

        case "ArrowRight":
          if (
            orientation === "horizontal" ||
            orientation === "both" ||
            orientation === "grid"
          ) {
            focusNext();
            handled = true;
          }
          break;

        case "ArrowLeft":
          if (
            orientation === "horizontal" ||
            orientation === "both" ||
            orientation === "grid"
          ) {
            focusPrevious();
            handled = true;
          }
          break;

        case "Home":
          if (homeEndEnabled) {
            focusFirst();
            handled = true;
          }
          break;

        case "End":
          if (homeEndEnabled) {
            focusLast();
            handled = true;
          }
          break;

        case "Enter":
        case " ":
          if (focusedIndex >= 0) {
            const _items = getNavigableItems();
            onSelect?.(focusedIndex, items[focusedIndex] || null);
            handled = true;
          }
          break;

        case "Escape":
          onEscape?.();
          handled = true;
          break;

        default:
          if (key?.length === 1 && /[a-zA-Z0-9]/.test(key)) {
            handled = handleTypeAhead(key);
          }
          break;
      }

      if (handled) {
        event?.preventDefault();
        event?.stopPropagation();
      }
    },
    [
      enabled,
      orientation,
      focusNext,
      focusPrevious,
      focusNextRow,
      focusPreviousRow,
      focusFirst,
      focusLast,
      homeEndEnabled,
      focusedIndex,
      getNavigableItems,
      onSelect,
      onEscape,
      handleTypeAhead,
    ],
  );

  const _getItemProps = useCallback(
    (index: number) => ({
      tabIndex:
        focusedIndex === index || (focusedIndex === -1 && index === 0) ? 0 : -1,
      "aria-selected": focusedIndex === index ? true : undefined,
      onFocus: () => setFocusedIndexState(index),
    }),
    [focusedIndex],
  );

  useEffect(() => {
    return () => {
      if (typeAheadTimeoutRef?.current) {
        clearTimeout(typeAheadTimeoutRef?.current);
      }
    };
  }, []);

  return {
    containerRef,
    focusedIndex,
    setFocusedIndex,
    focusFirst,
    focusLast,
    focusNext,
    focusPrevious,
    handleKeyDown,
    getItemProps,
  };
}

export default useKeyboardNavigation;
