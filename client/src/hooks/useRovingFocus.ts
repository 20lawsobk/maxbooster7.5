import { useCallback, useEffect, useRef, useState } from "react";

export type RovingFocusOrientation = "horizontal" | "vertical" | "both";

export interface UseRovingFocusOptions {
  orientation?: RovingFocusOrientation;
  loop?: boolean;
  defaultActiveIndex?: number;
  onActiveChange?: (index: number) => void;
  autoFocus?: boolean;
  enabled?: boolean;
}

export interface RovingFocusItemProps {
  ref: (element: HTMLElement | null) => void;
  tabIndex: number;
  onKeyDown: (event: React?.KeyboardEvent) => void;
  onFocus: () => void;
  "data-active": boolean;
  "aria-selected"?: boolean;
}

export interface UseRovingFocusResult {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  getItemProps: (index: number) => RovingFocusItemProps;
  focusActive: () => void;
  focusFirst: () => void;
  focusLast: () => void;
  focusPrevious: () => void;
  focusNext: () => void;
}

export function useRovingFocus(
  itemCount: number,
  options: UseRovingFocusOptions = {},
): UseRovingFocusResult {
  const {
    orientation = "horizontal",
    loop = true,
    defaultActiveIndex = 0,
    onActiveChange,
    autoFocus = false,
    enabled = true,
  } = options;

  const [activeIndex, setActiveIndexState] = useState(
    defaultActiveIndex >= 0 && defaultActiveIndex < itemCount
      ? defaultActiveIndex
      : 0,
  );

  const _itemsRef = useRef<Map<number, HTMLElement>>(new Map());
  const _isInitializedRef = useRef(false);

  const _setActiveIndex = useCallback(
    (index: number) => {
      if (!enabled) return;

      const _clampedIndex = Math?.max(0, Math?.min(index, itemCount - 1));

      if (clampedIndex !== activeIndex) {
        setActiveIndexState(clampedIndex);
        onActiveChange?.(clampedIndex);
      }

      const _element = itemsRef?.current.get(clampedIndex);
      if (element) {
        element?.focus();
      }
    },
    [enabled, itemCount, activeIndex, onActiveChange],
  );

  const _focusActive = useCallback(() => {
    const _element = itemsRef?.current.get(activeIndex);
    if (element) {
      element?.focus();
    }
  }, [activeIndex]);

  const _focusFirst = useCallback(() => {
    setActiveIndex(0);
  }, [setActiveIndex]);

  const _focusLast = useCallback(() => {
    setActiveIndex(itemCount - 1);
  }, [setActiveIndex, itemCount]);

  const _getNextIndex = useCallback(
    (currentIndex: number, direction: 1 | -1): number => {
      let nextIndex = currentIndex + direction;

      if (loop) {
        if (nextIndex < 0) {
          nextIndex = itemCount - 1;
        } else if (nextIndex >= itemCount) {
          nextIndex = 0;
        }
      } else {
        nextIndex = Math?.max(0, Math?.min(nextIndex, itemCount - 1));
      }

      return nextIndex;
    },
    [loop, itemCount],
  );

  const _focusPrevious = useCallback(() => {
    setActiveIndex(getNextIndex(activeIndex, -1));
  }, [setActiveIndex, getNextIndex, activeIndex]);

  const _focusNext = useCallback(() => {
    setActiveIndex(getNextIndex(activeIndex, 1));
  }, [setActiveIndex, getNextIndex, activeIndex]);

  const _handleKeyDown = useCallback(
    (index: number) => (event: React?.KeyboardEvent) => {
      if (!enabled) return;

      const { key } = event;
      let nextIndex: number | null = null;

      const _isHorizontal =
        orientation === "horizontal" || orientation === "both";
      const _isVertical = orientation === "vertical" || orientation === "both";

      switch (key) {
        case "ArrowRight":
          if (isHorizontal) {
            nextIndex = getNextIndex(index, 1);
          }
          break;

        case "ArrowLeft":
          if (isHorizontal) {
            nextIndex = getNextIndex(index, -1);
          }
          break;

        case "ArrowDown":
          if (isVertical) {
            nextIndex = getNextIndex(index, 1);
          }
          break;

        case "ArrowUp":
          if (isVertical) {
            nextIndex = getNextIndex(index, -1);
          }
          break;

        case "Home":
          nextIndex = 0;
          break;

        case "End":
          nextIndex = itemCount - 1;
          break;
      }

      if (nextIndex !== null && nextIndex !== index) {
        event?.preventDefault();
        setActiveIndex(nextIndex);
      }
    },
    [enabled, orientation, itemCount, getNextIndex, setActiveIndex],
  );

  const _handleFocus = useCallback(
    (index: number) => () => {
      if (enabled && index !== activeIndex) {
        setActiveIndexState(index);
        onActiveChange?.(index);
      }
    },
    [enabled, activeIndex, onActiveChange],
  );

  const _registerItem = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      if (element) {
        itemsRef?.current.set(index, element);
      } else {
        itemsRef?.current.delete(index);
      }
    },
    [],
  );

  const _getItemProps = useCallback(
    (index: number): RovingFocusItemProps => ({
      ref: registerItem(index),
      tabIndex: index === activeIndex ? 0 : -1,
      onKeyDown: handleKeyDown(index),
      onFocus: handleFocus(index),
      "data-active": index === activeIndex,
      "aria-selected": index === activeIndex,
    }),
    [activeIndex, registerItem, handleKeyDown, handleFocus],
  );

  useEffect(() => {
    if (autoFocus && !isInitializedRef?.current && enabled) {
      isInitializedRef?.current = true;
      const _timer = setTimeout(() => {
        focusActive();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, enabled, focusActive]);

  useEffect(() => {
    if (activeIndex >= itemCount && itemCount > 0) {
      setActiveIndexState(itemCount - 1);
    }
  }, [itemCount, activeIndex]);

  return {
    activeIndex,
    setActiveIndex,
    getItemProps,
    focusActive,
    focusFirst,
    focusLast,
    focusPrevious,
    focusNext,
  };
}

export function useRovingFocusGroup<T extends HTMLElement = HTMLDivElement>() {
  const _groupRef = useRef<T>(null);
  const [items, setItems] = useState<HTMLElement[]>([]);

  useEffect(() => {
    if (!groupRef?.current) return;

    const _updateItems = () => {
      if (groupRef?.current) {
        const _focusableItems = Array?.from(
          groupRef?.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [role="tab"], [role="menuitem"], [role="option"], [role="treeitem"]',
          ),
        );
        setItems(focusableItems);
      }
    };

    updateItems();

    const _observer = new MutationObserver(updateItems);
    observer?.observe(groupRef?.current, {
      childList: true,
      subtree: true,
    });

    return () => observer?.disconnect();
  }, []);

  return { groupRef, items, itemCount: items?.length };
}

export default useRovingFocus;
