import { useCallback, useEffect, useRef, useState } from 'react';

export type RovingOrientation = 'horizontal' | 'vertical' | 'both';

export interface UseRovingTabIndexOptions {
  orientation?: RovingOrientation;
  loop?: boolean;
  defaultActiveIndex?: number;
  onActiveChange?: (index: number) => void;
  autoFocus?: boolean;
  enabled?: boolean;
}

export interface RovingTabIndexItem {
  ref: (element: HTMLElement | null) => void;
  tabIndex: number;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onFocus: () => void;
  'data-active': boolean;
}

export interface UseRovingTabIndexResult {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  getItemProps: (index: number) => RovingTabIndexItem;
  focusActive: () => void;
  focusFirst: () => void;
  focusLast: () => void;
}

export function useRovingTabIndex(
  itemCount: number,
  options: UseRovingTabIndexOptions = {}
): UseRovingTabIndexResult {
  const {
    orientation = 'horizontal',
    loop = true,
    defaultActiveIndex = 0,
    onActiveChange,
    autoFocus = false,
    enabled = true,
  } = options;

  const [activeIndex, setActiveIndexState] = useState(
    defaultActiveIndex >= 0 && defaultActiveIndex < itemCount ? defaultActiveIndex : 0
  );
  
  const itemsRef = useRef<Map<number, HTMLElement>>(new Map());
  const isInitializedRef = useRef(false);

  const setActiveIndex = useCallback(
    (index: number) => {
      if (!enabled) return;
      
      const clampedIndex = Math.max(0, Math.min(index, itemCount - 1));
      
      if (clampedIndex !== activeIndex) {
        setActiveIndexState(clampedIndex);
        onActiveChange?.(clampedIndex);
      }
      
      const element = itemsRef.current.get(clampedIndex);
      if (element) {
        element.focus();
      }
    },
    [enabled, itemCount, activeIndex, onActiveChange]
  );

  const focusActive = useCallback(() => {
    const element = itemsRef.current.get(activeIndex);
    if (element) {
      element.focus();
    }
  }, [activeIndex]);

  const focusFirst = useCallback(() => {
    setActiveIndex(0);
  }, [setActiveIndex]);

  const focusLast = useCallback(() => {
    setActiveIndex(itemCount - 1);
  }, [setActiveIndex, itemCount]);

  const getNextIndex = useCallback(
    (currentIndex: number, direction: 1 | -1): number => {
      let nextIndex = currentIndex + direction;

      if (loop) {
        if (nextIndex < 0) {
          nextIndex = itemCount - 1;
        } else if (nextIndex >= itemCount) {
          nextIndex = 0;
        }
      } else {
        nextIndex = Math.max(0, Math.min(nextIndex, itemCount - 1));
      }

      return nextIndex;
    },
    [loop, itemCount]
  );

  const handleKeyDown = useCallback(
    (index: number) => (event: React.KeyboardEvent) => {
      if (!enabled) return;

      const { key } = event;
      let nextIndex: number | null = null;

      const isHorizontal = orientation === 'horizontal' || orientation === 'both';
      const isVertical = orientation === 'vertical' || orientation === 'both';

      switch (key) {
        case 'ArrowRight':
          if (isHorizontal) {
            nextIndex = getNextIndex(index, 1);
          }
          break;

        case 'ArrowLeft':
          if (isHorizontal) {
            nextIndex = getNextIndex(index, -1);
          }
          break;

        case 'ArrowDown':
          if (isVertical) {
            nextIndex = getNextIndex(index, 1);
          }
          break;

        case 'ArrowUp':
          if (isVertical) {
            nextIndex = getNextIndex(index, -1);
          }
          break;

        case 'Home':
          nextIndex = 0;
          break;

        case 'End':
          nextIndex = itemCount - 1;
          break;
      }

      if (nextIndex !== null && nextIndex !== index) {
        event.preventDefault();
        setActiveIndex(nextIndex);
      }
    },
    [enabled, orientation, itemCount, getNextIndex, setActiveIndex]
  );

  const handleFocus = useCallback(
    (index: number) => () => {
      if (enabled && index !== activeIndex) {
        setActiveIndexState(index);
        onActiveChange?.(index);
      }
    },
    [enabled, activeIndex, onActiveChange]
  );

  const registerItem = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      if (element) {
        itemsRef.current.set(index, element);
      } else {
        itemsRef.current.delete(index);
      }
    },
    []
  );

  const getItemProps = useCallback(
    (index: number): RovingTabIndexItem => ({
      ref: registerItem(index),
      tabIndex: index === activeIndex ? 0 : -1,
      onKeyDown: handleKeyDown(index),
      onFocus: handleFocus(index),
      'data-active': index === activeIndex,
    }),
    [activeIndex, registerItem, handleKeyDown, handleFocus]
  );

  useEffect(() => {
    if (autoFocus && !isInitializedRef.current && enabled) {
      isInitializedRef.current = true;
      const timer = setTimeout(() => {
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
  };
}

export function useRovingTabIndexGroup<T extends HTMLElement = HTMLDivElement>() {
  const groupRef = useRef<T>(null);
  const [items, setItems] = useState<HTMLElement[]>([]);

  useEffect(() => {
    if (!groupRef.current) return;

    const observer = new MutationObserver(() => {
      if (groupRef.current) {
        const focusableItems = Array.from(
          groupRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [role="tab"], [role="menuitem"], [role="option"]'
          )
        );
        setItems(focusableItems);
      }
    });

    observer.observe(groupRef.current, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return { groupRef, items, itemCount: items.length };
}

export default useRovingTabIndex;
